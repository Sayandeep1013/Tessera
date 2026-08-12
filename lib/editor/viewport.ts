/**
 * Coordinate conversion, zoom, and fit. See docs/specs/05-editor.md §4-5 and
 * docs/specs/15-feedback-and-input.md §2.
 */

import type { Viewport } from '../renderer/canvas'
import type { Doc } from '../artwork-core/schema'

export const MIN_SCALE = 1
export const MAX_SCALE = 64

/** Integer, and inside the range. Continuous zoom lands here, stepped zoom does not need it. */
export function clampScale(raw: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(raw)))
}

/**
 * The scales the − and + buttons walk. Roughly geometric at ~1.2–1.33 per
 * step, and every power of two is on it so the recognisable factors the coarse
 * ladder existed for are still reachable by clicking.
 *
 * A list rather than a multiplier. `current * 1.25` rounded to an integer
 * cannot be reversed — floor(5/1.25) and floor(6/1.25) are both 4, so stepping
 * back up from 4 has no way to know whether it came from 5 or 6. Walking a
 * list by index is exactly reversible by construction, which is the property
 * that was actually broken.
 */
export const ZOOM_STEPS = [
  1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64,
] as const

/**
 * A proportional zoom step, for the − and + buttons.
 *
 * These used to step a coarse twelve-rung ladder, one rung per click. Three
 * measured faults, all reported as "the zoom is janky" — see
 * docs/specs/15-feedback-and-input.md §0 and §2:
 *
 *   - Steps of up to 50%. 32 -> 48 is half the artwork's size again, in one
 *     click, where the wheel's largest step is 14% and its typical step is 2%.
 *   - Not reversible. From an off-rung scale it stepped PAST the nearest rung
 *     one way and not the other: down from 41 gave 32, up from 32 gave 48, and
 *     it oscillated between those two forever after. fitViewport returns
 *     arbitrary integers, so off-rung was the normal case, not an edge case.
 *   - set_zoom then re-snapped to the same coarse rungs, so no caller could
 *     land anywhere else however carefully it chose.
 *
 * "The next entry strictly past where I am" rather than "my index plus one":
 * fitViewport returns arbitrary integers, so the current scale is usually NOT
 * on ZOOM_STEPS at all. From an off-list scale the first click snaps onto the
 * list in the direction of travel — 41 down is 40, 41 up is 48 — and every
 * click after that is exactly reversible. Round-tripping an off-list scale
 * cannot return to it, because the list does not contain it; the old ladder's
 * fault was not that, it was oscillating 32 <-> 48 forever afterwards.
 */
export function stepScale(current: number, direction: 1 | -1): number {
  const next =
    direction === 1
      ? ZOOM_STEPS.find((s) => s > current)
      : [...ZOOM_STEPS].reverse().find((s) => s < current)
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, next ?? current))
}

/**
 * Screen -> document. Math.floor, never round: rounding makes each cell's
 * clickable area straddle two cells and puts the boundary half a cell off.
 * Out-of-bounds results are returned unclamped — callers gate with isInside.
 */
export function screenToDoc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  vp: Viewport,
): { x: number; y: number } {
  return {
    x: Math.floor((clientX - rect.left - vp.offsetX) / vp.scale),
    y: Math.floor((clientY - rect.top - vp.offsetY) / vp.scale),
  }
}

export function docToScreen(
  x: number,
  y: number,
  rect: { left: number; top: number },
  vp: Viewport,
): { x: number; y: number } {
  return { x: rect.left + vp.offsetX + x * vp.scale, y: rect.top + vp.offsetY + y * vp.scale }
}

export function isInside(x: number, y: number, doc: Doc): boolean {
  return x >= 0 && y >= 0 && x < doc.w && y < doc.h
}

/**
 * Largest INTEGER scale that fits with a margin, centred.
 *
 * Not a step off ZOOM_STEPS. Fit used to pick from the old coarse ladder, which
 * jumped 32 → 48, so a viewport with room for 47.25 fell back to 32 — the
 * artwork rendered at 514 px where 754 px fitted, which is less than half the
 * area. Measured at 1440×900 in docs/research/ui-audit.md §2.
 *
 * Integer is the constraint that actually matters here: it is what makes cells
 * tile exactly. Anything below 1 would round to nothing, hence the floor.
 */
export function fitViewport(doc: Doc, cssW: number, cssH: number, margin = 48): Viewport {
  const maxScale = Math.min((cssW - margin * 2) / doc.w, (cssH - margin * 2) / doc.h)
  const scale = Math.max(1, Math.floor(maxScale))
  return {
    scale,
    offsetX: Math.round((cssW - doc.w * scale) / 2),
    offsetY: Math.round((cssH - doc.h * scale) / 2),
  }
}

/**
 * Keep the middle in the middle when the canvas element changes size.
 * See docs/specs/07-code-panel.md §9.3.
 *
 * `offsetX` is measured from the canvas element's left edge, so narrowing the
 * element leaves the artwork exactly where it was and the space disappears off
 * the right. The code panel is a split, so opening it takes 460px that way and
 * arrives on top of the right-hand half of the drawing.
 *
 * Re-fitting would fix it and cost too much: it throws away the pan and zoom of
 * somebody mid-detail-work, which is the price `refit.ts` names in its own
 * header and which `17 §7.3` already refused for the same reason. Moving the
 * offset by half the change keeps the scale, keeps the framing, and is what
 * "the window got smaller" should have always meant — resizing the browser had
 * the same defect and nobody had noticed, because it drifts a little at a time.
 */
export function recentreViewport(vp: Viewport, dw: number, dh: number): Viewport {
  if (dw === 0 && dh === 0) return vp
  return {
    scale: vp.scale,
    offsetX: Math.round(vp.offsetX + dw / 2),
    offsetY: Math.round(vp.offsetY + dh / 2),
  }
}

/**
 * Zoom anchored at a point — the document pixel under the cursor stays under the
 * cursor. Anchoring at the canvas centre instead feels wrong immediately.
 */
export function zoomAt(
  vp: Viewport,
  targetScale: number,
  anchorX: number,
  anchorY: number,
): Viewport {
  if (targetScale === vp.scale) return vp
  const docX = (anchorX - vp.offsetX) / vp.scale
  const docY = (anchorY - vp.offsetY) / vp.scale
  return {
    scale: targetScale,
    offsetX: anchorX - docX * targetScale,
    offsetY: anchorY - docY * targetScale,
  }
}
