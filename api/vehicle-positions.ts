import type { VercelRequest, VercelResponse } from '@vercel/node'

const GOLEMIO_URL = 'https://api.golemio.cz/v2/vehiclepositions'

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const apiKey = process.env['GOLEMIO_API_KEY']
  if (!apiKey) {
    res.status(500).json({ error: 'GOLEMIO_API_KEY not configured' })
    return
  }

  try {
    const upstream = await fetch(`${GOLEMIO_URL}?limit=500&includeNotTracking=false`, {
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

    res.setHeader('Cache-Control', 'public, max-age=15')
    res.setHeader('Access-Control-Allow-Origin', process.env['ALLOWED_ORIGIN'] ?? '*')
    res.status(200).json(data)
  } catch (err) {
    console.error('[vehicle-positions]', err)
    res.status(502).json({ error: 'Failed to reach Golemio' })
  }
}
