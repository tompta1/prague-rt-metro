import type { Vehicle } from '@/types'
import { interpolateAlongLine } from './network'
import { initPanZoom } from './pan-zoom'

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

  initPanZoom(svg)

  container.appendChild(svg)
  return svg
}

// ── Speed-extrapolation animation ─────────────────────────────────────────────

interface VehicleState {
  el: SVGCircleElement
  lineId: string
  currProgress: number
  pollTime: number
  speed: number
}

const vehicleStates = new Map<string, VehicleState>()
let animFrameId: number | null = null

function lineColor(lineId: string): string {
  const colors: Record<string, string> = { A: '#00A562', B: '#F8B322', C: '#CF003D' }
  return colors[lineId] ?? '#888'
}

export function setVehicleTargets(svg: SVGSVGElement, vehicles: Vehicle[]): void {
  const layer = svg.querySelector('.vehicle-layer')!
  const now = performance.now()
  const seen = new Set<string>()

  for (const v of vehicles) {
    seen.add(v.tripId)

    if (vehicleStates.has(v.tripId)) {
      const state = vehicleStates.get(v.tripId)!
      const elapsedSec = (now - state.pollTime) / 1000
      const delta = v.progress - state.currProgress
      if (elapsedSec > 0.5 && Math.abs(delta) < 0.3) {
        state.speed = delta / elapsedSec
      } else if (Math.abs(delta) >= 0.3) {
        state.speed = 0
      }
      state.currProgress = v.progress
      state.pollTime = now
      state.lineId = v.lineId
      state.el.setAttribute('class', `vehicle-marker delay-${v.delayStatus}`)
    } else {
      const circle = document.createElementNS(SVG_NS, 'circle')
      circle.setAttribute('r', '7')
      circle.setAttribute('fill', lineColor(v.lineId))
      circle.setAttribute('class', `vehicle-marker delay-${v.delayStatus}`)
      circle.setAttribute('data-trip-id', v.tripId)

      if (v.delaySec != null && v.delaySec >= 60) {
        const title = document.createElementNS(SVG_NS, 'title')
        title.textContent = `${v.lineId} → ${v.headsign} (+${Math.round(v.delaySec / 60)} min)`
        circle.appendChild(title)
      }

      const [x, y] = interpolateAlongLine(v.lineId, v.progress)
      circle.setAttribute('cx', String(Math.round(x)))
      circle.setAttribute('cy', String(Math.round(y)))
      layer.appendChild(circle)

      vehicleStates.set(v.tripId, {
        el: circle, lineId: v.lineId,
        currProgress: v.progress, pollTime: now, speed: 0,
      })
    }
  }

  for (const [id, state] of vehicleStates) {
    if (!seen.has(id)) { state.el.remove(); vehicleStates.delete(id) }
  }
}

export function startAnimation(): void {
  if (animFrameId !== null) return

  function animate(t: number) {
    for (const state of vehicleStates.values()) {
      const elapsed = (t - state.pollTime) / 1000
      const p = Math.max(0, Math.min(1, state.currProgress + state.speed * elapsed))
      const [x, y] = interpolateAlongLine(state.lineId, p)
      state.el.setAttribute('cx', String(Math.round(x)))
      state.el.setAttribute('cy', String(Math.round(y)))
    }
    animFrameId = requestAnimationFrame(animate)
  }

  animFrameId = requestAnimationFrame(animate)
}
