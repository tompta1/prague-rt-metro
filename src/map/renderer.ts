import type { Vehicle } from '@/types'
import { LINES, STATIONS } from './network'

const SVG_NS = 'http://www.w3.org/2000/svg'

function lineColor(lineId: string): string {
  return LINES.find(l => l.id === lineId)?.color ?? '#888'
}

export function createMapSVG(container: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 1000 700')
  svg.setAttribute('class', 'map-svg')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Prague transit schematic map')

  // Station dots
  for (const st of STATIONS) {
    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', 'station')
    g.setAttribute('data-id', st.id)

    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('cx', String(st.x))
    circle.setAttribute('cy', String(st.y))
    circle.setAttribute('r', st.isInterchange ? '10' : '6')
    circle.setAttribute('fill', st.isInterchange ? '#fff' : lineColor(st.lineIds[0] ?? ''))
    circle.setAttribute('stroke', '#222')
    circle.setAttribute('stroke-width', '2')

    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('x', String(st.x + 14))
    label.setAttribute('y', String(st.y + 4))
    label.setAttribute('class', 'station-label')
    label.textContent = st.name

    g.appendChild(circle)
    g.appendChild(label)
    svg.appendChild(g)
  }

  container.appendChild(svg)
  return svg
}

export function updateVehicles(svg: SVGSVGElement, vehicles: Vehicle[]): void {
  // Remove old markers
  svg.querySelectorAll('.vehicle-marker').forEach(el => el.remove())

  for (const v of vehicles) {
    const color = lineColor(v.lineId)
    const delayClass = `delay-${v.delayStatus}`

    // Placeholder position: fixed position until progress-along-route is implemented
    const x = 200 + Math.random() * 600
    const y = 100 + Math.random() * 500

    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('cx', String(x))
    circle.setAttribute('cy', String(y))
    circle.setAttribute('r', '5')
    circle.setAttribute('fill', color)
    circle.setAttribute('class', `vehicle-marker ${delayClass}`)
    circle.setAttribute('data-trip-id', v.tripId)

    svg.appendChild(circle)
  }
}
