/**
 * The selection type and its pure geometry. See docs/specs/20-selector.md §2.
 *
 * A bounding box plus a mask relative to it — a filled rectangle (what the
 * marquee tool draws) is the special case `mask.fill(1)`, not a second type.
 * No React, no DOM, same constraint as lib/editor/brush.ts — every consumer
 * (Canvas.tsx's pointer handlers, app/page.tsx's keyboard handler, the
 * renderer) reaches through here rather than duplicating this math.
 */

import type { PaintCell } from '../artwork-core/commands'

export type Selection = {
  /** Bounding-box origin, document space. */
  x: number
  y: number
  /** Bounding-box size. */
  w: number
  h: number
  /** length w*h, 1 = selected, indexed [ry*w+rx] relative to (x, y). */
  mask: Uint8Array
}

const EMPTY: Selection = { x: 0, y: 0, w: 0, h: 0, mask: new Uint8Array(0) }

/** Marquee's case — every cell in the box is selected, transparent gaps
 *  included. This is what keeps marquee's own move behaviour unchanged: its
 *  mask has no holes to speak of, by design, not by omission. */
export function selectionFromRect(x: number, y: number, w: number, h: number): Selection {
  if (w <= 0 || h <= 0) return { ...EMPTY, x, y }
  return { x, y, w, h, mask: new Uint8Array(w * h).fill(1) }
}

/** Object-select's case — the bbox is the tight bounds of the point list,
 *  the mask marks exactly those points. */
export function selectionFromPoints(points: ReadonlyArray<readonly [number, number]>): Selection {
  if (points.length === 0) return EMPTY
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const mask = new Uint8Array(w * h)
  for (const [x, y] of points) mask[(y - minY) * w + (x - minX)] = 1
  return { x: minX, y: minY, w, h, mask }
}

/** Mask-aware hit test — the gap between two disjoint blobs is inside the
 *  bbox but not in the mask, and must read as a miss. */
export function inSelection(sel: Selection, x: number, y: number): boolean {
  const rx = x - sel.x
  const ry = y - sel.y
  return rx >= 0 && ry >= 0 && rx < sel.w && ry < sel.h && sel.mask[ry * sel.w + rx] === 1
}

/** Every selected cell, in absolute document coordinates. */
export function selectionCells(sel: Selection): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let ry = 0; ry < sel.h; ry++) {
    for (let rx = 0; rx < sel.w; rx++) {
      if (sel.mask[ry * sel.w + rx]) out.push([sel.x + rx, sel.y + ry])
    }
  }
  return out
}

function tightBBox(x: number, y: number, w: number, h: number, mask: Uint8Array): Selection {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let ry = 0; ry < h; ry++) {
    for (let rx = 0; rx < w; rx++) {
      if (!mask[ry * w + rx]) continue
      if (rx < minX) minX = rx
      if (ry < minY) minY = ry
      if (rx > maxX) maxX = rx
      if (ry > maxY) maxY = ry
    }
  }
  if (maxX < 0) return EMPTY
  const nw = maxX - minX + 1
  const nh = maxY - minY + 1
  const trimmed = new Uint8Array(nw * nh)
  for (let ry = 0; ry < nh; ry++) {
    for (let rx = 0; rx < nw; rx++) {
      trimmed[ry * nw + rx] = mask[(ry + minY) * w + (rx + minX)]!
    }
  }
  return { x: x + minX, y: y + minY, w: nw, h: nh, mask: trimmed }
}

/** Combined bbox of two selections' own bboxes — always tight, since it is
 *  literally the min/max of two already-bounded rectangles. */
function combinedBBox(a: Selection, b: Selection) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.w, b.x + b.w)
  const y2 = Math.max(a.y + a.h, b.y + b.h)
  return { x, y, w: x2 - x, h: y2 - y }
}

/** Shift-click's add branch. */
export function unionSelection(a: Selection, b: Selection): Selection {
  if (a.w === 0 || a.h === 0) return b
  if (b.w === 0 || b.h === 0) return a
  const { x, y, w, h } = combinedBBox(a, b)
  const mask = new Uint8Array(w * h)
  for (const [gx, gy] of selectionCells(a)) mask[(gy - y) * w + (gx - x)] = 1
  for (const [gx, gy] of selectionCells(b)) mask[(gy - y) * w + (gx - x)] = 1
  return { x, y, w, h, mask }
}

/** Shift-click's remove branch. Can shrink the bbox, or empty it entirely —
 *  callers treat a w===0 result as "deselect", not as a degenerate selection
 *  living in the store. */
export function subtractSelection(a: Selection, b: Selection): Selection {
  const mask = new Uint8Array(a.w * a.h)
  for (let ry = 0; ry < a.h; ry++) {
    for (let rx = 0; rx < a.w; rx++) {
      if (!a.mask[ry * a.w + rx]) continue
      if (inSelection(b, a.x + rx, a.y + ry)) continue
      mask[ry * a.w + rx] = 1
    }
  }
  return tightBBox(a.x, a.y, a.w, a.h, mask)
}

/** Shift-click's "is this blob already fully selected" branch. */
export function isSubsetOf(sub: Selection, sup: Selection): boolean {
  for (let ry = 0; ry < sub.h; ry++) {
    for (let rx = 0; rx < sub.w; rx++) {
      if (!sub.mask[ry * sub.w + rx]) continue
      if (!inSelection(sup, sub.x + rx, sub.y + ry)) return false
    }
  }
  return true
}

/** Shift the whole selection after a completed move or nudge — same shape,
 *  offset origin. Not clamped to the canvas, matching the pre-existing
 *  rect-selection behaviour of letting `editor.selection` sit partially or
 *  fully off-canvas (J-E7). */
export function translateSelection(sel: Selection, dx: number, dy: number): Selection {
  return { ...sel, x: sel.x + dx, y: sel.y + dy }
}

/**
 * Live-drag preview cell math (§3.4). `lifted` is captured ONCE at the start
 * of the drag — [relX, relY, originalValue] relative to `sel`'s own origin —
 * and every subsequent call only adds the pointer's current delta. Recomputing
 * from live pixels on every move would read back the preview's own
 * in-progress mutation instead of the true original values.
 *
 * Clear-then-stamp, in that order: every currently selected cell is marked to
 * clear to 0, then every lifted cell is stamped at its offset position. A
 * coordinate that is both a source and a destination ends up with the
 * stamped value (the `Map` write order), which is the correct result for a
 * rigid translate. Returns the exact shape `Canvas.tsx`'s `previewMoved`
 * already expects, which does its own off-canvas filtering.
 */
export function movePreviewCells(
  sel: Selection,
  lifted: ReadonlyArray<readonly [number, number, number]>,
  dx: number,
  dy: number,
): { cells: Array<[number, number]>; values: Map<string, number> } {
  const cells: Array<[number, number]> = []
  const values = new Map<string, number>()
  for (const [sx, sy] of selectionCells(sel)) {
    cells.push([sx, sy])
    values.set(`${sx},${sy}`, 0)
  }
  for (const [rx, ry, value] of lifted) {
    const tx = sel.x + rx + dx
    const ty = sel.y + ry + dy
    const key = `${tx},${ty}`
    if (!values.has(key)) cells.push([tx, ty])
    values.set(key, value)
  }
  return { cells, values }
}

/**
 * Discrete move cell math (nudge, §3.6) — reads `px` directly rather than a
 * pre-lifted array, since a keypress has no interactive preview phase to lift
 * before. Both bounds checks (source cells already off-canvas have nothing to
 * lift; destination cells that would land off-canvas are dropped) match
 * `movePreviewCells`'/`previewMoved`'s behaviour, just applied inline since
 * there is no separate filtering step downstream this time.
 */
export function selectionPaintCells(
  px: Uint8Array,
  w: number,
  h: number,
  sel: Selection,
  dx: number,
  dy: number,
): PaintCell[] {
  const cells: PaintCell[] = []
  const index = new Map<string, number>()
  const setAfter = (x: number, y: number, after: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const key = `${x},${y}`
    const at = index.get(key)
    if (at !== undefined) {
      cells[at]![3] = after
      return
    }
    index.set(key, cells.length)
    cells.push([x, y, px[y * w + x]!, after])
  }

  const source = selectionCells(sel).filter(([sx, sy]) => sx >= 0 && sy >= 0 && sx < w && sy < h)
  for (const [sx, sy] of source) setAfter(sx, sy, 0)
  for (const [sx, sy] of source) setAfter(sx + dx, sy + dy, px[sy * w + sx]!)
  return cells
}

/** Del/Backspace's cell math (§3.5) — only the masked cells, cleared to 0. */
export function selectionClearCells(px: Uint8Array, w: number, sel: Selection): PaintCell[] {
  return selectionCells(sel).map(([x, y]) => [x, y, px[y * w + x]!, 0] as PaintCell)
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering — the mask's real boundary, as merged per-side runs
// ─────────────────────────────────────────────────────────────────────────────

export type OutlineSide = 'top' | 'bottom' | 'left' | 'right'
/**
 * `at` is the run's perpendicular grid line (a row for top/bottom, a column
 * for left/right); `a`/`b` are its own two ends along its axis. All in
 * document cell-space — the renderer scales and insets these, not this
 * function (docs/specs/20-selector.md §4.1), keeping the geometry pure.
 */
export type OutlineRun = { side: OutlineSide; at: number; a: number; b: number }

/**
 * The mask's boundary, merged into maximal runs per side. For a filled
 * rectangle this is exactly 4 runs forming today's outline — the regression
 * check (§4.2) — verified by the renderer applying the same corner inset
 * `strokeRect` used to, reproducing identical corner coordinates.
 */
export function selectionOutline(sel: Selection): OutlineRun[] {
  const { x: ox, y: oy, w, h, mask } = sel
  const at = (rx: number, ry: number) =>
    rx >= 0 && ry >= 0 && rx < w && ry < h && mask[ry * w + rx] === 1

  const out: OutlineRun[] = []

  for (let ry = 0; ry < h; ry++) {
    let topStart = -1
    let botStart = -1
    for (let rx = 0; rx <= w; rx++) {
      const isTop = rx < w && at(rx, ry) && !at(rx, ry - 1)
      if (isTop && topStart < 0) topStart = rx
      if (!isTop && topStart >= 0) {
        out.push({ side: 'top', at: oy + ry, a: ox + topStart, b: ox + rx })
        topStart = -1
      }
      const isBot = rx < w && at(rx, ry) && !at(rx, ry + 1)
      if (isBot && botStart < 0) botStart = rx
      if (!isBot && botStart >= 0) {
        out.push({ side: 'bottom', at: oy + ry + 1, a: ox + botStart, b: ox + rx })
        botStart = -1
      }
    }
  }

  for (let rx = 0; rx < w; rx++) {
    let leftStart = -1
    let rightStart = -1
    for (let ry = 0; ry <= h; ry++) {
      const isLeft = ry < h && at(rx, ry) && !at(rx - 1, ry)
      if (isLeft && leftStart < 0) leftStart = ry
      if (!isLeft && leftStart >= 0) {
        out.push({ side: 'left', at: ox + rx, a: oy + leftStart, b: oy + ry })
        leftStart = -1
      }
      const isRight = ry < h && at(rx, ry) && !at(rx + 1, ry)
      if (isRight && rightStart < 0) rightStart = ry
      if (!isRight && rightStart >= 0) {
        out.push({ side: 'right', at: ox + rx + 1, a: oy + rightStart, b: oy + ry })
        rightStart = -1
      }
    }
  }

  return out
}
