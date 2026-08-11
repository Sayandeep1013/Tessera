/**
 * The complete operation vocabulary. See docs/SPEC.md §4.
 *
 * This is the safety mechanism: there is deliberately no operation that accepts
 * a raster image, a base64 blob, or a free-form pixel matrix. Pixel soup is not
 * expressible.
 *
 * The editor's own tools call the same primitives, so there is exactly one
 * Bresenham and one flood fill in the codebase.
 */

import { z } from 'zod'
import { cloneDoc } from './codec'
import { MAX_PALETTE, err, ok, type Doc, type Result } from './schema'

// ---------------------------------------------------------------------------
// Op schema
// ---------------------------------------------------------------------------

const coord = z.number().int()

export const opSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set_pixels'),
    px: z.array(z.tuple([coord, coord, z.number().int().min(0)])).min(1),
  }),
  z.object({
    op: z.literal('draw_line'),
    x1: coord,
    y1: coord,
    x2: coord,
    y2: coord,
    i: z.number().int().min(0),
  }),
  z.object({
    op: z.literal('draw_rect'),
    x: coord,
    y: coord,
    w: z.number().int().min(1),
    h: z.number().int().min(1),
    i: z.number().int().min(0),
    fill: z.boolean(),
  }),
  z.object({
    op: z.literal('flood_fill'),
    x: coord,
    y: coord,
    i: z.number().int().min(0),
  }),
  z.object({
    op: z.literal('replace_color'),
    from: z.number().int().min(0),
    to: z.number().int().min(0),
  }),
  z.object({
    op: z.literal('add_palette_color'),
    c: z.string(),
  }),
])

export type Op = z.infer<typeof opSchema>

export type OpError = { code: string; message: string; opIndex?: number }

// ---------------------------------------------------------------------------
// Primitives — shared with the editor's tools
// ---------------------------------------------------------------------------

/** Bresenham. Returns every integer cell on the line, endpoints included. */
export function linePoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = []
  let x = x1
  let y = y1
  const dx = Math.abs(x2 - x1)
  const dy = -Math.abs(y2 - y1)
  const sx = x1 < x2 ? 1 : -1
  const sy = y1 < y2 ? 1 : -1
  let e = dx + dy

  for (;;) {
    points.push([x, y])
    if (x === x2 && y === y2) break
    const e2 = 2 * e
    if (e2 >= dy) {
      e += dy
      x += sx
    }
    if (e2 <= dx) {
      e += dx
      y += sy
    }
  }
  return points
}

/** 4-connected flood fill. Returns the filled cells; does not mutate. */
export function floodFillPoints(
  px: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
): Array<[number, number]> {
  const target = px[sy * w + sx]!
  const seen = new Uint8Array(w * h)
  const out: Array<[number, number]> = []
  const stack: number[] = [sy * w + sx]

  while (stack.length) {
    const p = stack.pop()!
    if (seen[p]) continue
    if (px[p] !== target) continue
    seen[p] = 1
    const x = p % w
    const y = (p - x) / w
    out.push([x, y])
    if (x > 0) stack.push(p - 1)
    if (x < w - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - w)
    if (y < h - 1) stack.push(p + w)
  }
  return out
}

/** Cells on a rectangle outline, or the whole rectangle when filled. */
export function rectPoints(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: boolean,
): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1
      if (fill || edge) out.push([x + dx, y + dy])
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/**
 * Apply one op to a clone. Returns a NEW document; the input is untouched.
 * For a sequence, prefer `applyOps` — it clones once.
 */
export function applyOp(doc: Doc, op: Op, frameIndex = 0): Result<Doc, OpError> {
  return applyOps(doc, [op], frameIndex)
}

/**
 * Apply a sequence of ops. Clones once, then mutates the clone.
 * Fails atomically: on any error nothing is returned and the input is untouched.
 */
export function applyOps(doc: Doc, ops: Op[], frameIndex = 0): Result<Doc, OpError> {
  const frame = doc.frames[frameIndex]
  if (!frame) {
    return err({ code: 'no_frame', message: `frame ${frameIndex} does not exist` })
  }

  const next = cloneDoc(doc)
  const layer = next.frames[frameIndex]!.layers[0]!
  const { w, h } = next
  const px = layer.px

  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h

  for (let oi = 0; oi < ops.length; oi++) {
    const op = ops[oi]!

    const checkIndex = (i: number): OpError | null =>
      i < next.palette.length
        ? null
        : {
            code: 'palette_range',
            message: `palette index ${i} does not exist (palette has ${next.palette.length} entries)`,
            opIndex: oi,
          }

    switch (op.op) {
      case 'set_pixels': {
        for (const [x, y, i] of op.px) {
          const bad = checkIndex(i)
          if (bad) return err(bad)
          if (!inBounds(x, y)) {
            return err({
              code: 'out_of_bounds',
              message: `set_pixels targets (${x}, ${y}) which is outside the ${w}x${h} canvas`,
              opIndex: oi,
            })
          }
          px[y * w + x] = i
        }
        break
      }

      case 'draw_line': {
        const bad = checkIndex(op.i)
        if (bad) return err(bad)
        for (const [x, y] of linePoints(op.x1, op.y1, op.x2, op.y2)) {
          if (!inBounds(x, y)) {
            return err({
              code: 'out_of_bounds',
              message: `draw_line passes through (${x}, ${y}) which is outside the ${w}x${h} canvas`,
              opIndex: oi,
            })
          }
          px[y * w + x] = op.i
        }
        break
      }

      case 'draw_rect': {
        const bad = checkIndex(op.i)
        if (bad) return err(bad)
        if (!inBounds(op.x, op.y) || !inBounds(op.x + op.w - 1, op.y + op.h - 1)) {
          return err({
            code: 'out_of_bounds',
            message: `draw_rect ${op.w}x${op.h} at (${op.x}, ${op.y}) does not fit inside the ${w}x${h} canvas`,
            opIndex: oi,
          })
        }
        for (const [x, y] of rectPoints(op.x, op.y, op.w, op.h, op.fill)) {
          px[y * w + x] = op.i
        }
        break
      }

      case 'flood_fill': {
        const bad = checkIndex(op.i)
        if (bad) return err(bad)
        if (!inBounds(op.x, op.y)) {
          return err({
            code: 'out_of_bounds',
            message: `flood_fill starts at (${op.x}, ${op.y}) which is outside the ${w}x${h} canvas`,
            opIndex: oi,
          })
        }
        for (const [x, y] of floodFillPoints(px, w, h, op.x, op.y)) {
          px[y * w + x] = op.i
        }
        break
      }

      case 'replace_color': {
        const badFrom = checkIndex(op.from)
        if (badFrom) return err(badFrom)
        const badTo = checkIndex(op.to)
        if (badTo) return err(badTo)
        if (op.from === op.to) {
          return err({
            code: 'noop',
            message: 'replace_color requires from !== to',
            opIndex: oi,
          })
        }
        for (let p = 0; p < px.length; p++) if (px[p] === op.from) px[p] = op.to
        break
      }

      case 'add_palette_color': {
        if (next.palette.length >= MAX_PALETTE) {
          return err({
            code: 'palette_full',
            message: `palette is full (${MAX_PALETTE} entries); replace a colour instead of adding one`,
            opIndex: oi,
          })
        }
        if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(op.c)) {
          return err({
            code: 'bad_color',
            message: `"${op.c}" is not a lowercase #rrggbb or #rrggbbaa colour`,
            opIndex: oi,
          })
        }
        next.palette.push({ c: op.c })
        break
      }
    }
  }

  next.meta = { ...next.meta, updatedAt: new Date().toISOString() }
  return ok(next)
}
