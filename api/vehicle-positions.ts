import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCors, handlePreflight, isAllowedOrigin } from './_cors'

const GOLEMIO_URL = 'https://api.golemio.cz/v2/vehiclepositions'
// Golemio has no route-type filter; fetch all vehicles and let the client filter by route_type.
// limit=1500 comfortably covers all Prague trams (~300) + metro (~100) at peak hours.
const UPSTREAM_PARAMS = 'limit=1500&includeNotTracking=false'
const UPSTREAM_TIMEOUT_MS = 8_000

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (handlePreflight(req, res)) return
  if (!isAllowedOrigin(req)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  setCors(res)

  const apiKey = process.env['GOLEMIO_API_KEY']
  if (!apiKey) {
    res.status(500).json({ error: 'GOLEMIO_API_KEY not configured' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const upstream = await fetch(`${GOLEMIO_URL}?${UPSTREAM_PARAMS}`, {
      headers: { 'X-Access-Token': apiKey, Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` })
      return
    }

    const data: unknown = await upstream.json()

    res.setHeader('Cache-Control', 'public, max-age=15')
    res.status(200).json(data)
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
