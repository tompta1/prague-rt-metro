import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classifyDelay, fetchVehiclePositions, fetchDepartures, FETCH_TIMEOUT_MS } from '@/data/fetcher'

// ── classifyDelay ─────────────────────────────────────────────────────────────

describe('classifyDelay', () => {
  it('null → unknown', () => expect(classifyDelay(null)).toBe('unknown'))
  it('undefined → unknown', () => expect(classifyDelay(undefined)).toBe('unknown'))
  it('0 → on-time', () => expect(classifyDelay(0)).toBe('on-time'))
  it('59 → on-time', () => expect(classifyDelay(59)).toBe('on-time'))
  it('60 → slight', () => expect(classifyDelay(60)).toBe('slight'))
  it('299 → slight', () => expect(classifyDelay(299)).toBe('slight'))
  it('300 → late', () => expect(classifyDelay(300)).toBe('late'))
  it('600 → late', () => expect(classifyDelay(600)).toBe('late'))
  it('negative (ahead of schedule) → on-time', () => expect(classifyDelay(-30)).toBe('on-time'))
})

// ── fetchVehiclePositions ─────────────────────────────────────────────────────

function makeValidResponse() {
  return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 })
}

describe('fetchVehiclePositions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns Vehicle[] on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(makeValidResponse())))

    const result = await fetchVehiclePositions()
    expect(result).toEqual([])
  })

  it('retries once on non-5xx fetch error (e.g. 400)', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      calls++
      if (calls === 1) return new Response('Bad Request', { status: 400 })
      return makeValidResponse()
    }))

    const promise = fetchVehiclePositions()
    // Advance past RETRY_DELAY_MS (2s) so the sleep resolves
    await vi.advanceTimersByTimeAsync(2_500)
    const result = await promise

    expect(calls).toBe(2)
    expect(result).toEqual([])
  })

  it('does not retry on 5xx error', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      calls++
      return new Response('Server Error', { status: 500 })
    }))

    // Attach rejection handler immediately to prevent unhandled rejection warning
    const promise = fetchVehiclePositions()
    const caught = promise.catch(err => err)

    const err = await caught
    expect(err).toMatchObject({ status: 500 })
    expect(calls).toBe(1)
  })

  it('throws FetchError on timeout after FETCH_TIMEOUT_MS', async () => {
    // Mock fetch that respects the abort signal (real fetch does this; mocks don't by default)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        const signal = init?.signal
        const onAbort = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        if (signal?.aborted) { onAbort(); return }
        signal?.addEventListener('abort', onAbort)
      })
    ))

    const promise = fetchVehiclePositions()
    const caught = promise.catch(err => err)

    // First fetchOnce: fire the internal timeout → AbortError → FetchError(0)
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 100)
    // fetchVehiclePositions catches FetchError(0) and sleeps before retrying
    await vi.advanceTimersByTimeAsync(2_500)
    // Second fetchOnce: fire the internal timeout again
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 100)

    const err = await caught
    expect(err.message).toBe('Request timed out')
  })

  it('throws FetchError with descriptive message on invalid response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      () => Promise.resolve(new Response(JSON.stringify({ unexpected: true }), { status: 200 }))
    ))

    const promise = fetchVehiclePositions()
    const caught = promise.catch(err => err)

    // Shape validation failure is not a 5xx, so it retries once after 2s sleep
    await vi.advanceTimersByTimeAsync(2_500)

    const err = await caught
    expect(err.message).toBe('Unexpected API response shape')
  })
})

// ── fetchDepartures ───────────────────────────────────────────────────────────

const VALID_DEPARTURES_RESPONSE = {
  departures: [
    {
      departure_timestamp: {
        scheduled: '2026-03-18T12:00:00Z',
        predicted: '2026-03-18T12:01:00Z',
      },
      delay: { is_available: true, seconds: 60 },
      route: { short_name: 'A', type: 1 },
      trip: { headsign: 'Depo Hostivař' },
    },
  ],
}

describe('fetchDepartures', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns Departure[] on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      () => Promise.resolve(new Response(JSON.stringify(VALID_DEPARTURES_RESPONSE), { status: 200 }))
    ))

    const result = await fetchDepartures('Muzeum')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      line: 'A',
      headsign: 'Depo Hostivař',
      predictedAt: '2026-03-18T12:01:00Z',
      delaySec: 60,
    })
  })

  it('throws FetchError on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      () => Promise.resolve(new Response('Not Found', { status: 404 }))
    ))

    await expect(fetchDepartures('Muzeum')).rejects.toMatchObject({ status: 404 })
  })

  it('maps null delay to 0', async () => {
    const response = {
      departures: [{
        departure_timestamp: { scheduled: '2026-03-18T12:00:00Z', predicted: '2026-03-18T12:00:00Z' },
        delay: null,
        route: { short_name: 'B', type: 1 },
        trip: { headsign: 'Zličín' },
      }],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      () => Promise.resolve(new Response(JSON.stringify(response), { status: 200 }))
    ))

    const result = await fetchDepartures('Muzeum')
    expect(result[0]!.delaySec).toBe(0)
  })
})
