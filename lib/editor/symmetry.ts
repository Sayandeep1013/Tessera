/**
 * Stroke mirroring. See docs/specs/16-settings.md §3.
 *
 * Pure, and deliberately tiny: the whole feature is "one painted cell becomes
 * up to four", and everything else — that it stays one undo, that it applies to
 * the shape tools too, that it dedupes on a centre line — falls out of where
 * this is called rather than out of what it does.
 *
 * The mirror is an involution on 0..n-1 for both parities. On an odd axis the
 * centre index maps to itself, which is why the caller can push results into a
 * Map keyed by y*w+x and get deduplication for free instead of special-casing
 * it.
 */

import type { Symmetry } from '../store/editor'

export const mirror = (v: number, n: number): number => n - 1 - v

/**
 * Every cell a paint at (x, y) should touch, including the original.
 *
 * Returns at most four, and fewer when mirrors coincide — a cell on the centre
 * column of an odd canvas is its own horizontal mirror. Duplicates are removed
 * here rather than left to the caller so that "how many cells did that stroke
 * paint" is answerable without knowing about symmetry.
 */
export function mirrored(
  x: number,
  y: number,
  w: number,
  h: number,
  mode: Symmetry,
): Array<[number, number]> {
  if (mode === 'off') return [[x, y]]

  const mx = mirror(x, w)
  const my = mirror(y, h)

  const out: Array<[number, number]> =
    mode === 'h' ? [[x, y], [mx, y]]
    : mode === 'v' ? [[x, y], [x, my]]
    : [[x, y], [mx, y], [x, my], [mx, my]]

  // Dedupe on the centre line. A Set of keys rather than a pairwise compare so
  // the four-way case stays one pass.
  const seen = new Set<number>()
  const unique: Array<[number, number]> = []
  for (const [cx, cy] of out) {
    const key = cy * w + cx
    if (seen.has(key)) continue
    seen.add(key)
    unique.push([cx, cy])
  }
  return unique
}
