import type { Vehicle, DelayStatus } from '@/types'
import { interpolateAlongLine } from './network'
import { getProjectedShapes, updateLabels } from './gtfs-layer'
import { project } from './projection'
import { initPanZoom } from './pan-zoom'

/** Interpolate along a polyline path at progress 0–1. */
function interpolatePath(path: [number, number][], p: number): [number, number] {
  if (path.length === 0) return [500, 350]
  const clamped = Math.max(0, Math.min(1, p))
  const segments = path.length - 1
  const raw = clamped * segments
  const seg = Math.min(Math.floor(raw), segments - 1)
  const t = raw - seg
  const [x1, y1] = path[seg]!
  const [x2, y2] = path[seg + 1]!
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]
}

/**
 * Returns SVG [x, y] for a vehicle at the given progress on the given line.
 * Uses geographic shapes from network.json when available (loaded by initGtfsLayer),
 * falling back to the schematic LINE_PATHS from network.ts.
 */
function vehiclePosition(lineId: string, progress: number): [number, number] {
  const geoPath = getProjectedShapes()[lineId]
  if (geoPath && geoPath.length > 0) return interpolatePath(geoPath, progress)
  return interpolateAlongLine(lineId, progress)  // schematic fallback
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const VIEWBOX = '0 0 1000 700'

export function createMapSVG(container: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', VIEWBOX)
  svg.setAttribute('class', 'map-svg')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Prague metro and tram map')

  // Layer order (bottom → top): tram, metro lines+stations, vehicles
  const tramLayer = document.createElementNS(SVG_NS, 'g')
  tramLayer.setAttribute('class', 'tram-layer')

  const metroLayer = document.createElementNS(SVG_NS, 'g')
  metroLayer.setAttribute('class', 'metro-layer')

  const vehicleLayer = document.createElementNS(SVG_NS, 'g')
  vehicleLayer.setAttribute('class', 'vehicle-layer')

  svg.appendChild(tramLayer)
  svg.appendChild(metroLayer)
  svg.appendChild(vehicleLayer)

  initPanZoom(svg, vbWidth => {
    updateLabels(vbWidth)
  })

  container.appendChild(svg)
  return svg
}

// ── Speed-extrapolation animation ─────────────────────────────────────────────

interface VehicleState {
  el: SVGCircleElement
  type: Vehicle['type']
  lineId: string
  currProgress: number
  pollTime: number
  speed: number
  /** SVG position for GPS-positioned trams (no extrapolation) */
  fixedPos?: [number, number]
}

const vehicleStates = new Map<string, VehicleState>()
let animFrameId: number | null = null

const DELAY_COLORS: Record<string, string> = {
  'on-time': '#00c07a',
  'slight':  '#f0a500',
  'late':    '#e03030',
  'unknown': '#888',
}

export function setVehicleTargets(svg: SVGSVGElement, vehicles: Vehicle[]): void {
  const layer = svg.querySelector('.vehicle-layer')!
  const now = performance.now()
  const seen = new Set<string>()

  for (const v of vehicles) {
    seen.add(v.tripId)
    const isGeo = v.type === 'tram' || v.type === 'bus'
    const fixedPos = isGeo && v.geoPos ? project(v.geoPos[0], v.geoPos[1]) : undefined

    if (vehicleStates.has(v.tripId)) {
      const state = vehicleStates.get(v.tripId)!
      if (fixedPos) {
        state.fixedPos = fixedPos
      } else {
        const elapsedSec = (now - state.pollTime) / 1000
        const delta = v.progress - state.currProgress
        if (elapsedSec > 0.5 && Math.abs(delta) < 0.3) {
          state.speed = delta / elapsedSec
        } else if (Math.abs(delta) >= 0.3) {
          state.speed = 0
        }
        state.currProgress = v.progress
      }
      state.pollTime = now
      state.lineId = v.lineId
      state.el.setAttribute('fill', DELAY_COLORS[v.delayStatus] ?? '#888')
      state.el.setAttribute('data-delay-status', v.delayStatus)
      state.el.setAttribute('data-delay-sec', v.delaySec != null ? String(v.delaySec) : '')
    } else {
      const circle = document.createElementNS(SVG_NS, 'circle')
      const radius = v.type === 'metro' ? '8' : v.type === 'tram' ? '4' : v.type === 'rail' ? '5' : v.type === 'ferry' ? '4' : '3'
      circle.setAttribute('r', radius)
      circle.setAttribute('fill', DELAY_COLORS[v.delayStatus] ?? '#888')
      const cls = `vehicle-marker${v.type !== 'metro' ? ` ${v.type}-marker` : ''}`
      circle.setAttribute('class', cls)
      circle.setAttribute('data-trip-id', v.tripId)
      circle.setAttribute('data-line-id', v.lineId)
      circle.setAttribute('data-headsign', v.headsign)
      circle.setAttribute('data-delay-status', v.delayStatus)
      circle.setAttribute('data-delay-sec', v.delaySec != null ? String(v.delaySec) : '')
      circle.setAttribute('data-type', v.type)

      const [x, y] = fixedPos ?? vehiclePosition(v.lineId, v.progress)
      circle.setAttribute('cx', String(Math.round(x)))
      circle.setAttribute('cy', String(Math.round(y)))
      layer.appendChild(circle)

      vehicleStates.set(v.tripId, {
        el: circle, type: v.type, lineId: v.lineId,
        currProgress: v.progress, pollTime: now, speed: 0, fixedPos,
      })
    }
  }

  for (const [id, state] of vehicleStates) {
    if (!seen.has(id)) { state.el.remove(); vehicleStates.delete(id) }
  }
}

export interface VehicleClickInfo {
  tripId: string
  lineId: string
  headsign: string
  type: Vehicle['type']
  delayStatus: DelayStatus
  delaySec?: number
}

export function initVehicleClicks(
  svg: SVGSVGElement,
  onVehicleClick: (info: VehicleClickInfo, clientX: number, clientY: number) => void,
): void {
  const layer = svg.querySelector('.vehicle-layer')!
  layer.addEventListener('click', e => {
    const target = e.target as SVGElement
    if (!target.classList.contains('vehicle-marker')) return
    e.stopPropagation()
    const info: VehicleClickInfo = {
      tripId:      target.getAttribute('data-trip-id') ?? '',
      lineId:      target.getAttribute('data-line-id') ?? '',
      headsign:    target.getAttribute('data-headsign') ?? '',
      type:        (target.getAttribute('data-type') ?? 'other') as Vehicle['type'],
      delayStatus: (target.getAttribute('data-delay-status') ?? 'unknown') as DelayStatus,
      delaySec:    target.getAttribute('data-delay-sec') ? Number(target.getAttribute('data-delay-sec')) : undefined,
    }
    onVehicleClick(info, (e as MouseEvent).clientX, (e as MouseEvent).clientY)
  })
}

export function startAnimation(): void {
  if (animFrameId !== null) return

  function animate(t: number) {
    for (const state of vehicleStates.values()) {
      let x: number, y: number
      if (state.fixedPos) {
        ;[x, y] = state.fixedPos
      } else {
        const elapsed = (t - state.pollTime) / 1000
        const p = Math.max(0, Math.min(1, state.currProgress + state.speed * elapsed))
        ;[x, y] = vehiclePosition(state.lineId, p)
      }
      state.el.setAttribute('cx', String(Math.round(x)))
      state.el.setAttribute('cy', String(Math.round(y)))
    }
    animFrameId = requestAnimationFrame(animate)
  }

  animFrameId = requestAnimationFrame(animate)
}
