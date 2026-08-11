import { describe, expect, it } from 'vitest'
import { ZOOM_LADDER, fitViewport, nextScale, screenToDoc, snapScale, zoomAt } from '../viewport'
import { loadStarter } from '../../artwork-core/create'

const doc = loadStarter('face') // 16x16

describe('fit uses the largest integer scale, not the largest ladder rung', () => {
  /**
   * The bug this exists for: fit picked from ZOOM_LADDER, which jumps 32 -> 48.
   * At 1440x900 there was room for 47.25 and it chose 32 — the artwork rendered
   * at 514px where 754px fitted, less than half the area. No test covered fit at
   * all, which is why it survived a 1:1 visual comparison.
   */
  it('does not fall back to the rung below when the fit lands between rungs', () => {
    const vp = fitViewport(doc, 1440, 900)
    // (900 - 96) / 16 = 50.25 vertical; (1440 - 96) / 16 = 84 horizontal
    expect(vp.scale).toBe(50)
    expect(vp.scale).toBeGreaterThan(32)
  })

  it('always fits inside the viewport with its margin', () => {
    for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024], [390, 844], [500, 500]]) {
      const vp = fitViewport(doc, w!, h!)
      expect(doc.w * vp.scale).toBeLessThanOrEqual(w! - 96)
      expect(doc.h * vp.scale).toBeLessThanOrEqual(h! - 96)
    }
  })

  it('never returns a fractional scale — cells must tile exactly', () => {
    for (let w = 200; w <= 2000; w += 37) {
      const vp = fitViewport(doc, w, 900)
      expect(Number.isInteger(vp.scale)).toBe(true)
    }
  })

  it('floors at 1 rather than vanishing when there is no room', () => {
    const vp = fitViewport(doc, 80, 80)
    expect(vp.scale).toBe(1)
  })

  it('centres the artwork', () => {
    const vp = fitViewport(doc, 1000, 800)
    expect(vp.offsetX).toBe(Math.round((1000 - doc.w * vp.scale) / 2))
    expect(vp.offsetY).toBe(Math.round((800 - doc.h * vp.scale) / 2))
  })
})

describe('the ladder still governs stepped zoom', () => {
  it('steps up and down through the rungs', () => {
    expect(nextScale(16, 1)).toBe(24)
    expect(nextScale(16, -1)).toBe(12)
  })

  it('clamps at both ends', () => {
    expect(nextScale(ZOOM_LADDER[0]!, -1)).toBe(ZOOM_LADDER[0])
    expect(nextScale(ZOOM_LADDER[ZOOM_LADDER.length - 1]!, 1)).toBe(
      ZOOM_LADDER[ZOOM_LADDER.length - 1],
    )
  })

  it('steps from a free scale that fit produced', () => {
    // fit no longer lands on a rung, so stepping must still behave from 50
    expect(nextScale(50, 1)).toBe(64)
    expect(nextScale(50, -1)).toBe(48)
  })

  it('snaps to the nearest rung', () => {
    expect(snapScale(30)).toBe(32)
    expect(snapScale(47)).toBe(48)
  })
})

describe('zoom anchoring', () => {
  it('keeps the document pixel under the cursor', () => {
    const vp = { scale: 16, offsetX: 100, offsetY: 40 }
    const [ax, ay] = [260, 200]
    const before = screenToDoc(ax, ay, { left: 0, top: 0 }, vp)
    const after = screenToDoc(ax, ay, { left: 0, top: 0 }, zoomAt(vp, 32, ax, ay))
    expect(after).toEqual(before)
  })

  it('is a no-op at the same scale', () => {
    const vp = { scale: 16, offsetX: 10, offsetY: 20 }
    expect(zoomAt(vp, 16, 0, 0)).toBe(vp)
  })
})
