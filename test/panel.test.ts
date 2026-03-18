// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeparturePanel, minutesUntil } from '@/ui/panel'
import { FetchError } from '@/core/errors'

// Flush pending Promise microtasks without advancing fake timers
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

// ── minutesUntil ──────────────────────────────────────────────────────────────

describe('minutesUntil', () => {
  it('returns 0 for the current moment', () => {
    const now = new Date().toISOString()
    expect(minutesUntil(now)).toBe(0)
  })

  it('returns positive minutes for a future timestamp', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString()
    expect(minutesUntil(future)).toBe(5)
  })

  it('returns negative minutes for a past timestamp', () => {
    const past = new Date(Date.now() - 3 * 60_000).toISOString()
    expect(minutesUntil(past)).toBe(-3)
  })

  it('rounds to nearest minute', () => {
    const almostTwoMinutes = new Date(Date.now() + 1.7 * 60_000).toISOString()
    expect(minutesUntil(almostTwoMinutes)).toBe(2)
  })
})

// ── DeparturePanel ────────────────────────────────────────────────────────────

function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

describe('DeparturePanel', () => {
  let container: HTMLElement
  let fetcher: ReturnType<typeof vi.fn>
  let panel: DeparturePanel

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    fetcher = vi.fn().mockResolvedValue([])
    panel = new DeparturePanel(container, fetcher)
  })

  afterEach(() => {
    panel.hide()
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('show()', () => {
    it('removes hidden class', async () => {
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()
      expect(container.querySelector('.departure-panel')?.classList.contains('hidden')).toBe(false)
    })

    it('renders line badge for each lineId', () => {
      panel.show('Muzeum', ['A', 'C'])
      const badges = container.querySelectorAll('.departure-panel__title .line-badge')
      expect(badges).toHaveLength(2)
      expect(badges[0]?.textContent).toBe('A')
      expect(badges[1]?.textContent).toBe('C')
    })

    it('renders station name in header', () => {
      panel.show('Muzeum', ['A'])
      const title = container.querySelector('.departure-panel__title')
      expect(title?.textContent).toContain('Muzeum')
    })

    it('shows Loading… before fetch resolves', () => {
      fetcher.mockReturnValue(new Promise(() => {}))  // never resolves
      panel.show('Muzeum', ['A'])
      expect(container.querySelector('.departure-panel__status')?.textContent).toBe('Loading…')
    })

    it('calls fetcher with the station name', async () => {
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()
      expect(fetcher).toHaveBeenCalledWith('Muzeum')
    })
  })

  describe('hide()', () => {
    it('adds hidden class', () => {
      panel.show('Muzeum', ['A'])
      panel.hide()
      expect(container.querySelector('.departure-panel')?.classList.contains('hidden')).toBe(true)
    })

    it('stops the refresh timer', async () => {
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()  // first fetch
      const callsAtHide = fetcher.mock.calls.length

      panel.hide()
      await vi.advanceTimersByTimeAsync(60_000)  // well past REFRESH_MS

      expect(fetcher).toHaveBeenCalledTimes(callsAtHide)  // no further fetches
    })
  })

  describe('renderDepartures', () => {
    it('filters out past departures (mins < 0)', async () => {
      fetcher.mockResolvedValue([
        { line: 'A', headsign: 'Past stop', predictedAt: futureIso(-2 * 60_000), delaySec: 0 },
        { line: 'B', headsign: 'Zličín', predictedAt: futureIso(5 * 60_000), delaySec: 0 },
      ])
      panel.show('Muzeum', ['A', 'B'])
      await flushMicrotasks()

      const rows = container.querySelectorAll('.departure-row')
      expect(rows).toHaveLength(1)
      expect(rows[0]?.querySelector('.departure-row__dest')?.textContent).toBe('Zličín')
    })

    it('limits results to 8 departures', async () => {
      const departures = Array.from({ length: 10 }, (_, i) => ({
        line: 'A',
        headsign: `Dest ${i}`,
        predictedAt: futureIso((i + 1) * 60_000),
        delaySec: 0,
      }))
      fetcher.mockResolvedValue(departures)
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()

      expect(container.querySelectorAll('.departure-row')).toHaveLength(8)
    })

    it('shows "Now" for a departure at 0 minutes', async () => {
      fetcher.mockResolvedValue([
        { line: 'A', headsign: 'Depo', predictedAt: new Date().toISOString(), delaySec: 0 },
      ])
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()

      const timeEl = container.querySelector('.departure-row__time')
      expect(timeEl?.textContent).toBe('Now')
    })

    it('shows "X min" for future departures', async () => {
      fetcher.mockResolvedValue([
        { line: 'A', headsign: 'Depo', predictedAt: futureIso(7 * 60_000), delaySec: 0 },
      ])
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()

      const timeEl = container.querySelector('.departure-row__time')
      expect(timeEl?.textContent).toBe('7 min')
    })

    it('shows empty state when no upcoming departures', async () => {
      fetcher.mockResolvedValue([
        { line: 'A', headsign: 'Past', predictedAt: futureIso(-5 * 60_000), delaySec: 0 },
      ])
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()

      expect(container.querySelector('.departure-panel__empty')).not.toBeNull()
    })
  })

  describe('error handling', () => {
    it('shows "Departures unavailable" for generic errors', async () => {
      fetcher.mockRejectedValue(new Error('Network error'))
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()

      expect(container.querySelector('.departure-panel__status')?.textContent).toBe('Departures unavailable')
    })

    it('shows "Timeout — retrying" for FetchError with status 0', async () => {
      fetcher.mockRejectedValue(new FetchError('/api/departures', 0, 'Request timed out'))
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()

      expect(container.querySelector('.departure-panel__status')?.textContent).toBe('Timeout — retrying')
    })

    it('shows "Rate limit (429)" for FetchError with status 429', async () => {
      fetcher.mockRejectedValue(new FetchError('/api/departures', 429, 'HTTP 429'))
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()

      expect(container.querySelector('.departure-panel__status')?.textContent).toBe('Rate limit (429)')
    })

    it('shows "Departures unavailable" for other FetchErrors', async () => {
      fetcher.mockRejectedValue(new FetchError('/api/departures', 503, 'HTTP 503'))
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()

      expect(container.querySelector('.departure-panel__status')?.textContent).toBe('Departures unavailable')
    })
  })

  describe('refresh timer', () => {
    it('re-fetches after REFRESH_MS (30s)', async () => {
      panel.show('Muzeum', ['A'])
      await flushMicrotasks()  // first fetch completes, schedules next timer
      expect(fetcher).toHaveBeenCalledTimes(1)

      // Advance exactly REFRESH_MS so the scheduled timer fires
      await vi.advanceTimersByTimeAsync(30_000)
      await flushMicrotasks()  // second fetch completes

      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('does not pile up if previous fetch is slow', async () => {
      let resolveFetch!: () => void
      fetcher.mockImplementation(
        () => new Promise<never>(resolve => { resolveFetch = resolve as () => void })
      )

      panel.show('Muzeum', ['A'])
      // Advance well past REFRESH_MS while the first fetch is still in-flight
      await vi.advanceTimersByTimeAsync(60_000)

      // Only one call — no pile-up because we use setTimeout chain, not setInterval
      expect(fetcher).toHaveBeenCalledTimes(1)

      resolveFetch()
    })
  })
})
