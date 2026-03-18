import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type StoreModule = typeof import('@/data/store')

// Flush pending Promise microtasks without advancing fake timers
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('store', () => {
  let store: StoreModule
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch = vi.fn()
  })

  afterEach(async () => {
    // Stop polling before switching back to real timers to prevent dangling async ops
    store?.stopPolling()
    await flushMicrotasks()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function setup(): Promise<void> {
    vi.doMock('@/data/fetcher', () => ({ fetchVehiclePositions: mockFetch }))
    store = await import('@/data/store')
  }

  it('subscribe() immediately fires listener with current empty state', async () => {
    mockFetch.mockResolvedValue([])
    await setup()

    const listener = vi.fn()
    store.subscribe(listener)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith([], null)
  })

  it('subscribe() returns an unsubscribe function that stops notifications', async () => {
    mockFetch.mockResolvedValue([{ id: 'v1' }])
    await setup()

    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    expect(listener).toHaveBeenCalledTimes(1)  // immediate fire

    unsubscribe()

    store.startPolling()
    await flushMicrotasks()  // let first poll complete

    // Still only 1 call (the initial fire) — listener was removed before poll
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('startPolling() is idempotent — second call does nothing', async () => {
    mockFetch.mockResolvedValue([])
    await setup()

    store.startPolling()
    store.startPolling()  // second call should be ignored

    await flushMicrotasks()

    // Only one fetch call, not two
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('stopPolling() prevents further polls after the current one', async () => {
    mockFetch.mockResolvedValue([])
    await setup()

    store.startPolling()
    await flushMicrotasks()  // first poll completes, schedules next via setTimeout

    const callsAfterFirstPoll = mockFetch.mock.calls.length

    store.stopPolling()
    // Advance well past POLL_INTERVAL_MS — no further polls should fire
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mockFetch).toHaveBeenCalledTimes(callsAfterFirstPoll)
  })

  it('listener receives (vehicles, error) when fetch throws', async () => {
    const fetchError = new Error('Network error')
    mockFetch.mockRejectedValue(fetchError)
    await setup()

    const listener = vi.fn()
    store.subscribe(listener)
    store.startPolling()

    // Flush microtasks so the rejected promise settles and listeners are notified.
    // Do NOT advance fake timers — that would trigger recursive polling.
    await flushMicrotasks()

    const calls = listener.mock.calls
    const errorCall = calls.find((c: unknown[]) => c[1] !== null)
    expect(errorCall).toBeDefined()
    expect(errorCall![0]).toEqual([])   // stale (empty) vehicles
    expect(errorCall![1]).toBeInstanceOf(Error)
    expect((errorCall![1] as Error).message).toBe('Network error')
  })

  it('subscribe() receives updated vehicles after successful poll', async () => {
    const mockVehicles = [{ id: 'tram-1' }]
    mockFetch.mockResolvedValue(mockVehicles)
    await setup()

    const listener = vi.fn()
    store.subscribe(listener)
    store.startPolling()

    await flushMicrotasks()

    const lastCall = listener.mock.calls[listener.mock.calls.length - 1]!
    expect(lastCall[0]).toEqual(mockVehicles)
    expect(lastCall[1]).toBeNull()
  })
})
