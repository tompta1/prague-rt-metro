import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'https://tompta1.github.io'

export function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
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

/**
 * Returns true if the request origin is allowed.
 * Requests without an Origin header (e.g. curl, server-to-server) are permitted.
 * Requests with an Origin header that does not match ALLOWED_ORIGIN are rejected.
 */
export function isAllowedOrigin(req: VercelRequest): boolean {
  const origin = req.headers?.['origin']
  if (!origin) return true
  return origin === ALLOWED_ORIGIN
}
