// ── Static network types ─────────────────────────────────────────────────────

export interface Line {
  id: string        // e.g. "A", "B", "C", "1", "22"
  name: string
  color: string     // CSS hex
  type: 'metro' | 'tram'
}

export interface Station {
  id: string
  name: string
  lineIds: string[]
  /** Schematic SVG coordinates */
  x: number
  y: number
  isInterchange: boolean
}

export interface Segment {
  id: string
  lineId: string
  fromStationId: string
  toStationId: string
  /** Intermediate schematic SVG waypoints */
  waypoints: Array<{ x: number; y: number }>
}

// ── Realtime types ───────────────────────────────────────────────────────────

export type DelayStatus = 'on-time' | 'slight' | 'late' | 'unknown'

export interface Vehicle {
  id: string
  tripId: string
  lineId: string
  /** Progress along route 0–1 */
  progress: number
  /** Delay in seconds, undefined if unknown */
  delaySec?: number
  delayStatus: DelayStatus
  /** ISO timestamp of last position update */
  updatedAt: string
}

// ── API response shapes (Golemio /v2/vehiclepositions) ───────────────────────

export interface GolemioVehicle {
  geometry: { coordinates: [number, number]; type: 'Point' }
  properties: {
    trip: {
      gtfs: {
        trip_id: string
        route_short_name: string
        shape_dist_traveled: number
      }
    }
    last_position: {
      delay: number | null
      last_stop_arrival_delay: number | null
      updated_at: string
    }
  }
}

export interface GolemioVehiclePositionsResponse {
  type: 'FeatureCollection'
  features: GolemioVehicle[]
}
