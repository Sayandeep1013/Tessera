/**
 * Coordinate conversion, the zoom ladder, and fit. See docs/specs/05-editor.md §4-5.
 */

import type { Viewport } from '../renderer/canvas'
import type { Doc } from '../artwork-core/schema'

/** Integer scales only, so cells always tile exactly. */
export const ZOOM_LADDER = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64] as const

export function nextScale(current: number, direction: 1 | -1): number {
  const i = ZOOM_LADDER.findIndex((s) => s >= current)
  const at = i < 0 ? ZOOM_LADDER.length - 1 : i
  const target = at + direction
  return ZOOM_LADDER[Math.max(0, Math.min(ZOOM_LADDER.length - 1, target))]!
}

export function snapScale(raw: number): number {
  let best: number = ZOOM_LADDER[0]!
  for (const s of ZOOM_LADDER) if (Math.abs(s - raw) < Math.abs(best - raw)) best = s
  return best
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

/** Largest ladder scale that fits with a margin, centred. */
export function fitViewport(doc: Doc, cssW: number, cssH: number, margin = 48): Viewport {
  const maxScale = Math.min((cssW - margin * 2) / doc.w, (cssH - margin * 2) / doc.h)
  let scale: number = ZOOM_LADDER[0]!
  for (const s of ZOOM_LADDER) if (s <= maxScale) scale = s
  return {
    scale,
    offsetX: Math.round((cssW - doc.w * scale) / 2),
    offsetY: Math.round((cssH - doc.h * scale) / 2),
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
