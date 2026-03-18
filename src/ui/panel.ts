import type { Departure } from '@/types'
import { FetchError } from '@/core/errors'

const REFRESH_MS = 30_000

const METRO_COLORS: Record<string, string> = { A: '#00A562', B: '#F8B322', C: '#CF003D' }

function lineColor(lineId: string): string {
  return METRO_COLORS[lineId] ?? '#888'
}

export function minutesUntil(isoTimestamp: string): number {
  return Math.round((new Date(isoTimestamp).getTime() - Date.now()) / 60_000)
}

export class DeparturePanel {
  private el: HTMLElement
  private headerEl: HTMLElement
  private listEl: HTMLElement
  private statusEl: HTMLElement
  private currentName: string | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private fetcher: (name: string) => Promise<Departure[]>

  constructor(container: HTMLElement, fetcher: (name: string) => Promise<Departure[]>) {
    this.fetcher = fetcher

    this.el = document.createElement('div')
    this.el.className = 'departure-panel hidden'

    const header = document.createElement('div')
    header.className = 'departure-panel__header'

    this.headerEl = document.createElement('div')
    this.headerEl.className = 'departure-panel__title'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'departure-panel__close'
    closeBtn.textContent = '×'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.addEventListener('click', () => this.hide())

    header.appendChild(this.headerEl)
    header.appendChild(closeBtn)

    this.listEl = document.createElement('div')
    this.listEl.className = 'departure-panel__list'

    this.statusEl = document.createElement('div')
    this.statusEl.className = 'departure-panel__status'

    this.el.appendChild(header)
    this.el.appendChild(this.listEl)
    this.el.appendChild(this.statusEl)
    container.appendChild(this.el)
  }

  show(name: string, lineIds: string[]): void {
    this.currentName = name
    this.el.classList.remove('hidden')

    this.headerEl.innerHTML = ''
    for (const lineId of lineIds) {
      const badge = document.createElement('span')
      badge.className = 'line-badge'
      badge.textContent = lineId
      badge.style.background = lineColor(lineId)
      this.headerEl.appendChild(badge)
    }
    const nameSpan = document.createElement('span')
    nameSpan.textContent = name
    this.headerEl.appendChild(nameSpan)

    this.listEl.innerHTML = ''
    this.statusEl.textContent = 'Loading…'

    this.clearRefreshTimer()
    void this.refresh()
  }

  hide(): void {
    this.el.classList.add('hidden')
    this.currentName = null
    this.clearRefreshTimer()
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private scheduleRefresh(): void {
    if (!this.currentName) return
    this.clearRefreshTimer()
    this.refreshTimer = setTimeout(() => void this.refresh(), REFRESH_MS)
  }

  private async refresh(): Promise<void> {
    if (!this.currentName) return
    try {
      const departures = await this.fetcher(this.currentName)
      this.renderDepartures(departures)
      this.statusEl.textContent = `Updated ${new Date().toLocaleTimeString()}`
    } catch (err) {
      if (err instanceof FetchError) {
        if (err.status === 0) this.statusEl.textContent = 'Timeout — retrying'
        else if (err.status === 429) this.statusEl.textContent = 'Rate limit (429)'
        else this.statusEl.textContent = 'Departures unavailable'
      } else {
        this.statusEl.textContent = 'Departures unavailable'
      }
    } finally {
      this.scheduleRefresh()
    }
  }

  private renderDepartures(departures: Departure[]): void {
    const upcoming = departures
      .map(d => ({ ...d, mins: minutesUntil(d.predictedAt) }))
      .filter(d => d.mins >= 0)
      .slice(0, 8)

    if (upcoming.length === 0) {
      this.listEl.innerHTML = '<div class="departure-panel__empty">No upcoming departures</div>'
      return
    }

    this.listEl.innerHTML = ''
    for (const dep of upcoming) {
      const row = document.createElement('div')
      row.className = 'departure-row'

      const badge = document.createElement('span')
      badge.className = 'line-badge'
      badge.textContent = dep.line
      badge.style.background = lineColor(dep.line)

      const dest = document.createElement('span')
      dest.className = 'departure-row__dest'
      dest.textContent = dep.headsign

      const time = document.createElement('span')
      time.className = 'departure-row__time'
      time.textContent = dep.mins === 0 ? 'Now' : `${dep.mins} min`

      const delay = document.createElement('span')
      delay.className = `departure-row__delay delay-${dep.delaySec < 60 ? 'on-time' : dep.delaySec < 300 ? 'slight' : 'late'}`

      row.appendChild(badge)
      row.appendChild(dest)
      row.appendChild(time)
      row.appendChild(delay)
      this.listEl.appendChild(row)
    }
  }
}
