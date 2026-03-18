import { FetchError } from '@/core/errors'
import type { Departure, GolemioDeparture, GolemioDepartureResponse, GolemioVehiclePositionsResponse, Vehicle } from '@/types'
import { API } from '@/core/config'
import { toCanonicalProgress, LINE_TOTAL_KM } from '@/map/network'

const KNOWN_LINE_IDS = new Set(Object.keys(LINE_TOTAL_KM))  // A, B, C
const FETCH_TIMEOUT_MS = 12_000
const RETRY_DELAY_MS = 2_000

export async function fetchVehiclePositions(): Promise<Vehicle[]> {
  try {
    return await fetchOnce()
  } catch (err) {
    if (err instanceof FetchError && err.status >= 500) throw err
    await sleep(RETRY_DELAY_MS)
    return await fetchOnce()
  }
}

async function fetchOnce(): Promise<Vehicle[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(API.vehiclePositions, { signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FetchError(API.vehiclePositions, 0, 'Request timed out')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new FetchError(API.vehiclePositions, res.status, `HTTP ${res.status}`)
  }

  const data: GolemioVehiclePositionsResponse = await res.json()

  return data.features.flatMap(f => {
    const gtfs = f.properties.trip.gtfs
    const pos = f.properties.last_position
    const lineId = gtfs.route_short_name

    if (!KNOWN_LINE_IDS.has(lineId)) return []

    const headsign = gtfs.trip_headsign ?? ''
    const shapeDistKm = parseFloat(pos.shape_dist_traveled ?? '0')
    const delaySec = pos.delay?.actual ?? pos.delay?.last_stop_arrival ?? undefined

    return [{
      id: gtfs.trip_id,
      tripId: gtfs.trip_id,
      lineId,
      headsign,
      progress: toCanonicalProgress(lineId, headsign, shapeDistKm),
      delaySec: delaySec ?? undefined,
      delayStatus: classifyDelay(delaySec),
      updatedAt: pos.origin_timestamp ?? '',
    }]
  })
}

function classifyDelay(sec: number | null | undefined): Vehicle['delayStatus'] {
  if (sec == null) return 'unknown'
  if (sec < 60) return 'on-time'
  if (sec < 300) return 'slight'
  return 'late'
}

export async function fetchDepartures(stationName: string): Promise<Departure[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(API.departures(stationName), { signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FetchError(API.departures(stationName), 0, 'Request timed out')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) throw new FetchError(API.departures(stationName), res.status, `HTTP ${res.status}`)

  const data: GolemioDepartureResponse = await res.json()

  return data.departures.map((d: GolemioDeparture) => ({
    line: d.route.short_name,
    headsign: d.trip.headsign,
    predictedAt: d.departure_timestamp.predicted,
    delaySec: d.delay?.seconds ?? 0,
  }))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
