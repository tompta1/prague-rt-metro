/**
 * src/map/gtfs-layer.ts
 *
 * Loads public/network.json and renders metro + tram into the SVG layers.
 * network.json stores geographic lon/lat coordinates; this module projects
 * them onto the 1000×700 SVG canvas using the same bounding box as the
 * build script.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

import { project } from './projection'

// ── Types (mirrors build-network.ts output) ────────────────────────────────────

interface MetroStop {
  id: string
  name: string
  lon: number
  lat: number
  lineIds: string[]
}

interface MetroRoute {
  id: string
  color: string
  shapes: Record<string, [number, number, number][]>  // [lon, lat, dist_km]
}

interface TramRoute {
  id: string
  color: string
  shapes: Record<string, [number, number][]>  // [lon, lat]
}

interface Network {
  metro: { routes: MetroRoute[]; stops: MetroStop[] }
  tram:  { routes: TramRoute[];  stops: { id: string; name: string; lon: number; lat: number }[] }
}

// ── Interchange stations (served by two metro lines) ──────────────────────────

const INTERCHANGES: Record<string, string[]> = {
  'Muzeum':  ['A', 'C'],
  'Florenc': ['B', 'C'],
  'Můstek':  ['A', 'B'],
}

// ── Per-label zoom threshold registry ────────────────────────────────────────

const _labels: Array<{ el: SVGTextElement; threshold: number }> = []

export function updateLabels(vbWidth: number): void {
  for (const { el, threshold } of _labels) {
    el.classList.toggle('label-visible', vbWidth < threshold)
  }
}

// ── Click callback ────────────────────────────────────────────────────────────

type StationClickHandler = (name: string, lineIds: string[]) => void
let _onClick: StationClickHandler | null = null

export function onStationClick(handler: StationClickHandler): void {
  _onClick = handler
}

// ── Cached network + projected shapes ────────────────────────────────────────

let _network: Network | null = null
export function getNetwork(): Network | null { return _network }

/**
 * Metro shapes projected to SVG coords, keyed by lineId.
 * Direction '0' is used; populated after initGtfsLayer resolves.
 * Used by renderer.ts so vehicle markers follow the geographic lines.
 */
const _projectedShapes: Record<string, [number, number][]> = {}
export function getProjectedShapes(): Record<string, [number, number][]> {
  return _projectedShapes
}

// ── Main init ─────────────────────────────────────────────────────────────────

export async function initGtfsLayer(svg: SVGSVGElement): Promise<void> {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/network.json`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    _network = await res.json() as Network
  } catch (e) {
    console.warn('[gtfs-layer] Failed to load network.json:', e)
    return
  }

  // Build projected shapes for vehicle interpolation in renderer.ts
  for (const route of _network.metro.routes) {
    const coords = route.shapes['0'] ?? Object.values(route.shapes)[0]
    if (coords) _projectedShapes[route.id] = coords.map(([lon, lat]) => project(lon, lat))
  }

  renderTramLayer(svg, _network)
  renderMetroLayer(svg, _network)

  console.log(
    `[gtfs-layer] ${_network.metro.routes.length} metro routes, ` +
    `${_network.metro.stops.length} metro stops, ` +
    `${_network.tram.routes.length} tram routes`
  )
}

// ── Tram layer ────────────────────────────────────────────────────────────────

function renderTramLayer(svg: SVGSVGElement, network: Network): void {
  const layer = svg.querySelector('.tram-layer') as SVGGElement
  if (!layer) return

  const routesG = document.createElementNS(SVG_NS, 'g')
  routesG.setAttribute('class', 'tram-routes')

  for (const route of network.tram.routes) {
    const coords = route.shapes['0'] ?? Object.values(route.shapes)[0]
    if (!coords || coords.length < 2) continue
    const pts = coords.map(([lon, lat]) => project(lon, lat))
    const polyline = document.createElementNS(SVG_NS, 'polyline')
    polyline.setAttribute('points', pts.map(([x, y]) => `${x},${y}`).join(' '))
    polyline.setAttribute('fill', 'none')
    polyline.setAttribute('stroke', '#444')
    polyline.setAttribute('stroke-width', '1.5')
    polyline.setAttribute('stroke-linecap', 'round')
    polyline.setAttribute('stroke-linejoin', 'round')
    polyline.setAttribute('opacity', '0.2')
    routesG.appendChild(polyline)
  }

  const stopsG = document.createElementNS(SVG_NS, 'g')
  stopsG.setAttribute('class', 'tram-stops')

  // Pass 1 – project all tram stops
  interface ProjectedTramStop {
    id: string; name: string; pos: [number, number]; threshold: number
  }
  const projectedTram: ProjectedTramStop[] = network.tram.stops.map(s => ({
    id: s.id, name: s.name, pos: project(s.lon, s.lat), threshold: 0,
  }))

  // Pass 2 – group by name, pick representative, compute cross-group threshold
  const byName = new Map<string, ProjectedTramStop[]>()
  for (const stop of projectedTram) {
    const g = byName.get(stop.name) ?? []
    g.push(stop)
    byName.set(stop.name, g)
  }

  const representatives: ProjectedTramStop[] = []
  for (const group of byName.values()) {
    // centroid
    const cx = group.reduce((s, p) => s + p.pos[0], 0) / group.length
    const cy = group.reduce((s, p) => s + p.pos[1], 0) / group.length
    // representative = stop closest to centroid
    let rep = group[0]!
    let bestD = Infinity
    for (const stop of group) {
      const d = (stop.pos[0] - cx) ** 2 + (stop.pos[1] - cy) ** 2
      if (d < bestD) { bestD = d; rep = stop }
    }
    // cross-group min distance (ignores same-name platforms)
    let minDistSq = Infinity
    for (const other of projectedTram) {
      if (other.name === rep.name) continue
      const dx = rep.pos[0] - other.pos[0]
      const dy = rep.pos[1] - other.pos[1]
      const dSq = dx * dx + dy * dy
      if (dSq < minDistSq) minDistSq = dSq
    }
    rep.threshold = Math.max(110, Math.min(200, Math.sqrt(minDistSq) * 20))
    representatives.push(rep)
  }

  // Pass 3 – render: all stops get dots/hit circles; only reps get labels
  const repSet = new Set(representatives)

  for (const stop of projectedTram) {
    const [x, y] = stop.pos

    // Invisible hit circle (larger radius for easy tapping/clicking)
    const hit = document.createElementNS(SVG_NS, 'circle')
    hit.setAttribute('cx', String(x))
    hit.setAttribute('cy', String(y))
    hit.setAttribute('r', '6')
    hit.setAttribute('fill', 'transparent')
    hit.setAttribute('data-name', stop.name)
    hit.style.cursor = 'pointer'
    stopsG.appendChild(hit)

    // Visual dot
    const dot = document.createElementNS(SVG_NS, 'circle')
    dot.setAttribute('cx', String(x))
    dot.setAttribute('cy', String(y))
    dot.setAttribute('r', '1')
    dot.setAttribute('fill', '#444')
    dot.setAttribute('opacity', '0.25')
    dot.setAttribute('pointer-events', 'none')
    stopsG.appendChild(dot)

    if (repSet.has(stop)) {
      const label = document.createElementNS(SVG_NS, 'text') as SVGTextElement
      label.setAttribute('x', String(x + 3))
      label.setAttribute('y', String(y + 2))
      label.setAttribute('class', 'tram-stop-label')
      label.textContent = stop.name
      stopsG.appendChild(label)
      _labels.push({ el: label, threshold: stop.threshold })
    }
  }

  // Event delegation: one listener for all tram stops
  stopsG.addEventListener('click', e => {
    const target = e.target as SVGElement
    const name = target.getAttribute('data-name')
    if (name) {
      e.stopPropagation()
      _onClick?.(name, [])
    }
  })

  layer.appendChild(routesG)
  layer.appendChild(stopsG)
}

// ── Metro layer ───────────────────────────────────────────────────────────────

function renderMetroLayer(svg: SVGSVGElement, network: Network): void {
  const layer = svg.querySelector('.metro-layer') as SVGGElement
  if (!layer) return

  // Lines
  const linesG = document.createElementNS(SVG_NS, 'g')
  linesG.setAttribute('class', 'metro-lines')

  for (const route of network.metro.routes) {
    for (const coords of Object.values(route.shapes)) {
      if (coords.length < 2) continue
      const pts = coords.map(([lon, lat]) => project(lon, lat))
      const poly = document.createElementNS(SVG_NS, 'polyline')
      poly.setAttribute('points', pts.map(([x, y]) => `${x},${y}`).join(' '))
      poly.setAttribute('fill', 'none')
      poly.setAttribute('stroke', '#444')
      poly.setAttribute('stroke-width', '2')
      poly.setAttribute('stroke-linecap', 'round')
      poly.setAttribute('stroke-linejoin', 'round')
      poly.setAttribute('opacity', '0.35')
      poly.setAttribute('class', `metro-line metro-line-${route.id}`)
      linesG.appendChild(poly)
    }
  }

  // Stations
  const stationsG = document.createElementNS(SVG_NS, 'g')
  stationsG.setAttribute('class', 'metro-stations')

  // Pre-project all metro stops for nearest-neighbor computation
  interface ProjectedMetroStop extends MetroStop {
    pos: [number, number]
    resolvedLineIds: string[]
    threshold: number
  }
  const projectedStops: ProjectedMetroStop[] = network.metro.stops.map(s => ({
    ...s,
    pos: project(s.lon, s.lat),
    resolvedLineIds: s.lineIds.length > 0 ? s.lineIds : (INTERCHANGES[s.name] ?? []),
    threshold: 0,
  }))

  for (const stop of projectedStops) {
    const [sx, sy] = stop.pos
    let minDistSq = Infinity
    for (const other of projectedStops) {
      if (other === stop) continue
      const dx = sx - other.pos[0], dy = sy - other.pos[1]
      const dSq = dx * dx + dy * dy
      if (dSq < minDistSq) minDistSq = dSq
    }
    const minDist = Math.sqrt(minDistSq)
    const base = minDist * 20
    const isInterchange = stop.resolvedLineIds.length > 1
    stop.threshold = Math.min(1050, isInterchange ? base * 2.5 : base)
  }

  for (const stop of projectedStops) {
    const [sx, sy] = stop.pos
    const isInterchange = stop.resolvedLineIds.length > 1

    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', `metro-station${isInterchange ? ' metro-interchange' : ''}`)
    g.setAttribute('data-name', stop.name)
    g.style.cursor = 'pointer'
    g.addEventListener('click', e => {
      e.stopPropagation()
      _onClick?.(stop.name, stop.resolvedLineIds)
    })

    const dot = document.createElementNS(SVG_NS, 'circle')
    dot.setAttribute('cx', String(sx))
    dot.setAttribute('cy', String(sy))
    dot.setAttribute('r', '2')
    dot.setAttribute('fill', '#555')
    dot.setAttribute('pointer-events', 'none')
    g.appendChild(dot)

    const label = document.createElementNS(SVG_NS, 'text') as SVGTextElement
    label.setAttribute('x', String(sx + 5))
    label.setAttribute('y', String(sy + 3))
    label.setAttribute('class', 'station-label')
    label.textContent = stop.name
    g.appendChild(label)
    _labels.push({ el: label, threshold: stop.threshold })

    stationsG.appendChild(g)
  }

  layer.appendChild(linesG)
  layer.appendChild(stationsG)
}
