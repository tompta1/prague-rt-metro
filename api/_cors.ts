import type { VercelRequest, VercelResponse } from '@vercel/node'

const ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'https://tompta1.github.io'

export function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

/** Returns true if the request was a preflight and has been handled. */
export function handlePreflight(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'OPTIONS') return false
  setCors(res)
  res.status(204).end()
  return true
}
