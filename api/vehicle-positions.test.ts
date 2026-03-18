import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFeature(routeShortName: string, routeType: number, lon = 14.4, lat = 50.08) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      trip: { gtfs: { trip_id: `trip-${routeShortName}`, route_short_name: routeShortName, route_type: routeType, trip_headsign: 'Test' } },
      last_position: { delay: null, origin_timestamp: null, shape_dist_traveled: '0' },
    },
  }
}

function makeCollection(features: unknown[]) {
  return { type: 'FeatureCollection', features }
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

function makeRes() {
  const headers: Record<string, string> = {}
  let code = 0
  let body: unknown
  return {
    status(n: number) { code = n; return this },
    json(b: unknown) { body = b; return this },
    setHeader(k: string, v: string) { headers[k] = v },
    _code: () => code,
    _body: () => body,
    _headers: () => headers,
  } as unknown as VercelResponse & { _code(): number; _body(): unknown; _headers(): Record<string,string> }
}

const req = {} as VercelRequest

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('vehicle-positions handler', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    process.env = { ...OLD_ENV, GOLEMIO_API_KEY: 'test-key' }
  })

  afterEach(() => {
    process.env = OLD_ENV
    vi.restoreAllMocks()
  })

  it('returns 500 when GOLEMIO_API_KEY is not set', async () => {
    delete process.env['GOLEMIO_API_KEY']
    const { default: handler } = await import('./vehicle-positions')
    const res = makeRes()
    await handler(req, res)
    expect(res._code()).toBe(500)
    expect(res._body()).toMatchObject({ error: expect.stringContaining('GOLEMIO_API_KEY') })
  })

  it('passes the FeatureCollection through unchanged on success', async () => {
    const collection = makeCollection([makeFeature('C', 1), makeFeature('22', 0)])
    vi.stubGlobal('fetch', mockFetch(collection))

    const { default: handler } = await import('./vehicle-positions')
    const res = makeRes()
    await handler(req, res)

    expect(res._code()).toBe(200)
    expect(res._body()).toEqual(collection)
  })

  it('sets Cache-Control and CORS headers on success', async () => {
    vi.stubGlobal('fetch', mockFetch(makeCollection([])))
    const { default: handler } = await import('./vehicle-positions')
    const res = makeRes()
    await handler(req, res)

    const headers = res._headers()
    expect(headers['Cache-Control']).toMatch(/max-age=/)
    expect(headers['Access-Control-Allow-Origin']).toBeTruthy()
  })

  it('returns upstream status when Golemio responds with an error', async () => {
    vi.stubGlobal('fetch', mockFetch({ message: 'bad request' }, 400))
    const { default: handler } = await import('./vehicle-positions')
    const res = makeRes()
    await handler(req, res)

    expect(res._code()).toBe(400)
    expect(res._body()).toMatchObject({ error: expect.stringContaining('400') })
  })

  it('returns 504 on fetch timeout (AbortError)', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr))
    const { default: handler } = await import('./vehicle-positions')
    const res = makeRes()
    await handler(req, res)

    expect(res._code()).toBe(504)
    expect(res._body()).toMatchObject({ error: expect.stringContaining('timed out') })
  })

  it('returns 502 on unexpected fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { default: handler } = await import('./vehicle-positions')
    const res = makeRes()
    await handler(req, res)

    expect(res._code()).toBe(502)
  })

  it('sends the API key as X-Access-Token header', async () => {
    let capturedHeaders: Record<string, string> | undefined
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: { headers?: Record<string, string> }) => {
      capturedHeaders = init.headers
      return Promise.resolve({ ok: true, status: 200, json: async () => makeCollection([]) })
    }))

    const { default: handler } = await import('./vehicle-positions')
    await handler(req, makeRes())

    expect((capturedHeaders as Record<string, string>)['X-Access-Token']).toBe('test-key')
  })
})
