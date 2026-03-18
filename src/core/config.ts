/** Base URL for the Vercel proxy. Set via environment variable at build time. */
export const PROXY_BASE_URL =
  ((import.meta.env['VITE_PROXY_BASE_URL'] as string | undefined) ?? '').replace(/\/$/, '')

export const API = {
  vehiclePositions: `${PROXY_BASE_URL}/api/vehicle-positions`,
  departures: (stationName: string) =>
    `${PROXY_BASE_URL}/api/departures?name=${encodeURIComponent(stationName)}`,
} as const

/** Vehicle positions polling interval in ms */
export const POLL_INTERVAL_MS = 20_000
