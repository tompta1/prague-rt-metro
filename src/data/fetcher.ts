import { FetchError } from '@/core/errors'
import type { Departure, GolemioDeparture, GolemioDepartureResponse, GolemioVehiclePositionsResponse, Vehicle } from '@/types'
import { API } from '@/core/config'
import { toCanonicalProgress, LINE_TOTAL_KM } from '@/map/network'

const METRO_LINE_IDS = new Set(Object.keys(LINE_TOTAL_KM))  // A, B, C
export const FETCH_TIMEOUT_MS = 12_000
const RETRY_DELAY_MS = 2_000

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  // Combine internal timeout signal with any external signal from caller
  const externalSignal = init?.signal instanceof AbortSignal ? init.signal : null
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal

  try {
    return await fetch(url, { ...init, signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (controller.signal.aborted) {
        throw new FetchError(url, 0, 'Request timed out')
      }
      throw err  // external abort — re-throw as-is
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchVehiclePositions(signal?: AbortSignal): Promise<Vehicle[]> {
  try {
    return await fetchOnce(signal)
  } catch (err) {
    if (signal?.aborted) throw err
    if (err instanceof FetchError && err.status >= 500) throw err
    await sleep(RETRY_DELAY_MS)
    return await fetchOnce(signal)
  }
}

async function fetchOnce(signal?: AbortSignal): Promise<Vehicle[]> {
  const res = await fetchWithTimeout(API.vehiclePositions, signal ? { signal } : undefined)

  if (!res.ok) {
    throw new FetchError(API.vehiclePositions, res.status, `HTTP ${res.status}`)
  }

  const data: unknown = await res.json()
  if (!isValidVehiclePositionsResponse(data)) {
    throw new FetchError(API.vehiclePositions, 0, 'Unexpected API response shape')
  }

  return data.features.flatMap((f): Vehicle[] => {
    const gtfs = f.properties.trip.gtfs
    const pos = f.properties.last_position
    const lineId = gtfs.route_short_name
    const routeType = gtfs.route_type

    const isMetro = routeType === 1
    const type = routeTypeToVehicleType(routeType)

    // Metro with unknown line ID (not A/B/C) — drop
    if (isMetro && !METRO_LINE_IDS.has(lineId)) return []

    const headsign = gtfs.trip_headsign ?? ''
    const delaySec = pos.delay?.actual ?? pos.delay?.last_stop_arrival ?? undefined

    if (!isMetro) {
      const [lon, lat] = f.geometry.coordinates
      return [{
        id: gtfs.trip_id,
        tripId: gtfs.trip_id,
        lineId,
        type,
        progress: 0,
        geoPos: [lon, lat] as [number, number],
        headsign,
        delaySec: delaySec ?? undefined,
        delayStatus: classifyDelay(delaySec),
        updatedAt: pos.origin_timestamp ?? '',
      }]
    }

    // Metro: use shape_dist_traveled for progress along the line
    const shapeDistKm = parseFloat(pos.shape_dist_traveled ?? '0')
    return [{
      id: gtfs.trip_id,
      tripId: gtfs.trip_id,
      lineId,
      type: 'metro' as const,
      headsign,
      progress: toCanonicalProgress(lineId, headsign, shapeDistKm),
      delaySec: delaySec ?? undefined,
      delayStatus: classifyDelay(delaySec),
      updatedAt: pos.origin_timestamp ?? '',
    }]
  })
}

function routeTypeToVehicleType(routeType: number): Vehicle['type'] {
  switch (routeType) {
    case 0:  return 'tram'
    case 1:  return 'metro'
    case 2:  return 'rail'
    case 3:  return 'bus'
    case 4:  return 'ferry'
    case 11: return 'trolleybus'
    default: return 'other'
  }
}

function isValidVehiclePositionsResponse(data: unknown): data is GolemioVehiclePositionsResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'features' in data &&
    Array.isArray((data as { features: unknown }).features)
  )
}

export function classifyDelay(sec: number | null | undefined): Vehicle['delayStatus'] {
  if (sec == null) return 'unknown'
  if (sec < 60) return 'on-time'
  if (sec < 300) return 'slight'
  return 'late'
}

export async function fetchDepartures(stationName: string): Promise<Departure[]> {
  const res = await fetchWithTimeout(API.departures(stationName))

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
