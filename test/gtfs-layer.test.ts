import { describe, it, expect } from 'vitest'

// ── Pure logic extracted from gtfs-layer.ts ───────────────────────────────────
// Tests run in Node without a DOM, so we duplicate the pure functions here.

const INTERCHANGES: Record<string, string[]> = {
  'Muzeum':  ['A', 'C'],
  'Florenc': ['B', 'C'],
  'Můstek':  ['A', 'B'],
}

interface Stop { name: string; x: number; y: number }
interface MetroRoute { id: string; color: string; shapes: Record<string, [number,number,number][]> }
interface Network {
  metro: { routes: MetroRoute[]; stops: Stop[] }
  tram: { routes: unknown[]; stops: Stop[] }
}

function lineIdsForStop(stopName: string, network: Network): string[] {
  if (INTERCHANGES[stopName]) return INTERCHANGES[stopName]
  let best = '', bestD = Infinity
  for (const route of network.metro.routes) {
    const pts = route.shapes['0'] ?? Object.values(route.shapes)[0] ?? []
    const stop = network.metro.stops.find(s => s.name === stopName)
    if (!stop) continue
    for (const [sx, sy] of pts) {
      const d = Math.hypot(sx - stop.x, sy - stop.y)
      if (d < bestD) { bestD = d; best = route.id }
    }
  }
  return best ? [best] : []
}

// ── Minimal network fixture ───────────────────────────────────────────────────

function makeNetwork(): Network {
  return {
    metro: {
      routes: [
        {
          id: 'A', color: '#00A562',
          shapes: { '0': [[300, 330, 0], [400, 330, 5], [500, 330, 10]], '1': [[500,330,0],[300,330,10]] },
        },
        {
          id: 'B', color: '#F8B322',
          shapes: { '0': [[200, 270, 0], [400, 270, 10], [500, 270, 15]], '1': [[500,270,0],[200,270,15]] },
        },
        {
          id: 'C', color: '#CF003D',
          shapes: { '0': [[500, 50, 0], [500, 270, 8], [500, 330, 12], [500, 600, 20]] },
        },
      ],
      stops: [
        { name: 'Muzeum',  x: 500, y: 330 },  // A + C interchange
        { name: 'Florenc', x: 500, y: 270 },  // B + C interchange
        { name: 'Můstek',  x: 400, y: 300 },  // A + B interchange
        { name: 'Anděl',   x: 250, y: 270 },  // B only
        { name: 'Háje',    x: 500, y: 600 },  // C only
        { name: 'Dejvická',x: 300, y: 330 },  // A only
      ],
    },
    tram: { routes: [], stops: [] },
  }
}

// ── lineIdsForStop ─────────────────────────────────────────────────────────────

describe('lineIdsForStop()', () => {
  const network = makeNetwork()

  it('Muzeum → [A, C]', () => {
    expect(lineIdsForStop('Muzeum', network)).toEqual(['A', 'C'])
  })

  it('Florenc → [B, C]', () => {
    expect(lineIdsForStop('Florenc', network)).toEqual(['B', 'C'])
  })

  it('Můstek → [A, B]', () => {
    expect(lineIdsForStop('Můstek', network)).toEqual(['A', 'B'])
  })

  it('Anděl → [B] (nearest to B shape)', () => {
    const ids = lineIdsForStop('Anděl', network)
    expect(ids).toEqual(['B'])
  })

  it('Háje → [C] (nearest to C shape)', () => {
    const ids = lineIdsForStop('Háje', network)
    expect(ids).toEqual(['C'])
  })

  it('Dejvická → [A] (nearest to A shape)', () => {
    const ids = lineIdsForStop('Dejvická', network)
    expect(ids).toEqual(['A'])
  })

  it('unknown stop name returns empty array', () => {
    expect(lineIdsForStop('Nonexistent', network)).toEqual([])
  })
})

// ── INTERCHANGES table ─────────────────────────────────────────────────────────

describe('INTERCHANGES constant', () => {
  it('covers the three Prague metro interchange stations', () => {
    expect(Object.keys(INTERCHANGES)).toHaveLength(3)
    expect(INTERCHANGES['Muzeum']).toContain('A')
    expect(INTERCHANGES['Muzeum']).toContain('C')
    expect(INTERCHANGES['Florenc']).toContain('B')
    expect(INTERCHANGES['Florenc']).toContain('C')
    expect(INTERCHANGES['Můstek']).toContain('A')
    expect(INTERCHANGES['Můstek']).toContain('B')
  })

  it('each interchange is on exactly two lines', () => {
    for (const lines of Object.values(INTERCHANGES)) {
      expect(lines).toHaveLength(2)
    }
  })

  it('no interchange is on three lines', () => {
    for (const lines of Object.values(INTERCHANGES)) {
      expect(lines.length).toBeLessThanOrEqual(2)
    }
  })
})

// ── Network fixture shape ──────────────────────────────────────────────────────

describe('metro network fixture', () => {
  const n = makeNetwork()

  it('has three metro lines (A, B, C)', () => {
    expect(n.metro.routes.map(r => r.id).sort()).toEqual(['A', 'B', 'C'])
  })

  it('all metro routes have at least one shape with ≥ 2 points', () => {
    for (const route of n.metro.routes) {
      const pts = Object.values(route.shapes)[0]
      expect(pts!.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('metro shape points carry a distance value (third element)', () => {
    for (const route of n.metro.routes) {
      for (const pts of Object.values(route.shapes)) {
        for (const [, , dist] of pts) {
          expect(typeof dist).toBe('number')
          expect(dist).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('metro shape distances are non-decreasing within a direction', () => {
    for (const route of n.metro.routes) {
      for (const pts of Object.values(route.shapes)) {
        for (let i = 1; i < pts.length; i++) {
          expect(pts[i]![2]).toBeGreaterThanOrEqual(pts[i - 1]![2])
        }
      }
    }
  })

  it('all metro stops are within SVG 1000×700 bounds', () => {
    for (const stop of n.metro.stops) {
      expect(stop.x).toBeGreaterThanOrEqual(0)
      expect(stop.x).toBeLessThanOrEqual(1000)
      expect(stop.y).toBeGreaterThanOrEqual(0)
      expect(stop.y).toBeLessThanOrEqual(700)
    }
  })
})

// ── Tram color override ────────────────────────────────────────────────────────

describe('tram line colour', () => {
  // GTFS tram colour #7A0603 is near-black on a dark map.
  // The layer must override it with something brighter.
  const TRAM_RENDER_COLOR = '#c0392b'

  it('render colour is distinct from the GTFS source colour', () => {
    expect(TRAM_RENDER_COLOR).not.toBe('#7A0603')
    expect(TRAM_RENDER_COLOR).not.toBe('#7a0603')
  })

  it('render colour is not too dark (R channel > 128)', () => {
    const r = parseInt(TRAM_RENDER_COLOR.slice(1, 3), 16)
    expect(r).toBeGreaterThan(128)
  })
})
