// ── Static network types ─────────────────────────────────────────────────────

export interface Line {
  id: string
  name: string
  color: string
  type: 'metro' | 'tram'
}

export interface Station {
  id: string
  name: string
  lineIds: string[]
  x: number
  y: number
  isInterchange: boolean
}

export interface Segment {
  id: string
  lineId: string
  fromStationId: string
  toStationId: string
  waypoints: Array<{ x: number; y: number }>
}

// ── Realtime types ───────────────────────────────────────────────────────────

export type DelayStatus = 'on-time' | 'slight' | 'late' | 'unknown'

export interface Vehicle {
  id: string
  tripId: string
  lineId: string
  type: 'metro' | 'tram'
  /** Canonical progress 0–1 — set for metro, 0 for trams (use geoPos instead) */
  progress: number
  /** GPS position [lon, lat] — set for trams, undefined for metro */
  geoPos?: [number, number]
  /** Delay in seconds, undefined if unknown */
  delaySec?: number
  delayStatus: DelayStatus
  /** Trip headsign (destination terminal) */
  headsign: string
  /** ISO timestamp of last position update */
  updatedAt: string
}

// ── Departure board ───────────────────────────────────────────────────────────

export interface Departure {
  line: string
  headsign: string
  predictedAt: string
  delaySec: number
}

export interface GolemioDeparture {
  departure_timestamp: {
    scheduled: string
    predicted: string
  }
  delay: { is_available: boolean; seconds: number } | null
  route: { short_name: string; type: number }
  trip: { headsign: string }
}

export interface GolemioDepartureResponse {
  departures: GolemioDeparture[]
}

// ── API response shapes (Golemio /v2/vehiclepositions) ───────────────────────

export interface GolemioVehicle {
  geometry: { coordinates: [number, number]; type: 'Point' }
  properties: {
    trip: {
      gtfs: {
        trip_id: string
        route_short_name: string
        route_type: number
        trip_headsign: string | null
      }
    }
    last_position: {
      delay: { actual: number | null; last_stop_arrival: number | null } | null
      origin_timestamp: string | null
      shape_dist_traveled: string | null
    }
  }
}

export interface GolemioVehiclePositionsResponse {
  type: 'FeatureCollection'
  features: GolemioVehicle[]
}
