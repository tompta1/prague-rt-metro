import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOLEMIO_URL = 'https://api.golemio.cz/v2/vehiclepositions'
// routeShortName filters to metro lines only; each line runs ≤35 trains so 200 is ample.
const UPSTREAM_PARAMS = 'limit=200&includeNotTracking=false&routeShortName=A&routeShortName=B&routeShortName=C'
const UPSTREAM_TIMEOUT_MS = 8_000

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
    const upstream = await fetch(`${GOLEMIO_URL}?${UPSTREAM_PARAMS}`, {
      headers: {
        'X-Access-Token': apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` })
      return
    }

    const data: unknown = await upstream.json()

    res.setHeader('Cache-Control', 'public, max-age=15')
    res.setHeader('Access-Control-Allow-Origin', process.env['ALLOWED_ORIGIN'] ?? '*')
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
