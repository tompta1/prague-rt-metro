import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOLEMIO_URL = 'https://api.golemio.cz/v2/vehiclepositions'
// Golemio does not support repeated routeShortName params — fetch one line at a time.
const METRO_LINES = ['A', 'B', 'C'] as const
const BASE_PARAMS = 'limit=60&includeNotTracking=false'
const UPSTREAM_TIMEOUT_MS = 8_000

interface GeoJsonFeatureCollection { type: string; features: unknown[] }

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const apiKey = process.env['GOLEMIO_API_KEY']
  if (!apiKey) {
    res.status(500).json({ error: 'GOLEMIO_API_KEY not configured' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const responses = await Promise.all(
      METRO_LINES.map(line =>
        fetch(`${GOLEMIO_URL}?${BASE_PARAMS}&routeShortName=${line}`, {
          headers: { 'X-Access-Token': apiKey, Accept: 'application/json' },
          signal: controller.signal,
        })
      )
    )

    const failed = responses.find(r => !r.ok)
    if (failed) {
      res.status(failed.status).json({ error: `Upstream error: ${failed.status}` })
      return
    }

    const bodies = await Promise.all(responses.map(r => r.json() as Promise<GeoJsonFeatureCollection>))
    const merged: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: bodies.flatMap(b => b.features),
    }

    res.setHeader('Cache-Control', 'public, max-age=15')
    res.setHeader('Access-Control-Allow-Origin', process.env['ALLOWED_ORIGIN'] ?? '*')
    res.status(200).json(merged)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[vehicle-positions] upstream timeout')
      res.status(504).json({ error: 'Upstream request timed out' })
    } else {
      console.error('[vehicle-positions]', err)
      res.status(502).json({ error: 'Failed to reach Golemio' })
    }
  } finally {
    clearTimeout(timeout)
  }
}
