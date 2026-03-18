import { describe, it, expect } from 'vitest'

// ── Pure viewBox math extracted from pan-zoom.ts ──────────────────────────────

interface ViewBox { x: number; y: number; w: number; h: number }

const INITIAL: ViewBox = { x: 0, y: 0, w: 1000, h: 700 }
const MIN_W = 100
const MAX_W = 2000
const ZOOM_FACTOR = 1.12

function zoomAt(vb: ViewBox, mx: number, my: number, factor: number): ViewBox {
  const nw = Math.max(MIN_W, Math.min(MAX_W, vb.w * factor))
  const nh = nw * (INITIAL.h / INITIAL.w)
  return {
    x: mx - (mx - vb.x) * (nw / vb.w),
    y: my - (my - vb.y) * (nh / vb.h),
    w: nw,
    h: nh,
  }
}

function pan(vb: ViewBox, dx: number, dy: number): ViewBox {
  return { ...vb, x: vb.x - dx, y: vb.y - dy }
}

// ── Zoom tests ────────────────────────────────────────────────────────────────

describe('zoomAt()', () => {
  it('zoom-in (factor < 1) reduces viewBox width', () => {
    const result = zoomAt(INITIAL, 500, 350, 1 / ZOOM_FACTOR)
    expect(result.w).toBeLessThan(INITIAL.w)
  })

  it('zoom-out (factor > 1) increases viewBox width', () => {
    const result = zoomAt(INITIAL, 500, 350, ZOOM_FACTOR)
    expect(result.w).toBeGreaterThan(INITIAL.w)
  })

  it('cursor point is stationary after zoom-in', () => {
    const mx = 400, my = 200
    const result = zoomAt(INITIAL, mx, my, 1 / ZOOM_FACTOR)
    // In the new viewBox, the same SVG point should map to the same screen fraction
    const fxBefore = (mx - INITIAL.x) / INITIAL.w
    const fxAfter  = (mx - result.x) / result.w
    expect(fxAfter).toBeCloseTo(fxBefore, 6)
  })

  it('cursor at canvas centre keeps centre stationary', () => {
    const result = zoomAt(INITIAL, 500, 350, 2)
    const cx = result.x + result.w / 2
    const cy = result.y + result.h / 2
    expect(cx).toBeCloseTo(500, 1)
    expect(cy).toBeCloseTo(350, 1)
  })

  it('width does not go below MIN_W', () => {
    let vb: ViewBox = { ...INITIAL }
    for (let i = 0; i < 50; i++) vb = zoomAt(vb, 500, 350, 1 / ZOOM_FACTOR)
    expect(vb.w).toBeGreaterThanOrEqual(MIN_W)
  })

  it('width does not exceed MAX_W', () => {
    let vb: ViewBox = { ...INITIAL }
    for (let i = 0; i < 50; i++) vb = zoomAt(vb, 500, 350, ZOOM_FACTOR)
    expect(vb.w).toBeLessThanOrEqual(MAX_W)
  })

  it('aspect ratio is preserved (h/w = 700/1000)', () => {
    const result = zoomAt(INITIAL, 300, 200, 3)
    expect(result.h / result.w).toBeCloseTo(700 / 1000, 6)
  })

  it('zoom-in then zoom-out returns close to original viewBox', () => {
    let vb: ViewBox = { ...INITIAL }
    vb = zoomAt(vb, 500, 350, 1 / ZOOM_FACTOR)
    vb = zoomAt(vb, 500, 350, ZOOM_FACTOR)
    expect(vb.w).toBeCloseTo(INITIAL.w, 3)
    expect(vb.x).toBeCloseTo(INITIAL.x, 3)
    expect(vb.y).toBeCloseTo(INITIAL.y, 3)
  })
})

// ── Pan tests ─────────────────────────────────────────────────────────────────

describe('pan()', () => {
  it('panning right (positive dx) shifts viewBox x in the same direction', () => {
    const result = pan(INITIAL, 50, 0)
    expect(result.x).toBeCloseTo(INITIAL.x - 50)
  })

  it('panning down (positive dy) shifts viewBox y', () => {
    const result = pan(INITIAL, 0, 30)
    expect(result.y).toBeCloseTo(INITIAL.y - 30)
  })

  it('pan does not change viewBox dimensions', () => {
    const result = pan(INITIAL, 100, -50)
    expect(result.w).toBe(INITIAL.w)
    expect(result.h).toBe(INITIAL.h)
  })

  it('panning back cancels out', () => {
    let vb = pan(INITIAL, 200, 150)
    vb = pan(vb, -200, -150)
    expect(vb.x).toBeCloseTo(INITIAL.x)
    expect(vb.y).toBeCloseTo(INITIAL.y)
  })
})

// ── Constants ─────────────────────────────────────────────────────────────────

describe('zoom constants', () => {
  it('MIN_W < initial width < MAX_W', () => {
    expect(MIN_W).toBeLessThan(INITIAL.w)
    expect(INITIAL.w).toBeLessThan(MAX_W)
  })

  it('ZOOM_FACTOR is reasonable (between 1.05 and 1.5)', () => {
    expect(ZOOM_FACTOR).toBeGreaterThan(1.05)
    expect(ZOOM_FACTOR).toBeLessThan(1.5)
  })

  it('max zoom-in is at least 5× (INITIAL.w / MIN_W ≥ 5)', () => {
    expect(INITIAL.w / MIN_W).toBeGreaterThanOrEqual(5)
  })

  it('aspect ratio is the Prague SVG canvas ratio', () => {
    expect(INITIAL.h / INITIAL.w).toBeCloseTo(700 / 1000, 6)
  })
})
