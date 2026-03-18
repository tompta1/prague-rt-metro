/** Geographic bounding box matching build-network.ts and network.json */
export const LON_MIN = 14.22, LON_MAX = 14.65
export const LAT_MIN = 49.97, LAT_MAX = 50.17
export const SVG_W = 1000, SVG_H = 700

/** Project geographic lon/lat to SVG canvas coordinates */
export function project(lon: number, lat: number): [number, number] {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * SVG_W
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H
  return [x, y]
}
