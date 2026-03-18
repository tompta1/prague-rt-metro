import type { Line, Station } from '@/types'

export const LINES: Line[] = [
  { id: 'A', name: 'Metro A', color: '#00A073', type: 'metro' },
  { id: 'B', name: 'Metro B', color: '#F0C000', type: 'metro' },
  { id: 'C', name: 'Metro C', color: '#EF3E36', type: 'metro' },
]

// ViewBox: 0 0 1000 700
// Line C: vertical at x=520, 32px spacing (y=40..648)
// Line A: horizontal at y=328, Muzeum at (520,328)
// Line B: horizontal at y=264, Florenc at (520,264) — separated 64px above Line A
// Můstek interchange: step-over at x=475, A at y=328, B at y=264

export type StationId =
  // Line C (north→south)
  | 'LT' | 'ST' | 'PR' | 'LV' | 'KY' | 'NH' | 'VL' | 'FL' | 'HN' | 'MZ'
  | 'IP' | 'VS' | 'PP' | 'PN' | 'BJ' | 'KC' | 'RZ' | 'CH' | 'OP' | 'HJ'
  // Line A (west→east), excluding Muzeum already in C
  | 'NM' | 'VP' | 'PT' | 'NV' | 'BO' | 'DJ' | 'HR' | 'ML' | 'SM' | 'MK'
  | 'NI' | 'JP' | 'FO' | 'ZL' | 'SR' | 'SK' | 'DH'
  // Line B (west→east), excluding Florenc/Mustek
  | 'ZC' | 'SD' | 'LK' | 'LZ' | 'HK' | 'NB' | 'JI' | 'RA' | 'SN' | 'AN'
  | 'KN' | 'NT' | 'NR' | 'KR' | 'IV' | 'PA' | 'CM' | 'VY' | 'KO' | 'HL' | 'RJ' | 'CK'

export const STATION_COORDS: Record<StationId, [number, number]> = {
  // ── Line C ────────────────────────────────────────────────────────────────
  LT: [520,  40],  // Letňany
  ST: [520,  72],  // Střížkov
  PR: [520, 104],  // Prosek
  LV: [520, 136],  // Ládví
  KY: [520, 168],  // Kobylisy
  NH: [520, 200],  // Nádraží Holešovice
  VL: [520, 232],  // Vltavská
  FL: [520, 264],  // Florenc  ← B+C
  HN: [520, 296],  // Hlavní nádraží
  MZ: [520, 328],  // Muzeum   ← A+C
  IP: [520, 360],  // I. P. Pavlova
  VS: [520, 392],  // Vyšehrad
  PP: [520, 424],  // Pražského povstání
  PN: [520, 456],  // Pankrác
  BJ: [520, 488],  // Budějovická
  KC: [520, 520],  // Kačerov
  RZ: [520, 552],  // Roztyly
  CH: [520, 584],  // Chodov
  OP: [520, 616],  // Opatov
  HJ: [520, 648],  // Háje

  // ── Line A ────────────────────────────────────────────────────────────────
  NM: [ 70, 328],  // Nemocnice Motol
  VP: [115, 328],  // Vypich
  PT: [160, 328],  // Petřiny
  NV: [205, 328],  // Nádraží Veleslavín
  BO: [250, 328],  // Borislavka
  DJ: [295, 328],  // Dejvická
  HR: [340, 328],  // Hradčanská
  ML: [385, 328],  // Malostranská
  SM: [430, 328],  // Staroměstská
  MK: [475, 328],  // Můstek ← A+B (display dot on A track; B track at y=264)
  // Muzeum = MZ above
  NI: [565, 328],  // Náměstí Míru
  JP: [610, 328],  // Jiřího z Poděbrad
  FO: [655, 328],  // Flora
  ZL: [700, 328],  // Želivského
  SR: [745, 328],  // Strašnická
  SK: [790, 328],  // Skalka
  DH: [835, 328],  // Depo Hostivař

  // ── Line B ─ 45° diagonal SW→NE, 30px step, then horizontal east ─────────
  // Diagonal section: ZC(SW) → NT → MK step-over at (475,264)
  ZC: [115, 624],  // Zličín         ← SW terminus
  SD: [145, 594],  // Stodůlky
  LK: [175, 564],  // Luka
  LZ: [205, 534],  // Lužiny
  HK: [235, 504],  // Hůrka
  NB: [265, 474],  // Nové Butovice
  JI: [295, 444],  // Jinonice
  RA: [325, 414],  // Radlická
  SN: [355, 384],  // Smíchovské nádraží
  AN: [385, 354],  // Anděl
  KN: [415, 324],  // Karlovo náměstí
  NT: [445, 294],  // Národní třída
  // Můstek = MK above (display on A track; B track at (475,264) in LINE_PATHS)
  NR: [498, 264],  // Náměstí Republiky  ← back horizontal after step-over
  // Florenc = FL above
  KR: [560, 264],  // Křižíkova
  IV: [600, 264],  // Invalidovna
  PA: [640, 264],  // Palmovka
  CM: [680, 264],  // Českomoravská
  VY: [720, 264],  // Vysočanská
  KO: [760, 264],  // Kolbenova
  HL: [800, 264],  // Hloubětín
  RJ: [840, 264],  // Rajská zahrada
  CK: [880, 264],  // Černý Most
}

// Ordered station lists per line (canonical direction: north/west terminus → south/east terminus)
export const LINE_STATIONS: Record<string, StationId[]> = {
  C: ['LT','ST','PR','LV','KY','NH','VL','FL','HN','MZ','IP','VS','PP','PN','BJ','KC','RZ','CH','OP','HJ'],
  A: ['NM','VP','PT','NV','BO','DJ','HR','ML','SM','MK','MZ','NI','JP','FO','ZL','SR','SK','DH'],
  B: ['ZC','SD','LK','LZ','HK','NB','JI','RA','SN','AN','KN','NT','MK','NR','FL','KR','IV','PA','CM','VY','KO','HL','RJ','CK'],
}

/**
 * Explicit per-line polyline waypoints.
 * These decouple "where the line is drawn" from "where the station dot is displayed."
 * Must have the same number of points as LINE_STATIONS[lineId].
 */
export const LINE_PATHS: Record<string, [number, number][]> = {
  A: [
    [ 70, 328], [115, 328], [160, 328], [205, 328], [250, 328],
    [295, 328], [340, 328], [385, 328], [430, 328],
    [475, 328],  // Můstek on A track
    [520, 328],  // Muzeum
    [565, 328], [610, 328], [655, 328], [700, 328],
    [745, 328], [790, 328], [835, 328],
  ],
  B: [
    // 45° diagonal SW→NE: each step is (+30x, -30y)
    [115, 624],  // ZC Zličín
    [145, 594],  // SD Stodůlky
    [175, 564],  // LK Luka
    [205, 534],  // LZ Lužiny
    [235, 504],  // HK Hůrka
    [265, 474],  // NB Nové Butovice
    [295, 444],  // JI Jinonice
    [325, 414],  // RA Radlická
    [355, 384],  // SN Smíchovské nádraží
    [385, 354],  // AN Anděl
    [415, 324],  // KN Karlovo náměstí
    [445, 294],  // NT Národní třída
    [475, 264],  // MK Můstek on B track (step-over, A is at y=328)
    [498, 264],  // NR Náměstí Republiky — back horizontal
    [520, 264],  // FL Florenc
    [560, 264], [600, 264], [640, 264], [680, 264],
    [720, 264], [760, 264], [800, 264], [840, 264], [880, 264],
  ],
  C: [
    [520,  40], [520,  72], [520, 104], [520, 136], [520, 168],
    [520, 200], [520, 232],
    [520, 264],  // Florenc
    [520, 296],
    [520, 328],  // Muzeum
    [520, 360], [520, 392], [520, 424], [520, 456], [520, 488],
    [520, 520], [520, 552], [520, 584], [520, 616], [520, 648],
  ],
}

// Approximate total shape length in km for each line, per direction
// Derived from Golemio shape_dist_traveled observations
export const LINE_TOTAL_KM: Record<string, Record<string, number>> = {
  A: { 'Depo Hostivař': 17.5, 'Nemocnice Motol': 17.5 },
  B: { 'Černý Most': 26.5,    'Zličín': 26.5 },
  C: { 'Háje': 23.5,          'Letňany': 23.5 },
}

// Which terminus is the "start" (progress=0) in canonical west→east / north→south order
const CANONICAL_START: Record<string, string> = {
  A: 'Nemocnice Motol',  // westbound headsign = starts at Depo (east) → invert
  B: 'Zličín',           // eastbound headsign = starts at Zličín (west) → canonical
  C: 'Letňany',          // southbound headsign = starts at Letňany (north) → canonical
}

/**
 * Convert Golemio shape_dist_traveled + headsign to a 0–1 canonical progress
 * along the line (0 = north/west terminus, 1 = south/east terminus).
 */
export function toCanonicalProgress(
  lineId: string,
  headsign: string,
  shapeDistKm: number,
): number {
  const totalKm = LINE_TOTAL_KM[lineId]?.[headsign] ?? 25
  const raw = Math.min(shapeDistKm / totalKm, 1)
  const canonicalStart = CANONICAL_START[lineId]
  // If the headsign IS the canonical start terminus (e.g. A="Nemocnice Motol"),
  // the trip starts there → shapeDistTraveled=0 at that terminus → invert.
  // If the headsign is the OTHER terminus, the trip starts at canonical-start → direct.
  return headsign === canonicalStart ? 1 - raw : raw
}

/**
 * Interpolate a point along the schematic polyline of a line.
 * Uses LINE_PATHS so vehicle positions follow the per-line track, not display dots.
 * progress=0 → first waypoint, progress=1 → last waypoint.
 */
export function interpolateAlongLine(
  lineId: string,
  progress: number,
): [number, number] {
  const path = LINE_PATHS[lineId]
  if (!path || path.length === 0) return [500, 350]

  const p = Math.max(0, Math.min(1, progress))
  const segments = path.length - 1
  const raw = p * segments
  const seg = Math.min(Math.floor(raw), segments - 1)
  const t = raw - seg

  const [x1, y1] = path[seg]!
  const [x2, y2] = path[seg + 1]!
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]
}

// Station metadata for rendering
export const STATIONS: Station[] = [
  // Line C
  { id: 'LT', name: 'Letňany',               lineIds: ['C'],      ...xy('LT'), isInterchange: false },
  { id: 'ST', name: 'Střížkov',              lineIds: ['C'],      ...xy('ST'), isInterchange: false },
  { id: 'PR', name: 'Prosek',                lineIds: ['C'],      ...xy('PR'), isInterchange: false },
  { id: 'LV', name: 'Ládví',                 lineIds: ['C'],      ...xy('LV'), isInterchange: false },
  { id: 'KY', name: 'Kobylisy',              lineIds: ['C'],      ...xy('KY'), isInterchange: false },
  { id: 'NH', name: 'Nádraží Holešovice',    lineIds: ['C'],      ...xy('NH'), isInterchange: false },
  { id: 'VL', name: 'Vltavská',              lineIds: ['C'],      ...xy('VL'), isInterchange: false },
  { id: 'FL', name: 'Florenc',               lineIds: ['B', 'C'], ...xy('FL'), isInterchange: true  },
  { id: 'HN', name: 'Hlavní nádraží',        lineIds: ['C'],      ...xy('HN'), isInterchange: false },
  { id: 'MZ', name: 'Muzeum',                lineIds: ['A', 'C'], ...xy('MZ'), isInterchange: true  },
  { id: 'IP', name: 'I. P. Pavlova',         lineIds: ['C'],      ...xy('IP'), isInterchange: false },
  { id: 'VS', name: 'Vyšehrad',              lineIds: ['C'],      ...xy('VS'), isInterchange: false },
  { id: 'PP', name: 'Pražského povstání',    lineIds: ['C'],      ...xy('PP'), isInterchange: false },
  { id: 'PN', name: 'Pankrác',               lineIds: ['C'],      ...xy('PN'), isInterchange: false },
  { id: 'BJ', name: 'Budějovická',           lineIds: ['C'],      ...xy('BJ'), isInterchange: false },
  { id: 'KC', name: 'Kačerov',               lineIds: ['C'],      ...xy('KC'), isInterchange: false },
  { id: 'RZ', name: 'Roztyly',               lineIds: ['C'],      ...xy('RZ'), isInterchange: false },
  { id: 'CH', name: 'Chodov',                lineIds: ['C'],      ...xy('CH'), isInterchange: false },
  { id: 'OP', name: 'Opatov',                lineIds: ['C'],      ...xy('OP'), isInterchange: false },
  { id: 'HJ', name: 'Háje',                  lineIds: ['C'],      ...xy('HJ'), isInterchange: false },
  // Line A
  { id: 'NM', name: 'Nemocnice Motol',       lineIds: ['A'],      ...xy('NM'), isInterchange: false },
  { id: 'VP', name: 'Vypich',                lineIds: ['A'],      ...xy('VP'), isInterchange: false },
  { id: 'PT', name: 'Petřiny',               lineIds: ['A'],      ...xy('PT'), isInterchange: false },
  { id: 'NV', name: 'Nádraží Veleslavín',    lineIds: ['A'],      ...xy('NV'), isInterchange: false },
  { id: 'BO', name: 'Borislavka',            lineIds: ['A'],      ...xy('BO'), isInterchange: false },
  { id: 'DJ', name: 'Dejvická',              lineIds: ['A'],      ...xy('DJ'), isInterchange: false },
  { id: 'HR', name: 'Hradčanská',            lineIds: ['A'],      ...xy('HR'), isInterchange: false },
  { id: 'ML', name: 'Malostranská',          lineIds: ['A'],      ...xy('ML'), isInterchange: false },
  { id: 'SM', name: 'Staroměstská',          lineIds: ['A'],      ...xy('SM'), isInterchange: false },
  { id: 'MK', name: 'Můstek',               lineIds: ['A', 'B'], ...xy('MK'), isInterchange: true  },
  { id: 'NI', name: 'Náměstí Míru',          lineIds: ['A'],      ...xy('NI'), isInterchange: false },
  { id: 'JP', name: 'Jiřího z Poděbrad',    lineIds: ['A'],      ...xy('JP'), isInterchange: false },
  { id: 'FO', name: 'Flora',                 lineIds: ['A'],      ...xy('FO'), isInterchange: false },
  { id: 'ZL', name: 'Želivského',            lineIds: ['A'],      ...xy('ZL'), isInterchange: false },
  { id: 'SR', name: 'Strašnická',            lineIds: ['A'],      ...xy('SR'), isInterchange: false },
  { id: 'SK', name: 'Skalka',                lineIds: ['A'],      ...xy('SK'), isInterchange: false },
  { id: 'DH', name: 'Depo Hostivař',         lineIds: ['A'],      ...xy('DH'), isInterchange: false },
  // Line B
  { id: 'ZC', name: 'Zličín',               lineIds: ['B'],      ...xy('ZC'), isInterchange: false },
  { id: 'SD', name: 'Stodůlky',              lineIds: ['B'],      ...xy('SD'), isInterchange: false },
  { id: 'LK', name: 'Luka',                  lineIds: ['B'],      ...xy('LK'), isInterchange: false },
  { id: 'LZ', name: 'Lužiny',               lineIds: ['B'],      ...xy('LZ'), isInterchange: false },
  { id: 'HK', name: 'Hůrka',                lineIds: ['B'],      ...xy('HK'), isInterchange: false },
  { id: 'NB', name: 'Nové Butovice',         lineIds: ['B'],      ...xy('NB'), isInterchange: false },
  { id: 'JI', name: 'Jinonice',              lineIds: ['B'],      ...xy('JI'), isInterchange: false },
  { id: 'RA', name: 'Radlická',              lineIds: ['B'],      ...xy('RA'), isInterchange: false },
  { id: 'SN', name: 'Smíchovské nádraží',    lineIds: ['B'],      ...xy('SN'), isInterchange: false },
  { id: 'AN', name: 'Anděl',                 lineIds: ['B'],      ...xy('AN'), isInterchange: false },
  { id: 'KN', name: 'Karlovo náměstí',       lineIds: ['B'],      ...xy('KN'), isInterchange: false },
  { id: 'NT', name: 'Národní třída',         lineIds: ['B'],      ...xy('NT'), isInterchange: false },
  { id: 'NR', name: 'Náměstí Republiky',     lineIds: ['B'],      ...xy('NR'), isInterchange: false },
  { id: 'KR', name: 'Křižíkova',             lineIds: ['B'],      ...xy('KR'), isInterchange: false },
  { id: 'IV', name: 'Invalidovna',           lineIds: ['B'],      ...xy('IV'), isInterchange: false },
  { id: 'PA', name: 'Palmovka',              lineIds: ['B'],      ...xy('PA'), isInterchange: false },
  { id: 'CM', name: 'Českomoravská',         lineIds: ['B'],      ...xy('CM'), isInterchange: false },
  { id: 'VY', name: 'Vysočanská',            lineIds: ['B'],      ...xy('VY'), isInterchange: false },
  { id: 'KO', name: 'Kolbenova',             lineIds: ['B'],      ...xy('KO'), isInterchange: false },
  { id: 'HL', name: 'Hloubětín',             lineIds: ['B'],      ...xy('HL'), isInterchange: false },
  { id: 'RJ', name: 'Rajská zahrada',        lineIds: ['B'],      ...xy('RJ'), isInterchange: false },
  { id: 'CK', name: 'Černý Most',            lineIds: ['B'],      ...xy('CK'), isInterchange: false },
]

function xy(id: StationId): { x: number; y: number } {
  const [x, y] = STATION_COORDS[id]!
  return { x, y }
}
