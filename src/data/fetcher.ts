import { FetchError } from '@/core/errors'
import type { GolemioVehiclePositionsResponse, Vehicle } from '@/types'
import { API } from '@/core/config'

export async function fetchVehiclePositions(): Promise<Vehicle[]> {
  const res = await fetch(API.vehiclePositions)
  if (!res.ok) {
    throw new FetchError(API.vehiclePositions, res.status, `HTTP ${res.status}`)
  }
  const data: GolemioVehiclePositionsResponse = await res.json()
  return data.features.map(f => {
    const delaySec =
      f.properties.last_position.delay ??
      f.properties.last_position.last_stop_arrival_delay ??
      undefined
    return {
      id: f.properties.trip.gtfs.trip_id,
      tripId: f.properties.trip.gtfs.trip_id,
      lineId: f.properties.trip.gtfs.route_short_name,
      progress: 0, // TODO: compute from shape_dist_traveled vs total shape length
      delaySec: delaySec ?? undefined,
      delayStatus: classifyDelay(delaySec),
      updatedAt: f.properties.last_position.updated_at,
    }
  })
}

function classifyDelay(sec: number | null | undefined): Vehicle['delayStatus'] {
  if (sec == null) return 'unknown'
  if (sec < 60) return 'on-time'
  if (sec < 300) return 'slight'
  return 'late'
}
