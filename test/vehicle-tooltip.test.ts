// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VehicleTooltip, formatDelay } from '@/ui/vehicle-tooltip'
import type { VehicleClickInfo } from '@/map/renderer'

function makeInfo(overrides: Partial<VehicleClickInfo> = {}): VehicleClickInfo {
  return {
    tripId:      'trip-1',
    lineId:      '22',
    headsign:    'Depo Hostivař',
    type:        'tram',
    delayStatus: 'on-time',
    delaySec:    undefined,
    ...overrides,
  }
}

describe('VehicleTooltip', () => {
  let container: HTMLElement
  let tooltip: VehicleTooltip

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    tooltip = new VehicleTooltip(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('is hidden on creation', () => {
    expect(container.querySelector('.vehicle-tooltip')?.classList.contains('hidden')).toBe(true)
  })

  it('show() removes hidden class', () => {
    tooltip.show(makeInfo(), 100, 200)
    expect(container.querySelector('.vehicle-tooltip')?.classList.contains('hidden')).toBe(false)
  })

  it('show() renders line ID and type label for tram', () => {
    tooltip.show(makeInfo({ lineId: '22', type: 'tram' }), 0, 0)
    const lineEl = container.querySelector('.vehicle-tooltip__line')!
    expect(lineEl.textContent).toContain('22')
    expect(lineEl.textContent).toContain('Tram')
  })

  it('show() renders metro line with badge for metro type', () => {
    tooltip.show(makeInfo({ lineId: 'A', type: 'metro', delayStatus: 'on-time' }), 0, 0)
    const badge = container.querySelector('.vehicle-tooltip__line .line-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('A')
    expect(container.querySelector('.vehicle-tooltip__line')?.textContent).toContain('Metro')
  })

  it('show() renders headsign', () => {
    tooltip.show(makeInfo({ headsign: 'Depo Hostivař' }), 0, 0)
    expect(container.querySelector('.vehicle-tooltip__headsign')?.textContent).toContain('Depo Hostivař')
  })

  it('show() renders "On time" for on-time status', () => {
    tooltip.show(makeInfo({ delayStatus: 'on-time' }), 0, 0)
    const delayText = container.querySelector('.vehicle-tooltip__delay span:last-child')
    expect(delayText?.textContent).toBe('On time')
  })

  it('show() renders formatted delay for slight status', () => {
    tooltip.show(makeInfo({ delayStatus: 'slight', delaySec: 150 }), 0, 0)
    const delayText = container.querySelector('.vehicle-tooltip__delay span:last-child')
    expect(delayText?.textContent).toBe('+2m 30s delayed')
  })

  it('show() renders formatted delay for late status', () => {
    tooltip.show(makeInfo({ delayStatus: 'late', delaySec: 600 }), 0, 0)
    const delayText = container.querySelector('.vehicle-tooltip__delay span:last-child')
    expect(delayText?.textContent).toBe('+10m delayed')
  })

  it('show() renders "Delay unknown" for unknown status', () => {
    tooltip.show(makeInfo({ delayStatus: 'unknown' }), 0, 0)
    const delayText = container.querySelector('.vehicle-tooltip__delay span:last-child')
    expect(delayText?.textContent).toBe('Delay unknown')
  })

  it('hide() adds hidden class', () => {
    tooltip.show(makeInfo(), 0, 0)
    tooltip.hide()
    expect(container.querySelector('.vehicle-tooltip')?.classList.contains('hidden')).toBe(true)
  })

  it('close button calls hide()', () => {
    tooltip.show(makeInfo(), 0, 0)
    const closeBtn = container.querySelector<HTMLButtonElement>('.vehicle-tooltip__close')!
    closeBtn.click()
    expect(container.querySelector('.vehicle-tooltip')?.classList.contains('hidden')).toBe(true)
  })
})

describe('formatDelay', () => {
  it('returns "On time" for on-time status', () => {
    expect(formatDelay('on-time')).toBe('On time')
  })

  it('returns "Delay unknown" for unknown status', () => {
    expect(formatDelay('unknown')).toBe('Delay unknown')
  })

  it('returns "Delay unknown" when delaySec is undefined for slight', () => {
    expect(formatDelay('slight', undefined)).toBe('Delay unknown')
  })

  it('formats minutes and seconds', () => {
    expect(formatDelay('slight', 150)).toBe('+2m 30s delayed')
  })

  it('formats minutes only when seconds is 0', () => {
    expect(formatDelay('late', 600)).toBe('+10m delayed')
  })

  it('formats seconds only when under a minute', () => {
    expect(formatDelay('slight', 45)).toBe('+45s delayed')
  })
})
