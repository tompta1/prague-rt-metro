import type { Vehicle } from '@/types'
import { fetchVehiclePositions } from './fetcher'
import { POLL_INTERVAL_MS } from '@/core/config'

type Listener = (vehicles: Vehicle[]) => void

let vehicles: Vehicle[] = []
const listeners = new Set<Listener>()
let timerId: ReturnType<typeof setInterval> | null = null

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  fn(vehicles)
  return () => listeners.delete(fn)
}

export function startPolling(): void {
  if (timerId !== null) return
  void poll()
  timerId = setInterval(() => void poll(), POLL_INTERVAL_MS)
}

export function stopPolling(): void {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

async function poll(): Promise<void> {
  try {
    vehicles = await fetchVehiclePositions()
    listeners.forEach(fn => fn(vehicles))
  } catch (err) {
    console.warn('[store] vehicle positions fetch failed', err)
  }
}
