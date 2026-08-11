/**
 * Brush masks. See docs/specs/05-editor.md §2.
 *
 * Precomputed once at module load. An off-by-one in a brush mask is invisible in
 * code review and obvious on screen, so these are golden-tested.
 */

export type BrushShape = 'square' | 'round'
export const MAX_BRUSH = 8

export type Offset = readonly [number, number]

function buildMask(shape: BrushShape, size: number): Offset[] {
  const out: Offset[] = []
  const half = (size - 1) / 2
  const r = size / 2
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (shape === 'round' && size > 2) {
        // distance from cell centre to brush centre
        const cx = dx - half
        const cy = dy - half
        if (Math.hypot(cx, cy) > r - 0.5) continue
      }
      out.push([dx - Math.floor(half), dy - Math.floor(half)] as const)
    }
  }
  return out
}

const CACHE = new Map<string, Offset[]>()

export function brushMask(shape: BrushShape, size: number): Offset[] {
  const n = Math.max(1, Math.min(MAX_BRUSH, Math.round(size)))
  const key = `${shape}:${n}`
  let mask = CACHE.get(key)
  if (!mask) {
    mask = buildMask(shape, n)
    CACHE.set(key, mask)
  }
  return mask
}
