/**
 * src/map/pan-zoom.ts
 *
 * Attaches mouse-wheel zoom and click-drag pan to an SVG element by
 * manipulating its viewBox attribute. No external dependencies.
 */

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

function setViewBox(svg: SVGSVGElement, vb: ViewBox): void {
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): [number, number] {
  const rect = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  return [
    vb.x + (clientX - rect.left) * (vb.width / rect.width),
    vb.y + (clientY - rect.top) * (vb.height / rect.height),
  ]
}

export function initPanZoom(svg: SVGSVGElement, onZoom?: (vbWidth: number) => void): void {
  let vb: ViewBox = { ...INITIAL }

  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  svg.addEventListener('wheel', e => {
    e.preventDefault()
    const [mx, my] = svgPoint(svg, e.clientX, e.clientY)
    const factor = e.deltaY < 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR
    vb = zoomAt(vb, mx, my, factor)
    setViewBox(svg, vb)
    onZoom?.(vb.w)
  }, { passive: false })

  // ── Mouse drag pan ──────────────────────────────────────────────────────────
  let dragging = false
  let lastX = 0
  let lastY = 0

  svg.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    svg.style.cursor = 'grabbing'
  })

  window.addEventListener('mousemove', e => {
    if (!dragging) return
    const rect = svg.getBoundingClientRect()
    const scale = vb.w / rect.width
    const dx = (e.clientX - lastX) * scale
    const dy = (e.clientY - lastY) * scale
    vb = pan(vb, dx, dy)
    setViewBox(svg, vb)
    lastX = e.clientX
    lastY = e.clientY
  })

  window.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    svg.style.cursor = 'grab'
  })

  // ── Touch pinch+pan ─────────────────────────────────────────────────────────
  let lastTouches: TouchList | null = null

  svg.addEventListener('touchstart', e => {
    e.preventDefault()
    lastTouches = e.touches
  }, { passive: false })

  svg.addEventListener('touchmove', e => {
    e.preventDefault()
    if (!lastTouches) return
    const cur = e.touches

    if (cur.length === 1 && lastTouches.length === 1) {
      const rect = svg.getBoundingClientRect()
      const scale = vb.w / rect.width
      const dx = (cur[0]!.clientX - lastTouches[0]!.clientX) * scale
      const dy = (cur[0]!.clientY - lastTouches[0]!.clientY) * scale
      vb = pan(vb, dx, dy)
    } else if (cur.length === 2 && lastTouches.length === 2) {
      const prevDist = Math.hypot(
        lastTouches[0]!.clientX - lastTouches[1]!.clientX,
        lastTouches[0]!.clientY - lastTouches[1]!.clientY,
      )
      const curDist = Math.hypot(
        cur[0]!.clientX - cur[1]!.clientX,
        cur[0]!.clientY - cur[1]!.clientY,
      )
      if (prevDist > 0) {
        const mx = (cur[0]!.clientX + cur[1]!.clientX) / 2
        const my = (cur[0]!.clientY + cur[1]!.clientY) / 2
        const [svgX, svgY] = svgPoint(svg, mx, my)
        vb = zoomAt(vb, svgX, svgY, prevDist / curDist)
        setViewBox(svg, vb)
        onZoom?.(vb.w)
        lastTouches = cur
        return
      }
    }

    setViewBox(svg, vb)
    lastTouches = cur
  }, { passive: false })

  svg.addEventListener('touchend', () => { lastTouches = null }, { passive: false })
}
