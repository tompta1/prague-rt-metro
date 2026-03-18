import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOLEMIO_URL = 'https://api.golemio.cz/v2/pid/departureboards'
const UPSTREAM_TIMEOUT_MS = 8_000

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const apiKey = process.env['GOLEMIO_API_KEY']
  if (!apiKey) {
    res.status(500).json({ error: 'GOLEMIO_API_KEY not configured' })
    return
  }

  const name = req.query['name']
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name query parameter is required' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const url = `${GOLEMIO_URL}?names=${encodeURIComponent(name)}&minutesBefore=0&minutesAfter=60&mode=departures&limit=10`
    const upstream = await fetch(url, {
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

    res.setHeader('Cache-Control', 'public, max-age=10')
    res.setHeader('Access-Control-Allow-Origin', process.env['ALLOWED_ORIGIN'] ?? '*')
    res.status(200).json(data)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[departures] upstream timeout')
      res.status(504).json({ error: 'Upstream request timed out' })
    } else {
      console.error('[departures]', err)
      res.status(502).json({ error: 'Failed to reach Golemio' })
    }
  } finally {
    clearTimeout(timeout)
  }
}
