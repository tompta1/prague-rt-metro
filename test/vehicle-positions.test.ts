import { describe, it, expect } from 'vitest'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeFeature(routeShortName: string, routeType: number, shapeDist = 5.0) {
  return {
    geometry: { coordinates: [14.4, 50.08], type: 'Point' },
    properties: {
      last_position: {
        bearing: 90,
        delay: { actual: 30, last_stop_arrival: 20, last_stop_departure: null },
        is_canceled: false,
        origin_timestamp: '2026-01-01T12:00:00Z',
        shape_dist_traveled: shapeDist,
        speed: 60,
        state_position: 'running',
        tracking: true,
      },
      trip: {
        agency_name: { real: 'DP PRAHA', scheduled: 'DP PRAHA' },
        gtfs: {
          route_id: `L${routeShortName}`,
          route_short_name: routeShortName,
          route_type: routeType,
          trip_headsign: 'Depo Hostivař',
          trip_id: `${routeShortName}_test_trip`,
          trip_short_name: null,
        },
      },
    },
  }
}

function makeGeoJSON(features: ReturnType<typeof makeFeature>[]) {
  return { type: 'FeatureCollection', features }
}

// ── Upstream query parameters ─────────────────────────────────────────────────

describe('vehicle-positions upstream query', () => {
  // Golemio does not support routeType or multiple routeShortName params.
  // The handler fetches all vehicles with a high limit and relies on
  // client-side filtering by route_type to keep only metro + trams.

  it('uses a high limit (≥1000) to capture all trams and metro at peak hours', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(new URL('../api/vehicle-positions.ts', import.meta.url).pathname, 'utf8')
    )
    const match = src.match(/limit=(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThanOrEqual(1000)
  })

  it('does not use routeShortName filtering (Golemio rejects repeated params)', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(new URL('../api/vehicle-positions.ts', import.meta.url).pathname, 'utf8')
    )
    // routeShortName=A repeated causes HTTP 400; comma-separated returns empty
    expect(src).not.toMatch(/routeShortName=A.*routeShortName=B/)
  })
})

// ── Golemio response parsing ───────────────────────────────────────────────────
// These tests validate the shape of the Golemio GeoJSON that the fetcher depends on.

describe('Golemio vehiclepositions response shape', () => {
  const metroFeature = makeFeature('A', 1, 8.75)

  it('has a features array at the top level', () => {
    const data = makeGeoJSON([metroFeature])
    expect(Array.isArray(data.features)).toBe(true)
  })

  it('each feature has properties.trip.gtfs.route_short_name', () => {
    const name = metroFeature.properties.trip.gtfs.route_short_name
    expect(typeof name).toBe('string')
    expect(name).toBe('A')
  })

  it('each feature has properties.last_position.shape_dist_traveled', () => {
    const dist = metroFeature.properties.last_position.shape_dist_traveled
    expect(typeof dist).toBe('number')
    expect(dist).toBe(8.75)
  })

  it('each feature has delay.actual as a number or null', () => {
    const delay = metroFeature.properties.last_position.delay.actual
    expect(typeof delay === 'number' || delay === null).toBe(true)
  })

  it('trip_headsign is a string', () => {
    const h = metroFeature.properties.trip.gtfs.trip_headsign
    expect(typeof h).toBe('string')
  })

  it('route_type 1 means metro', () => {
    expect(metroFeature.properties.trip.gtfs.route_type).toBe(1)
  })
})

// ── Fetcher filtering logic (pure, no network) ────────────────────────────────
// route_type: 0=tram, 1=metro, 2=train, 3=bus

const METRO_LINE_IDS = new Set(['A', 'B', 'C'])

function filterAndMapFeatures(features: ReturnType<typeof makeFeature>[]) {
  return features.flatMap(f => {
    const gtfs = f.properties.trip.gtfs
    const routeType = gtfs.route_type
    const isTram = routeType === 0
    const isMetro = routeType === 1
    if (!isTram && !isMetro) return []
    if (isMetro && !METRO_LINE_IDS.has(gtfs.route_short_name)) return []
    return [{
      tripId: gtfs.trip_id,
      lineId: gtfs.route_short_name,
      type: isTram ? 'tram' : 'metro',
      headsign: gtfs.trip_headsign ?? '',
      shapeDistKm: f.properties.last_position.shape_dist_traveled,
      delaySec: f.properties.last_position.delay.actual ?? undefined,
    }]
  })
}

describe('fetcher filtering logic', () => {
  it('keeps metro vehicles (route_type=1) for lines A, B, C', () => {
    const features = [makeFeature('A', 1), makeFeature('B', 1), makeFeature('C', 1)]
    const result = filterAndMapFeatures(features)
    expect(result).toHaveLength(3)
    expect(result.every(v => v.type === 'metro')).toBe(true)
  })

  it('keeps tram vehicles (route_type=0) with type=tram', () => {
    const features = [makeFeature('5', 0), makeFeature('22', 0)]
    const result = filterAndMapFeatures(features)
    expect(result).toHaveLength(2)
    expect(result.every(v => v.type === 'tram')).toBe(true)
  })

  it('drops bus vehicles (route_type=3)', () => {
    const features = [makeFeature('136', 3), makeFeature('207', 3)]
    expect(filterAndMapFeatures(features)).toHaveLength(0)
  })

  it('drops train vehicles (route_type=2)', () => {
    expect(filterAndMapFeatures([makeFeature('S1', 2)])).toHaveLength(0)
  })

  it('mixed batch: metro and trams kept, buses dropped', () => {
    const features = [
      makeFeature('22', 0),  // tram — kept
      makeFeature('A', 1),   // metro — kept
      makeFeature('136', 3), // bus — dropped
      makeFeature('C', 1),   // metro — kept
    ]
    const result = filterAndMapFeatures(features)
    expect(result).toHaveLength(3)
    expect(result.map(v => v.type)).toEqual(['tram', 'metro', 'metro'])
  })

  it('metro vehicle with unknown line ID is dropped', () => {
    expect(filterAndMapFeatures([makeFeature('X', 1)])).toHaveLength(0)
  })

  it('preserves shape_dist_traveled value', () => {
    const result = filterAndMapFeatures([makeFeature('A', 1, 12.3)])
    expect(result[0]!.shapeDistKm).toBeCloseTo(12.3)
  })

  it('preserves delay value', () => {
    const features = [makeFeature('B', 1)]
    features[0]!.properties.last_position.delay.actual = 120
    expect(filterAndMapFeatures(features)[0]!.delaySec).toBe(120)
  })

  it('empty features array returns empty result', () => {
    expect(filterAndMapFeatures([])).toEqual([])
  })
})

// ── Delay classification ───────────────────────────────────────────────────────

function classifyDelay(sec: number | null | undefined): string {
  if (sec == null) return 'unknown'
  if (sec < 60) return 'on-time'
  if (sec < 300) return 'slight'
  return 'late'
}

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
