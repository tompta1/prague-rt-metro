import type { Vehicle } from '@/types'
import { fetchVehiclePositions } from './fetcher'
import { POLL_INTERVAL_MS } from '@/core/config'

type Listener = (vehicles: Vehicle[], error: Error | null) => void

let vehicles: Vehicle[] = []
let lastError: Error | null = null
const listeners = new Set<Listener>()
let timerId: ReturnType<typeof setTimeout> | null = null
let pollController: AbortController | null = null
let isPolling = false

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  fn(vehicles, lastError)
  return () => listeners.delete(fn)
}

export function startPolling(): void {
  if (isPolling) return
  isPolling = true
  void poll()
}

export function stopPolling(): void {
  isPolling = false
  if (timerId !== null) {
    clearTimeout(timerId)
    timerId = null
  }
  pollController?.abort()
  pollController = null
}

async function poll(): Promise<void> {
  pollController = new AbortController()
  const { signal } = pollController
  try {
    vehicles = await fetchVehiclePositions(signal)
    lastError = null
    listeners.forEach(fn => fn(vehicles, null))
  } catch (err) {
    if (signal.aborted) return  // deliberately stopped — don't notify or reschedule
    lastError = err instanceof Error ? err : new Error(String(err))
    console.warn('[store] vehicle positions fetch failed', lastError.message)
    // Notify listeners with the stale vehicle list so the map stays visible
    listeners.forEach(fn => fn(vehicles, lastError))
  } finally {
    // setTimeout chain: next poll only starts after this one completes,
    // preventing pile-up if Golemio is slow.
    if (isPolling && !signal.aborted) {
      timerId = setTimeout(() => void poll(), POLL_INTERVAL_MS)
    } else {
      timerId = null
    }
  }
}
