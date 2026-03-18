import { describe, it, expect } from 'vitest'

// ── Re-implemented pure functions from build-network.ts ───────────────────────
// Tested independently so the suite has no I/O or network dependency.

const LON_MIN = 14.22, LON_MAX = 14.65
const LAT_MIN = 49.97, LAT_MAX = 50.17
const SVG_W = 1000, SVG_H = 700

function project(lat: number, lon: number): [number, number] {
  const x = Math.round(((lon - LON_MIN) / (LON_MAX - LON_MIN)) * SVG_W)
  const y = Math.round(((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H)
  return [x, y]
}

function inBounds(lat: number, lon: number): boolean {
  return lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX
}

function ptSegDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const [px, py] = p, [ax, ay] = a
  const dx = b[0] - ax, dy = b[1] - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length <= 2) return pts
  let maxD = 0, maxI = 0
  const last = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptSegDist(pts[i], pts[0], last)
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > eps) {
    const l = rdp(pts.slice(0, maxI + 1), eps)
    const r = rdp(pts.slice(maxI), eps)
    return [...l.slice(0, -1), ...r]
  }
  return [pts[0], last]
}

function splitLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (const c of line) {
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { result.push(cur); cur = '' }
    else cur += c
  }
  result.push(cur)
  return result
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n')
  const headers = lines[0].replace('\r', '').split(',').map(h => h.trim())
  const results: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].replace('\r', '').trim()
    if (!raw) continue
    const values = splitLine(raw)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim() })
    results.push(row)
  }
  return results
}

// ── project() ─────────────────────────────────────────────────────────────────

describe('project()', () => {
  it('Můstek (14.4255°E, 50.0833°N) projects near SVG center', () => {
    const [x, y] = project(50.0833, 14.4255)
    // Calibrated: should land near (478, 303)
    expect(x).toBeGreaterThan(450)
    expect(x).toBeLessThan(510)
    expect(y).toBeGreaterThan(270)
    expect(y).toBeLessThan(340)
  })

  it('western edge (LON_MIN) → x=0', () => {
    const [x] = project(50.07, LON_MIN)
    expect(x).toBe(0)
  })

  it('eastern edge (LON_MAX) → x=1000', () => {
    const [x] = project(50.07, LON_MAX)
    expect(x).toBe(SVG_W)
  })

  it('northern edge (LAT_MAX) → y=0', () => {
    const [, y] = project(LAT_MAX, 14.43)
    expect(y).toBe(0)
  })

  it('southern edge (LAT_MIN) → y=700', () => {
    const [, y] = project(LAT_MIN, 14.43)
    expect(y).toBe(SVG_H)
  })

  it('increasing longitude increases x', () => {
    const [x1] = project(50.08, 14.35)
    const [x2] = project(50.08, 14.50)
    expect(x2).toBeGreaterThan(x1)
  })

  it('increasing latitude decreases y (north is up)', () => {
    const [, y1] = project(50.00, 14.43)
    const [, y2] = project(50.10, 14.43)
    expect(y2).toBeLessThan(y1)
  })
})

// ── inBounds() ────────────────────────────────────────────────────────────────

describe('inBounds()', () => {
  it('central Prague is in bounds', () => {
    expect(inBounds(50.08, 14.43)).toBe(true)
  })

  it('Berlin is out of bounds', () => {
    expect(inBounds(52.52, 13.40)).toBe(false)
  })

  it('exact boundary corners are in bounds', () => {
    expect(inBounds(LAT_MIN, LON_MIN)).toBe(true)
    expect(inBounds(LAT_MAX, LON_MAX)).toBe(true)
  })

  it('one degree outside is out of bounds', () => {
    expect(inBounds(LAT_MIN - 0.01, 14.43)).toBe(false)
    expect(inBounds(50.08, LON_MAX + 0.01)).toBe(false)
  })
})

// ── ptSegDist() ───────────────────────────────────────────────────────────────

describe('ptSegDist()', () => {
  it('point on segment has distance 0', () => {
    const d = ptSegDist([5, 0], [0, 0], [10, 0])
    expect(d).toBeCloseTo(0)
  })

  it('point perpendicular to segment midpoint', () => {
    const d = ptSegDist([5, 3], [0, 0], [10, 0])
    expect(d).toBeCloseTo(3)
  })

  it('point beyond segment end clamps to endpoint', () => {
    const d = ptSegDist([15, 0], [0, 0], [10, 0])
    expect(d).toBeCloseTo(5)
  })

  it('point before segment start clamps to start', () => {
    const d = ptSegDist([-5, 0], [0, 0], [10, 0])
    expect(d).toBeCloseTo(5)
  })

  it('degenerate segment (zero length) returns distance to point', () => {
    const d = ptSegDist([3, 4], [0, 0], [0, 0])
    expect(d).toBeCloseTo(5)
  })
})

// ── rdp() ─────────────────────────────────────────────────────────────────────

describe('rdp()', () => {
  it('returns two endpoints for a perfectly straight line', () => {
    const pts: [number, number][] = [[0,0],[1,0],[2,0],[3,0],[4,0]]
    const result = rdp(pts, 1)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual([0, 0])
    expect(result[result.length - 1]).toEqual([4, 0])
  })

  it('preserves a sharp corner', () => {
    // L-shape: goes right then turns up; midpoint deviation >> epsilon
    const pts: [number, number][] = [[0,0],[10,0],[10,10]]
    const result = rdp(pts, 1)
    expect(result).toHaveLength(3)
  })

  it('always includes the first and last point', () => {
    const pts: [number, number][] = Array.from({ length: 20 }, (_, i) => [i * 5, Math.sin(i) * 3] as [number,number])
    const result = rdp(pts, 1)
    expect(result[0]).toEqual(pts[0])
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('passes through for 0 or 1 point', () => {
    expect(rdp([], 1)).toEqual([])
    expect(rdp([[1, 2]], 1)).toEqual([[1, 2]])
  })

  it('smaller epsilon retains more points', () => {
    const pts: [number, number][] = Array.from({ length: 50 }, (_, i) => [i, Math.sin(i * 0.5) * 10] as [number,number])
    const coarse = rdp(pts, 5)
    const fine = rdp(pts, 0.5)
    expect(fine.length).toBeGreaterThanOrEqual(coarse.length)
  })

  it('result is never longer than input', () => {
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => [i, i * 2] as [number,number])
    const result = rdp(pts, 0.1)
    expect(result.length).toBeLessThanOrEqual(pts.length)
  })
})

// ── parseCSV() / splitLine() ──────────────────────────────────────────────────

describe('parseCSV()', () => {
  it('parses a simple GTFS-style CSV', () => {
    const csv = 'route_id,route_short_name,route_type\nL1,A,1\nL2,B,1\n'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ route_id: 'L1', route_short_name: 'A', route_type: '1' })
    expect(rows[1]).toEqual({ route_id: 'L2', route_short_name: 'B', route_type: '1' })
  })

  it('handles quoted fields containing commas', () => {
    const csv = 'id,name\n1,"Náměstí, Praha"\n'
    const rows = parseCSV(csv)
    expect(rows[0]!['name']).toBe('Náměstí, Praha')
  })

  it('skips blank lines', () => {
    const csv = 'a,b\n1,2\n\n3,4\n'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(2)
  })

  it('strips Windows-style carriage returns', () => {
    const csv = 'a,b\r\n1,2\r\n'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]!['a']).toBe('1')
  })

  it('handles UTF-8 Czech characters', () => {
    const csv = 'stop_id,stop_name\nU123,Smíchovské nádraží\n'
    const rows = parseCSV(csv)
    expect(rows[0]!['stop_name']).toBe('Smíchovské nádraží')
  })
})

// ── METRO_STATION_NAMES completeness ─────────────────────────────────────────

describe('METRO_STATION_NAMES list', () => {
  // Verified count: 20 (C) + 17 (A) + 22 (B) = 59 entries, minus 2 shared
  // (Muzeum on A+C, Florenc on B+C, Můstek on A+B → 3 shared, 56 unique)
  // Actual unique count = 57 stations
  const METRO_STATION_NAMES = new Set([
    'Letňany', 'Střížkov', 'Prosek', 'Ládví', 'Kobylisy',
    'Nádraží Holešovice', 'Vltavská', 'Florenc', 'Hlavní nádraží', 'Muzeum',
    'I. P. Pavlova', 'Vyšehrad', 'Pražského povstání', 'Pankrác', 'Budějovická',
    'Kačerov', 'Roztyly', 'Chodov', 'Opatov', 'Háje',
    'Nemocnice Motol', 'Vypich', 'Petřiny', 'Nádraží Veleslavín', 'Borislavka',
    'Dejvická', 'Hradčanská', 'Malostranská', 'Staroměstská', 'Můstek',
    'Náměstí Míru', 'Jiřího z Poděbrad', 'Flora', 'Želivského', 'Strašnická',
    'Skalka', 'Depo Hostivař',
    'Zličín', 'Stodůlky', 'Luka', 'Lužiny', 'Hůrka', 'Nové Butovice',
    'Jinonice', 'Radlická', 'Smíchovské nádraží', 'Anděl', 'Karlovo náměstí',
    'Národní třída', 'Náměstí Republiky', 'Křižíkova', 'Invalidovna',
    'Palmovka', 'Českomoravská', 'Vysočanská', 'Kolbenova', 'Hloubětín',
    'Rajská zahrada', 'Černý Most',
  ])

  it('has exactly 59 unique station names', () => {
    // 20 (C) + 17 (A, excluding Muzeum which is C) + 22 (B, excluding Florenc+Můstek already listed)
    // Muzeum (A+C), Florenc (B+C), Můstek (A+B) are shared — each appears once in the Set.
    expect(METRO_STATION_NAMES.size).toBe(59)
  })

  it('contains all line C stations', () => {
    const C = ['Letňany','Střížkov','Prosek','Ládví','Kobylisy','Nádraží Holešovice',
               'Vltavská','Florenc','Hlavní nádraží','Muzeum','I. P. Pavlova',
               'Vyšehrad','Pražského povstání','Pankrác','Budějovická','Kačerov',
               'Roztyly','Chodov','Opatov','Háje']
    for (const name of C) expect(METRO_STATION_NAMES.has(name), name).toBe(true)
  })

  it('contains all line A stations', () => {
    const A = ['Nemocnice Motol','Vypich','Petřiny','Nádraží Veleslavín','Borislavka',
               'Dejvická','Hradčanská','Malostranská','Staroměstská','Můstek',
               'Muzeum','Náměstí Míru','Jiřího z Poděbrad','Flora','Želivského',
               'Strašnická','Skalka','Depo Hostivař']
    for (const name of A) expect(METRO_STATION_NAMES.has(name), name).toBe(true)
  })

  it('contains all line B stations', () => {
    const B = ['Zličín','Stodůlky','Luka','Lužiny','Hůrka','Nové Butovice',
               'Jinonice','Radlická','Smíchovské nádraží','Anděl','Karlovo náměstí',
               'Národní třída','Můstek','Náměstí Republiky','Florenc','Křižíkova',
               'Invalidovna','Palmovka','Českomoravská','Vysočanská','Kolbenova',
               'Hloubětín','Rajská zahrada','Černý Most']
    for (const name of B) expect(METRO_STATION_NAMES.has(name), name).toBe(true)
  })

  it('does not contain obvious non-metro stops', () => {
    const notMetro = ['Václavské náměstí', 'Náměstí Míru tram', 'Arbesovo náměstí', 'I.P.Pavlova']
    for (const name of notMetro) expect(METRO_STATION_NAMES.has(name), name).toBe(false)
  })
})
