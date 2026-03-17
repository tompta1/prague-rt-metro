import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOLEMIO_URL = 'https://api.golemio.cz/v2/pid/departureboards'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const apiKey = process.env['GOLEMIO_API_KEY']
  if (!apiKey) {
    res.status(500).json({ error: 'GOLEMIO_API_KEY not configured' })
    return
  }

  const stopId = req.query['stopId']
  if (!stopId || typeof stopId !== 'string') {
    res.status(400).json({ error: 'stopId query parameter is required' })
    return
  }

  try {
    const url = `${GOLEMIO_URL}?aswIds=${encodeURIComponent(stopId)}&minutesBefore=0&minutesAfter=30&mode=departures`
    const upstream = await fetch(url, {
      headers: {
        'X-Access-Token': apiKey,
        Accept: 'application/json',
      },
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
    console.error('[departures]', err)
    res.status(502).json({ error: 'Failed to reach Golemio' })
  }
}
