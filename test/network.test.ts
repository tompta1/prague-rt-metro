import { describe, it, expect } from 'vitest'
import {
  toCanonicalProgress,
  interpolateAlongLine,
  LINE_PATHS,
  LINE_TOTAL_KM,
  LINE_STATIONS,
} from '../src/map/network'

// ── toCanonicalProgress ────────────────────────────────────────────────────────

describe('toCanonicalProgress', () => {
  // Line A: canonical direction is west→east (Nemocnice Motol → Depo Hostivař).
  // Canonical start = 'Nemocnice Motol' (headsign for eastbound trips whose
  // shape_dist starts at 0 at Motol).
  // When headsign === canonical start → vehicle is heading AWAY from start → invert.

  it('A eastbound at terminus returns 0 (Motol end)', () => {
    // Headsign 'Depo Hostivař' → NOT canonical start → direct mapping
    expect(toCanonicalProgress('A', 'Depo Hostivař', 0)).toBeCloseTo(0)
  })

  it('A eastbound at terminus returns 1 (Depo Hostivař end)', () => {
    expect(toCanonicalProgress('A', 'Depo Hostivař', 17.5)).toBeCloseTo(1)
  })

  it('A westbound at start returns 1 (inverted because canonical start = Motol)', () => {
    // Headsign 'Nemocnice Motol' === canonical start → invert: 1 - (0 / 17.5) = 1
    expect(toCanonicalProgress('A', 'Nemocnice Motol', 0)).toBeCloseTo(1)
  })

  it('A westbound at end returns 0 (inverted)', () => {
    expect(toCanonicalProgress('A', 'Nemocnice Motol', 17.5)).toBeCloseTo(0)
  })

  it('A midpoint is symmetric', () => {
    const east = toCanonicalProgress('A', 'Depo Hostivař', 8.75)
    const west = toCanonicalProgress('A', 'Nemocnice Motol', 8.75)
    expect(east).toBeCloseTo(0.5)
    expect(west).toBeCloseTo(0.5)
  })

  // Line B: canonical start = 'Zličín' (westernmost).
  it('B eastbound from Zličín at 0 returns 0', () => {
    // Headsign 'Černý Most' → NOT canonical start → direct
    expect(toCanonicalProgress('B', 'Černý Most', 0)).toBeCloseTo(0)
  })

  it('B westbound from Černý Most at 0 returns 1', () => {
    // Headsign 'Zličín' === canonical start → invert: 1 - 0 = 1
    expect(toCanonicalProgress('B', 'Zličín', 0)).toBeCloseTo(1)
  })

  it('B midpoint is ~0.5 from either direction', () => {
    const fwd = toCanonicalProgress('B', 'Černý Most', 13.25)
    const rev = toCanonicalProgress('B', 'Zličín', 13.25)
    expect(fwd).toBeCloseTo(0.5)
    expect(rev).toBeCloseTo(0.5)
  })

  // Line C: canonical start = 'Letňany' (northernmost).
  it('C southbound from Letňany at 0 returns 0', () => {
    expect(toCanonicalProgress('C', 'Háje', 0)).toBeCloseTo(0)
  })

  it('C northbound at 0 returns 1', () => {
    expect(toCanonicalProgress('C', 'Letňany', 0)).toBeCloseTo(1)
  })

  it('clamps progress to [0, 1] even if shape_dist_traveled overshoots', () => {
    expect(toCanonicalProgress('A', 'Depo Hostivař', 999)).toBe(1)
  })

  it('returns a value for an unknown line without throwing', () => {
    const p = toCanonicalProgress('X', 'SomeTerminus', 5)
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(1)
  })
})

// ── interpolateAlongLine ───────────────────────────────────────────────────────

describe('interpolateAlongLine', () => {
  it('progress=0 returns the first waypoint', () => {
    const [x, y] = interpolateAlongLine('A', 0)
    const [ex, ey] = LINE_PATHS['A']![0]!
    expect(x).toBeCloseTo(ex)
    expect(y).toBeCloseTo(ey)
  })

  it('progress=1 returns the last waypoint', () => {
    const path = LINE_PATHS['A']!
    const [x, y] = interpolateAlongLine('A', 1)
    const [ex, ey] = path[path.length - 1]!
    expect(x).toBeCloseTo(ex)
    expect(y).toBeCloseTo(ey)
  })

  it('progress=0.5 is between the first and last waypoints', () => {
    const path = LINE_PATHS['A']!
    const [x] = interpolateAlongLine('A', 0.5)
    expect(x).toBeGreaterThan(path[0]![0])
    expect(x).toBeLessThan(path[path.length - 1]![0])
  })

  it('clamps negative progress to 0', () => {
    const [x0, y0] = interpolateAlongLine('A', 0)
    const [xn, yn] = interpolateAlongLine('A', -0.5)
    expect(xn).toBeCloseTo(x0)
    expect(yn).toBeCloseTo(y0)
  })

  it('clamps progress > 1 to 1', () => {
    const path = LINE_PATHS['C']!
    const [xLast, yLast] = path[path.length - 1]!
    const [x, y] = interpolateAlongLine('C', 2)
    expect(x).toBeCloseTo(xLast)
    expect(y).toBeCloseTo(yLast)
  })

  it('returns a fallback for unknown line without throwing', () => {
    expect(() => interpolateAlongLine('X', 0.5)).not.toThrow()
  })

  it('is continuous — small progress delta gives small position delta', () => {
    const [x1, y1] = interpolateAlongLine('B', 0.5)
    const [x2, y2] = interpolateAlongLine('B', 0.501)
    const dist = Math.hypot(x2 - x1, y2 - y1)
    expect(dist).toBeLessThan(5)  // px
  })
})

// ── LINE_PATHS structural invariants ──────────────────────────────────────────

describe('LINE_PATHS', () => {
  for (const lid of ['A', 'B', 'C'] as const) {
    it(`${lid}: has same number of waypoints as LINE_STATIONS`, () => {
      expect(LINE_PATHS[lid]!.length).toBe(LINE_STATIONS[lid]!.length)
    })

    it(`${lid}: all waypoints are within SVG viewBox 0 0 1000 700`, () => {
      for (const [x, y] of LINE_PATHS[lid]!) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(1000)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(700)
      }
    })
  }
})

// ── LINE_TOTAL_KM sanity ───────────────────────────────────────────────────────

describe('LINE_TOTAL_KM', () => {
  it('all metro lines have entries', () => {
    for (const lineId of ['A', 'B', 'C']) {
      expect(LINE_TOTAL_KM[lineId]).toBeDefined()
    }
  })

  it('each line has two direction entries with matching distances', () => {
    for (const [, dirs] of Object.entries(LINE_TOTAL_KM)) {
      const values = Object.values(dirs)
      expect(values).toHaveLength(2)
      // Round-trip distances should be equal (same physical route)
      expect(values[0]).toBeCloseTo(values[1]!, 0)
      // Plausible Prague metro range: 10–30 km
      for (const km of values) {
        expect(km).toBeGreaterThan(10)
        expect(km).toBeLessThan(35)
      }
    }
  })
})
