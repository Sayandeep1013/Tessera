import { describe, expect, it } from 'vitest'
import {
  MAX_SCALE, MIN_SCALE, ZOOM_STEPS, clampScale, fitViewport, recentreViewport, screenToDoc,
  stepScale, zoomAt,
} from '../viewport'
import { loadStarter } from '../../artwork-core/create'

const doc = loadStarter('face') // 16x16

describe('recentreViewport — spec 07 §9.3', () => {
  /**
   * The case that made it necessary: the code panel takes 460px off the right
   * of the canvas element, and an offset measured from the left edge does not
   * notice. Without this the artwork does not move and the panel simply arrives
   * on top of the right-hand half of it.
   */
  it('keeps what was centred centred when the canvas narrows', () => {
    const wide = fitViewport(doc, 1440, 900)
    const narrow = recentreViewport(wide, -460, 0)
    // What the fit would have produced at the new width — same framing.
    expect(narrow.offsetX).toBe(fitViewport(doc, 980, 900).offsetX)
  })

  it('keeps the scale, because a resize is not a zoom', () => {
    const vp = { scale: 37, offsetX: 200, offsetY: 120 }
    expect(recentreViewport(vp, -460, 0).scale).toBe(37)
  })

  it('is exactly reversible, so opening and closing the panel is a no-op', () => {
    const vp = { scale: 12, offsetX: 301, offsetY: 77 }
    expect(recentreViewport(recentreViewport(vp, -460, 0), 460, 0)).toEqual(vp)
  })

  it('does nothing at all when nothing changed', () => {
    const vp = { scale: 8, offsetX: 5, offsetY: 6 }
    expect(recentreViewport(vp, 0, 0)).toBe(vp)
  })

  it('moves both axes, because a window resize changes both', () => {
    expect(recentreViewport({ scale: 4, offsetX: 100, offsetY: 100 }, -40, -60))
      .toEqual({ scale: 4, offsetX: 80, offsetY: 70 })
  })

  it('stays on whole pixels — a fractional offset blurs the grid', () => {
    const r = recentreViewport({ scale: 4, offsetX: 100, offsetY: 100 }, -33, -1)
    expect(Number.isInteger(r.offsetX)).toBe(true)
    expect(Number.isInteger(r.offsetY)).toBe(true)
  })
})

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

describe('continuous zoom, for the wheel', () => {
  /**
   * The wheel used to step a whole ladder rung per event. A trackpad fires
   * dozens of events per two-finger flick, so one gesture went 32x -> 64x and
   * pinned at maximum. Continuous zoom needs a clamp that keeps scale a whole
   * number without ever returning 0.
   */
  it('rounds to an integer so cells still tile exactly', () => {
    expect(clampScale(16.4)).toBe(16)
    expect(clampScale(16.6)).toBe(17)
  })

  it('clamps to the range at both ends', () => {
    expect(clampScale(0)).toBe(MIN_SCALE)
    expect(clampScale(-40)).toBe(MIN_SCALE)
    expect(clampScale(9999)).toBe(MAX_SCALE)
  })

  it('never returns a scale that would render the artwork to nothing', () => {
    for (const n of [0, 0.0001, 0.4, -1]) expect(clampScale(n)).toBeGreaterThanOrEqual(1)
  })

  it('every step the buttons can land on survives a round trip', () => {
    for (const s of ZOOM_STEPS) expect(clampScale(s)).toBe(s)
  })
})

/**
 * The zoom bar's two buttons. See docs/specs/15-feedback-and-input.md §2 and
 * §7.1 — these were stepping ZOOM_LADDER, which jumps up to 50% per click and
 * oscillates forever between two rungs once you start from an off-rung scale.
 */
describe('stepScale — the zoom buttons', () => {
  const scales = Array.from({ length: MAX_SCALE }, (_, i) => i + 1)

  it('round-trips exactly from every scale it can actually land on', () => {
    // Only ZOOM_STEPS entries are reachable after one click, so those are the
    // scales reversibility is meaningful for. An arbitrary integer like 41 is
    // not on the list and cannot be returned to — see the drift test below for
    // what is promised there instead.
    const onList = ZOOM_STEPS.filter((s) => s > MIN_SCALE && s < MAX_SCALE)
    const broken = onList.filter(
      (s) => stepScale(stepScale(s, -1), 1) !== s || stepScale(stepScale(s, 1), -1) !== s,
    )
    expect(broken).toEqual([])
  })

  it('does not drift or oscillate from an off-list scale', () => {
    // The real complaint: click down then up and you are a long way from where
    // you began, permanently. 41 is what fitViewport returns for the face at
    // 1440x900, and it is not on the list.
    let s = 41
    s = stepScale(s, -1)
    expect(s).toBe(40) // snapped onto the list, 2% away, not 22%
    s = stepScale(s, 1)
    expect(s).toBe(48)
    // ...and from here it is stable rather than wandering further.
    expect(stepScale(stepScale(48, -1), 1)).toBe(48)
  })

  it('always moves, in both directions, away from the clamps', () => {
    const stuck = scales
      .filter((s) => s > MIN_SCALE && s < MAX_SCALE)
      .filter((s) => stepScale(s, 1) === s || stepScale(s, -1) === s)
    expect(stuck).toEqual([])
  })

  it('clamps at both ends instead of running off', () => {
    expect(stepScale(MIN_SCALE, -1)).toBe(MIN_SCALE)
    expect(stepScale(MAX_SCALE, 1)).toBe(MAX_SCALE)
  })

  it('never takes a step bigger than 26%, above the integer floor', () => {
    // The old ladder's measured worst case was 50%; the wheel's is 14%. Below
    // scale 5 a whole pixel is a large proportion of the scale and there is no
    // smaller step available — 1 -> 2 is 100% and nothing can be done about it
    // short of fractional scales, which would stop cells tiling exactly.
    const violations: Array<[number, number, number]> = []
    for (const s of scales.filter((v) => v >= 5)) {
      for (const dir of [1, -1] as const) {
        const next = stepScale(s, dir)
        if (next === s) continue
        const jump = Math.abs(next - s) / s
        if (jump > 0.26) violations.push([s, next, Math.round(jump * 100)])
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps every power of two reachable', () => {
    // The point of the coarse ladder was landing on recognisable factors. That
    // goal was right; one rung per click was the part that was wrong.
    for (const p of [1, 2, 4, 8, 16, 32, 64]) expect(ZOOM_STEPS).toContain(p)
  })

  it('stays an integer, so cells still tile exactly', () => {
    const fractional = scales
      .flatMap((s) => [stepScale(s, 1), stepScale(s, -1)])
      .filter((v) => !Number.isInteger(v))
    expect(fractional).toEqual([])
  })

  it('is a real improvement on the coarse ladder it replaced', () => {
    // Pins the regression, not just the fix. The old ZOOM_LADDER was
    // [1,2,3,4,6,8,12,16,24,32,48,64] stepped one rung per click, so from the
    // fitted 41 the − button went to 32 — a 22% lurch. It is deleted rather
    // than kept around, so this asserts the new behaviour against the numbers
    // the old one produced.
    expect(stepScale(41, -1)).toBe(40) // 2% down, not 22%
    expect(stepScale(41, 1)).toBe(48)
    // Steps that the old ladder skipped entirely are now reachable.
    for (const s of [5, 7, 10, 14, 20, 28, 40, 56]) expect(ZOOM_STEPS).toContain(s)
  })
})
