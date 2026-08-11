/**
 * Ordered dithering. See docs/specs/05-editor.md.
 *
 * A 4x4 Bayer matrix, which is the standard for pixel art: it produces an even,
 * non-clumping pattern at every density, and because the threshold depends only
 * on (x % 4, y % 4) the result is stable — painting over the same area twice
 * lands on exactly the same cells, and two strokes meeting mid-shape line up
 * instead of showing a seam. Random dithering has neither property.
 */

/** Values 0..15, in the canonical Bayer order. */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const

export type DitherMode = 'solid' | '75' | '50' | '25'

export const DITHER_MODES: Array<{ id: DitherMode; label: string; density: number }> = [
  { id: 'solid', label: 'Solid', density: 1 },
  { id: '75', label: '75%', density: 0.75 },
  { id: '50', label: '50%', density: 0.5 },
  { id: '25', label: '25%', density: 0.25 },
]

export function densityFor(mode: DitherMode): number {
  return DITHER_MODES.find((m) => m.id === mode)?.density ?? 1
}

/**
 * Whether this cell is painted at the given density.
 *
 * Absolute document coordinates, deliberately — a pattern anchored to the stroke
 * would shift with every new stroke and the dither would not tile across them.
 */
export function ditherPasses(x: number, y: number, density: number): boolean {
  if (density >= 1) return true
  if (density <= 0) return false
  // ((x % 4) + 4) % 4 so negative coordinates do not index out of the matrix.
  const bx = ((x % 4) + 4) % 4
  const by = ((y % 4) + 4) % 4
  return BAYER_4X4[by]![bx]! / 16 < density
}

/**
 * Dithered linear gradient: full density at the drag start, none at the end.
 *
 * A gradient in pixel art is not a colour ramp — with a fixed palette there are
 * no in-between colours to ramp through. It is a *density* ramp of one colour
 * over whatever is beneath, which is how shading is actually done by hand.
 */
export function gradientCells(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  h: number,
): Array<[number, number]> {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  const out: Array<[number, number]> = []

  // A zero-length drag has no direction to ramp along; treat it as a solid dab
  // rather than dividing by zero.
  if (lenSq === 0) {
    if (x1 >= 0 && y1 >= 0 && x1 < w && y1 < h) out.push([x1, y1])
    return out
  }

  const minX = Math.max(0, Math.min(x1, x2))
  const maxX = Math.min(w - 1, Math.max(x1, x2))
  const minY = Math.max(0, Math.min(y1, y2))
  const maxY = Math.min(h - 1, Math.max(y1, y2))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Projection of this cell onto the drag axis, clamped to the segment.
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq))
      if (ditherPasses(x, y, 1 - t)) out.push([x, y])
    }
  }
  return out
}
