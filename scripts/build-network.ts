#!/usr/bin/env tsx
/**
 * scripts/build-network.ts
 *
 * Downloads PID GTFS and produces public/network.json containing:
 *   metro — routes with shape points [x, y, dist_m] for vehicle interpolation
 *   tram  — routes with shape points [x, y] (RDP-simplified, no dist needed)
 *
 * Run: npm run build:network
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const GTFS_URL = 'https://data.pid.cz/PID_GTFS.zip'

// Known Prague metro station names (57 stations across lines A, B, C).
// Used to filter GTFS stops precisely — proximity alone catches too many bus stops.
const METRO_STATION_NAMES = new Set([
  // Line C
  'Letňany', 'Střížkov', 'Prosek', 'Ládví', 'Kobylisy',
  'Nádraží Holešovice', 'Vltavská', 'Florenc', 'Hlavní nádraží', 'Muzeum',
  'I. P. Pavlova', 'Vyšehrad', 'Pražského povstání', 'Pankrác', 'Budějovická',
  'Kačerov', 'Roztyly', 'Chodov', 'Opatov', 'Háje',
  // Line A
  'Nemocnice Motol', 'Vypich', 'Petřiny', 'Nádraží Veleslavín', 'Borislavka',
  'Dejvická', 'Hradčanská', 'Malostranská', 'Staroměstská', 'Můstek',
  'Náměstí Míru', 'Jiřího z Poděbrad', 'Flora', 'Želivského', 'Strašnická',
  'Skalka', 'Depo Hostivař',
  // Line B
  'Zličín', 'Stodůlky', 'Luka', 'Lužiny', 'Hůrka', 'Nové Butovice',
  'Jinonice', 'Radlická', 'Smíchovské nádraží', 'Anděl', 'Karlovo náměstí',
  'Národní třída', 'Náměstí Republiky', 'Křižíkova', 'Invalidovna',
  'Palmovka', 'Českomoravská', 'Vysočanská', 'Kolbenova', 'Hloubětín',
  'Rajská zahrada', 'Černý Most',
])

// ── Geographic → SVG projection ───────────────────────────────────────────────
// Calibrated so Můstek (14.4255°E, 50.0833°N) → SVG ~(478, 303).
const LON_MIN = 14.22
const LON_MAX = 14.65
const LAT_MIN = 49.97
const LAT_MAX = 50.17
const SVG_W = 1000
const SVG_H = 700

function project(lat: number, lon: number): [number, number] {
  const x = Math.round(((lon - LON_MIN) / (LON_MAX - LON_MIN)) * SVG_W)
  const y = Math.round(((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H)
  return [x, y]
}

function inBounds(lat: number, lon: number): boolean {
  return lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX
}

// ── Ramer-Douglas-Peucker simplification ─────────────────────────────────────

function ptSegDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const [px, py] = p
  const [ax, ay] = a
  const dx = b[0] - ax
  const dy = b[1] - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length <= 2) return pts
  let maxD = 0, maxI = 0
  const last = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptSegDist(pts[i], pts[0], last)
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > eps) {
    const l = rdp(pts.slice(0, maxI + 1), eps)
    const r = rdp(pts.slice(maxI), eps)
    return [...l.slice(0, -1), ...r]
  }
  return [pts[0], last]
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n')
  const headers = lines[0].replace('\r', '').split(',').map(h => h.trim())
  const results: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].replace('\r', '').trim()
    if (!raw) continue
    const values = splitLine(raw)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim() })
    results.push(row)
  }
  return results
}

function splitLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { result.push(cur); cur = '' }
    else cur += c
  }
  result.push(cur)
  return result
}

// ── Shapes.txt fast parse ─────────────────────────────────────────────────────
//
// Outputs lon/lat coordinates (for MapLibre GeoJSON).
// RDP simplification is performed in SVG pixel space (for consistent epsilon),
// then surviving points are mapped back to their original lon/lat.
//
//   tram:  RDP-simplified [lon, lat][]
//   metro: [lon, lat, dist_km][] with shape_dist_traveled for vehicle correlation

interface RawPt { seq: number; lat: number; lon: number; dist: number }

function parseShapes(
  text: string,
  tramNeeded: Set<string>,
  metroNeeded: Set<string>,
): {
  tram: Map<string, [number, number][]>           // [lon, lat]
  metro: Map<string, [number, number, number][]>  // [lon, lat, dist_km]
} {
  const lines = text.split('\n')
  const hdr = lines[0].replace('\r', '').split(',').map(h => h.trim())
  const iId = hdr.indexOf('shape_id')
  const iLat = hdr.indexOf('shape_pt_lat')
  const iLon = hdr.indexOf('shape_pt_lon')
  const iSeq = hdr.indexOf('shape_pt_sequence')
  const iDist = hdr.indexOf('shape_dist_traveled')

  const allNeeded = new Set([...tramNeeded, ...metroNeeded])
  const raw = new Map<string, RawPt[]>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace('\r', '').trim()
    if (!line) continue
    const parts = line.split(',')
    const sId = parts[iId]?.trim()
    if (!sId || !allNeeded.has(sId)) continue
    const seq = parseInt(parts[iSeq])
    const lat = parseFloat(parts[iLat])
    const lon = parseFloat(parts[iLon])
    const dist = iDist >= 0 ? parseFloat(parts[iDist]) : 0
    if (isNaN(lat) || isNaN(lon) || isNaN(seq)) continue
    if (!raw.has(sId)) raw.set(sId, [])
    raw.get(sId)!.push({ seq, lat, lon, dist: isNaN(dist) ? 0 : dist })
  }

  const tramOut = new Map<string, [number, number][]>()
  const metroOut = new Map<string, [number, number, number][]>()

  for (const [sId, pts] of raw) {
    pts.sort((a, b) => a.seq - b.seq)

    if (tramNeeded.has(sId)) {
      // RDP in SVG space (pixel epsilon), then map surviving pts back to lon/lat
      const projected = pts.map(p => project(p.lat, p.lon))
      const coordKey = new Map(pts.map(p => {
        const [x, y] = project(p.lat, p.lon)
        return [`${x},${y}`, [p.lon, p.lat] as [number, number]]
      }))
      const simplified = rdp(projected, 2)
      tramOut.set(sId, simplified.map(([x, y]) => coordKey.get(`${x},${y}`) ?? [0, 0]))
    }

    if (metroNeeded.has(sId)) {
      // RDP in SVG space, then recover lon/lat and dist from full array
      const full = pts.map(p => ({
        xy: project(p.lat, p.lon) as [number, number],
        lonlat: [p.lon, p.lat] as [number, number],
        dist: Math.round(p.dist),
      }))
      const ptMap = new Map(full.map(p => [`${p.xy[0]},${p.xy[1]}`, p]))
      const simplified = rdp(full.map(p => p.xy), 1.5)
      metroOut.set(sId, simplified.map(([x, y]) => {
        const pt = ptMap.get(`${x},${y}`)!
        return [pt.lonlat[0], pt.lonlat[1], pt.dist] as [number, number, number]
      }))
    }
  }

  return { tram: tramOut, metro: metroOut }
}

// ── Best shape per (route, direction) ────────────────────────────────────────

type ShapeCountMap = Map<string, Map<string, Map<string, number>>>

function pickBestShapes(
  trips: Record<string, string>[],
  routeIds: Set<string>,
): { routeShapeIds: Map<string, Record<string, string>>; needed: Set<string> } {
  const counts: ShapeCountMap = new Map()

  for (const t of trips) {
    const rId = t['route_id']
    if (!routeIds.has(rId)) continue
    const dId = t['direction_id'] ?? '0'
    const sId = t['shape_id']
    if (!sId) continue
    if (!counts.has(rId)) counts.set(rId, new Map())
    const byDir = counts.get(rId)!
    if (!byDir.has(dId)) byDir.set(dId, new Map())
    const bySha = byDir.get(dId)!
    bySha.set(sId, (bySha.get(sId) ?? 0) + 1)
  }

  const needed = new Set<string>()
  const routeShapeIds = new Map<string, Record<string, string>>()

  for (const [rId, byDir] of counts) {
    const dirMap: Record<string, string> = {}
    for (const [dId, bySha] of byDir) {
      let best = '', bestN = 0
      for (const [sId, n] of bySha) {
        if (n > bestN) { bestN = n; best = sId }
      }
      if (best) { dirMap[dId] = best; needed.add(best) }
    }
    routeShapeIds.set(rId, dirMap)
  }

  return { routeShapeIds, needed }
}

// ── Metro stops by exact name match ──────────────────────────────────────────

function filterStopsByName(
  allStops: Record<string, string>[],
  names: Set<string>,
): { id: string; name: string; lon: number; lat: number }[] {
  const seen = new Set<string>()
  const out: { id: string; name: string; lon: number; lat: number }[] = []
  for (const s of allStops) {
    const locType = s['location_type'] || '0'
    if (locType !== '0') continue
    const name = s['stop_name']
    if (!names.has(name) || seen.has(name)) continue
    const lat = parseFloat(s['stop_lat'])
    const lon = parseFloat(s['stop_lon'])
    if (isNaN(lat) || isNaN(lon)) continue
    seen.add(name)
    out.push({ id: s['stop_id'], name, lon, lat })
  }
  return out
}

// ── Stops near a set of shape points ─────────────────────────────────────────
// shapePtSets contains [lon, lat][] arrays.
// Proximity check is done in SVG pixel space (consistent epsilon) then output lon/lat.

function filterStopsNear(
  allStops: Record<string, string>[],
  shapePtSets: [number, number][][],  // [lon, lat][]
  threshPx: number,
  deduplicateByName = false,
): { id: string; name: string; lon: number; lat: number }[] {
  // Project shape lon/lat to SVG pixels for proximity check
  const flat: [number, number][] = []
  for (const pts of shapePtSets) {
    for (const [lon, lat] of pts) flat.push(project(lat, lon))
  }

  function near(x: number, y: number): boolean {
    for (const [sx, sy] of flat) {
      if (Math.abs(sx - x) < threshPx && Math.abs(sy - y) < threshPx) return true
    }
    return false
  }

  const seen = new Set<string>()
  const out: { id: string; name: string; lon: number; lat: number }[] = []
  for (const s of allStops) {
    const locType = s['location_type'] || '0'
    if (locType !== '0') continue
    const lat = parseFloat(s['stop_lat'])
    const lon = parseFloat(s['stop_lon'])
    if (isNaN(lat) || isNaN(lon) || !inBounds(lat, lon)) continue
    const [x, y] = project(lat, lon)
    if (!near(x, y)) continue
    const name = s['stop_name']
    if (deduplicateByName) {
      if (seen.has(name)) continue
      seen.add(name)
    }
    out.push({ id: s['stop_id'], name, lon, lat })
  }
  return out
}

// ── Assign line IDs to metro stops ────────────────────────────────────────────

const METRO_INTERCHANGES: Record<string, string[]> = {
  'Muzeum':  ['A', 'C'],
  'Florenc': ['B', 'C'],
  'Můstek':  ['A', 'B'],
}

function addMetroStopLineIds(
  stops: { id: string; name: string; lon: number; lat: number }[],
  routes: { id: string; shapes: Record<string, [number, number, number][]> }[],
): { id: string; name: string; lon: number; lat: number; lineIds: string[] }[] {
  return stops.map(stop => {
    if (METRO_INTERCHANGES[stop.name]) {
      return { ...stop, lineIds: METRO_INTERCHANGES[stop.name] }
    }
    // Find nearest route by proximity to shape points (lon/lat space)
    let best = '', bestD = Infinity
    for (const route of routes) {
      for (const pts of Object.values(route.shapes)) {
        for (const [lon, lat] of pts) {
          const d = Math.hypot(lon - stop.lon, lat - stop.lat)
          if (d < bestD) { bestD = d; best = route.id }
        }
      }
    }
    return { ...stop, lineIds: best ? [best] : [] }
  })
}

// ── Route output builder ──────────────────────────────────────────────────────

function buildRoutes<T>(
  rawRoutes: Record<string, string>[],
  routeShapeIds: Map<string, Record<string, string>>,
  shapePoints: Map<string, T[]>,
  sortNumeric: boolean,
): { id: string; color: string; textColor: string; shapes: Record<string, T[]> }[] {
  const routeById = new Map(rawRoutes.map(r => [r['route_id'], r]))
  const out = []

  for (const raw of rawRoutes) {
    const rId = raw['route_id']
    const dirMap = routeShapeIds.get(rId)
    if (!dirMap) continue

    const shapes: Record<string, T[]> = {}
    for (const [dId, sId] of Object.entries(dirMap)) {
      const pts = shapePoints.get(sId)
      if (pts && pts.length > 1) shapes[dId] = pts
    }
    if (Object.keys(shapes).length === 0) continue

    const r = routeById.get(rId)!
    out.push({
      id: r['route_short_name'] || rId,
      color: r['route_color'] ? '#' + r['route_color'] : '#888888',
      textColor: r['route_text_color'] ? '#' + r['route_text_color'] : '#FFFFFF',
      shapes,
    })
  }

  if (sortNumeric) out.sort((a, b) => parseInt(a.id) - parseInt(b.id))
  return out
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Downloading PID GTFS from', GTFS_URL)
  const res = await fetch(GTFS_URL, {
    headers: { 'User-Agent': 'prague-transit-map/build-script' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`  Downloaded ${(buf.length / 1e6).toFixed(1)} MB`)

  const zip = new AdmZip(buf)
  function read(name: string): string {
    const e = zip.getEntry(name)
    if (!e) throw new Error(`${name} not in GTFS archive`)
    return e.getData().toString('utf8')
  }

  // ── Routes ─────────────────────────────────────────────────────────────────
  console.log('Parsing routes.txt...')
  const allRoutes = parseCSV(read('routes.txt'))
  const tramRoutes  = allRoutes.filter(r => r['route_type'] === '0')
  const metroRoutes = allRoutes.filter(r => r['route_type'] === '1')
  const tramRouteIds  = new Set(tramRoutes.map(r => r['route_id']))
  const metroRouteIds = new Set(metroRoutes.map(r => r['route_id']))
  console.log(`  ${metroRoutes.length} metro routes, ${tramRoutes.length} tram routes`)

  // ── Trips ──────────────────────────────────────────────────────────────────
  console.log('Parsing trips.txt...')
  const allTrips = parseCSV(read('trips.txt'))

  const { routeShapeIds: tramShapeIds, needed: tramNeeded } = pickBestShapes(allTrips, tramRouteIds)
  const { routeShapeIds: metroShapeIds, needed: metroNeeded } = pickBestShapes(allTrips, metroRouteIds)
  console.log(`  Metro: ${metroNeeded.size} shapes | Tram: ${tramNeeded.size} shapes`)

  // ── Shapes ─────────────────────────────────────────────────────────────────
  console.log('Parsing shapes.txt (may take a moment)...')
  const { tram: tramShapes, metro: metroShapes } = parseShapes(
    read('shapes.txt'),
    tramNeeded,
    metroNeeded,
  )
  console.log(`  Metro shapes: ${metroShapes.size} | Tram shapes: ${tramShapes.size}`)

  // ── Stops ──────────────────────────────────────────────────────────────────
  console.log('Parsing stops.txt...')
  const allStops = parseCSV(read('stops.txt'))

  // Metro stops: exact name match against known 57 station names.
  // This is more reliable than proximity — bus stops near metro tunnels cause false positives.
  // Deduplicate by name to keep one entry per station (multiple platforms share the name).
  const metroStops = filterStopsByName(allStops, METRO_STATION_NAMES)

  // Tram stops: proximity to tram shape lines (20px)
  const tramShapePts = [...tramShapes.values()]
  const tramStops = filterStopsNear(allStops, tramShapePts, 20)

  console.log(`  Metro stops: ${metroStops.length} | Tram stops: ${tramStops.length}`)

  // ── Build output ────────────────────────────────────────────────────────────
  const metroRouteObjs = buildRoutes(metroRoutes, metroShapeIds, metroShapes, false)

  const metro = {
    routes: metroRouteObjs,
    stops: addMetroStopLineIds(metroStops, metroRouteObjs),
  }

  const tram = {
    routes: buildRoutes(tramRoutes, tramShapeIds, tramShapes, true),
    stops: tramStops,
  }

  const output = {
    generated: new Date().toISOString(),
    metro,
    tram,
  }

  mkdirSync(join(ROOT, 'public'), { recursive: true })
  const outPath = join(ROOT, 'public', 'network.json')
  writeFileSync(outPath, JSON.stringify(output))

  const kb = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(0)
  const metroPts = metro.routes.reduce((s, r) => s + Object.values(r.shapes).reduce((ss, pts) => ss + pts.length, 0), 0)
  const tramPts  = tram.routes.reduce((s, r) => s + Object.values(r.shapes).reduce((ss, pts) => ss + pts.length, 0), 0)

  console.log(`\nWrote ${outPath}`)
  console.log(`  Metro: ${metro.routes.length} routes, ${metroStops.length} stops, ${metroPts} shape points`)
  console.log(`  Tram:  ${tram.routes.length} routes, ${tramStops.length} stops, ${tramPts} shape points`)
  console.log(`  Total: ${kb} KB uncompressed`)
}

main().catch(e => { console.error(e); process.exit(1) })
