/**
 * src/map/gtfs-layer.ts
 *
 * Loads public/network.json and renders metro + tram into the SVG layers.
 * network.json stores geographic lon/lat coordinates; this module projects
 * them onto the 1000×700 SVG canvas using the same bounding box as the
 * build script.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

// ── Projection (matches build-network.ts) ──────────────────────────────────────

const LON_MIN = 14.22, LON_MAX = 14.65
const LAT_MIN = 49.97, LAT_MAX = 50.17
const SVG_W = 1000, SVG_H = 700

function project(lon: number, lat: number): [number, number] {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * SVG_W
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H
  return [x, y]
}

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

// ── Click callback ────────────────────────────────────────────────────────────

type StationClickHandler = (name: string, lineIds: string[]) => void
let _onClick: StationClickHandler | null = null

export function onStationClick(handler: StationClickHandler): void {
  _onClick = handler
}

// ── Cached network ────────────────────────────────────────────────────────────

let _network: Network | null = null
export function getNetwork(): Network | null { return _network }

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
    polyline.setAttribute('stroke', '#c0392b')
    polyline.setAttribute('stroke-width', '1.5')
    polyline.setAttribute('stroke-linecap', 'round')
    polyline.setAttribute('stroke-linejoin', 'round')
    polyline.setAttribute('opacity', '0.5')
    routesG.appendChild(polyline)
  }

  const stopsG = document.createElementNS(SVG_NS, 'g')
  stopsG.setAttribute('class', 'tram-stops')

  for (const stop of network.tram.stops) {
    const [x, y] = project(stop.lon, stop.lat)
    const c = document.createElementNS(SVG_NS, 'circle')
    c.setAttribute('cx', String(x))
    c.setAttribute('cy', String(y))
    c.setAttribute('r', '1.5')
    c.setAttribute('fill', '#aaa')
    c.setAttribute('opacity', '0.45')
    stopsG.appendChild(c)
  }

  layer.appendChild(routesG)
  layer.appendChild(stopsG)
}

// ── Metro layer ───────────────────────────────────────────────────────────────

function routeColor(network: Network, lineId: string): string {
  return network.metro.routes.find(r => r.id === lineId)?.color ?? '#888'
}

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
      poly.setAttribute('stroke', route.color)
      poly.setAttribute('stroke-width', '5')
      poly.setAttribute('stroke-linecap', 'round')
      poly.setAttribute('stroke-linejoin', 'round')
      poly.setAttribute('class', `metro-line metro-line-${route.id}`)
      linesG.appendChild(poly)
    }
  }

  // Stations
  const stationsG = document.createElementNS(SVG_NS, 'g')
  stationsG.setAttribute('class', 'metro-stations')

  for (const stop of network.metro.stops) {
    const lineIds = stop.lineIds.length > 0 ? stop.lineIds : (INTERCHANGES[stop.name] ?? [])
    const isInterchange = lineIds.length > 1
    const [sx, sy] = project(stop.lon, stop.lat)

    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', `metro-station${isInterchange ? ' metro-interchange' : ''}`)
    g.setAttribute('data-name', stop.name)
    g.style.cursor = 'pointer'
    g.addEventListener('click', e => {
      e.stopPropagation()
      _onClick?.(stop.name, lineIds)
    })

    if (isInterchange) {
      const ring = document.createElementNS(SVG_NS, 'circle')
      ring.setAttribute('cx', String(sx))
      ring.setAttribute('cy', String(sy))
      ring.setAttribute('r', '7')
      ring.setAttribute('fill', '#fff')
      ring.setAttribute('stroke', '#222')
      ring.setAttribute('stroke-width', '1.5')
      g.appendChild(ring)

      lineIds.forEach((lid, i) => {
        const angle = (i / lineIds.length) * Math.PI * 2 - Math.PI / 2
        const dot = document.createElementNS(SVG_NS, 'circle')
        dot.setAttribute('cx', String(sx + Math.cos(angle) * 3))
        dot.setAttribute('cy', String(sy + Math.sin(angle) * 3))
        dot.setAttribute('r', '2.5')
        dot.setAttribute('fill', routeColor(network, lid))
        g.appendChild(dot)
      })
    } else {
      const color = routeColor(network, lineIds[0] ?? '')
      const dot = document.createElementNS(SVG_NS, 'circle')
      dot.setAttribute('cx', String(sx))
      dot.setAttribute('cy', String(sy))
      dot.setAttribute('r', '4')
      dot.setAttribute('fill', color)
      dot.setAttribute('stroke', '#111')
      dot.setAttribute('stroke-width', '1.5')
      g.appendChild(dot)
    }

    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('x', String(sx + 6))
    label.setAttribute('y', String(sy + 3))
    label.setAttribute('font-size', '7')
    label.setAttribute('fill', '#e8e8e8')
    label.setAttribute('pointer-events', 'none')
    label.textContent = stop.name
    g.appendChild(label)

    stationsG.appendChild(g)
  }

  layer.appendChild(linesG)
  layer.appendChild(stationsG)
}
