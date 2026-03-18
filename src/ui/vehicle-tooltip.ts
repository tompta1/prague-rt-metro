import type { VehicleClickInfo } from '@/map/renderer'
import type { DelayStatus } from '@/types'

const METRO_COLORS: Record<string, string> = { A: '#00A562', B: '#F8B322', C: '#CF003D' }
const DELAY_COLORS: Record<DelayStatus, string> = {
  'on-time': '#00c07a',
  'slight':  '#f0a500',
  'late':    '#e03030',
  'unknown': '#666',
}

const TYPE_LABELS: Record<string, string> = {
  metro:      'Metro',
  tram:       'Tram',
  bus:        'Bus',
  rail:       'Train',
  trolleybus: 'Trolleybus',
  ferry:      'Ferry',
  other:      'Vehicle',
}

function formatDelay(status: DelayStatus, delaySec?: number): string {
  if (status === 'on-time') return 'On time'
  if (status === 'unknown') return 'Delay unknown'
  if (delaySec == null) return 'Delay unknown'
  const mins = Math.floor(delaySec / 60)
  const secs = delaySec % 60
  const parts = mins > 0 ? [`${mins}m`] : []
  if (secs > 0 || mins === 0) parts.push(`${secs}s`)
  return `+${parts.join(' ')} delayed`
}

export class VehicleTooltip {
  private el: HTMLElement

  constructor(container: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'vehicle-tooltip hidden'

    const header = document.createElement('div')
    header.className = 'vehicle-tooltip__header'

    const lineSpan = document.createElement('span')
    lineSpan.className = 'vehicle-tooltip__line'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'vehicle-tooltip__close'
    closeBtn.textContent = '×'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.addEventListener('click', e => {
      e.stopPropagation()
      this.hide()
    })

    header.appendChild(lineSpan)
    header.appendChild(closeBtn)

    const headsignEl = document.createElement('div')
    headsignEl.className = 'vehicle-tooltip__headsign'

    const delayEl = document.createElement('div')
    delayEl.className = 'vehicle-tooltip__delay'

    const delayDot = document.createElement('span')
    delayDot.className = 'vehicle-tooltip__delay-dot'

    const delayText = document.createElement('span')
    delayEl.appendChild(delayDot)
    delayEl.appendChild(delayText)

    this.el.appendChild(header)
    this.el.appendChild(headsignEl)
    this.el.appendChild(delayEl)

    // Prevent clicks inside tooltip from bubbling to SVG background click handler
    this.el.addEventListener('click', e => e.stopPropagation())

    container.appendChild(this.el)
  }

  show(info: VehicleClickInfo, clientX: number, clientY: number): void {
    const lineSpan = this.el.querySelector('.vehicle-tooltip__line')!
    const typeLabel = TYPE_LABELS[info.type] ?? 'Vehicle'

    if (info.type === 'metro') {
      const color = METRO_COLORS[info.lineId] ?? '#888'
      lineSpan.innerHTML = ''
      const badge = document.createElement('span')
      badge.className = 'line-badge'
      badge.textContent = info.lineId
      badge.style.background = color
      const label = document.createTextNode(` · ${typeLabel}`)
      lineSpan.appendChild(badge)
      lineSpan.appendChild(label)
    } else {
      lineSpan.textContent = `Line ${info.lineId} · ${typeLabel}`
    }

    const headsignEl = this.el.querySelector('.vehicle-tooltip__headsign')!
    headsignEl.textContent = `→ ${info.headsign}`

    const delayDot = this.el.querySelector<HTMLElement>('.vehicle-tooltip__delay-dot')!
    const delayText = this.el.querySelector('.vehicle-tooltip__delay span:last-child')!
    delayDot.style.background = DELAY_COLORS[info.delayStatus]
    delayText.textContent = formatDelay(info.delayStatus, info.delaySec)

    // Position near click, clamped to viewport
    const MARGIN = 16
    const WIDTH = 208   // matches CSS width + borders
    const HEIGHT = 90   // approximate
    const maxX = window.innerWidth - WIDTH - MARGIN
    const maxY = window.innerHeight - HEIGHT - MARGIN
    const x = Math.max(MARGIN, Math.min(clientX + 12, maxX))
    const y = Math.max(MARGIN, Math.min(clientY - 8, maxY))
    this.el.style.left = `${x}px`
    this.el.style.top = `${y}px`

    this.el.classList.remove('hidden')
  }

  hide(): void {
    this.el.classList.add('hidden')
  }
}

export { formatDelay }
