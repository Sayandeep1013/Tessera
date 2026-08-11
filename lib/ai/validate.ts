/**
 * The ten gates. See docs/specs/06-ai-protocol.md §5.
 *
 * Nothing reaches a real document before passing every one of these. Because the
 * dry run (gate 9) applies to a clone, a rejected response is structurally
 * incapable of partial application — it is not a discipline the code has to keep.
 */

import { applyOps, type Op } from '../artwork-core/ops'
import { diff, isEmpty, type PixelDiff } from '../artwork-core/diff'
import { err, ok, MAX_PALETTE, type Doc, type Result } from '../artwork-core/schema'
import { aiEditResponseSchema } from './opSchema'
import { MAX_NEW_COLORS, MAX_OPS, MAX_PIXELS, MAX_SUMMARY } from './limits'

export type ValidationCode =
  | 'schema'
  | 'bad_summary'
  | 'no_ops'
  | 'too_many_ops'
  | 'pixel_budget'
  | 'too_many_colors'
  | 'palette_full'
  | 'out_of_bounds'
  | 'palette_range'
  | 'noop'
  | 'bad_rect'
  | 'apply_failed'
  | 'empty_diff'

export type ValidationError = { code: ValidationCode; message: string; opIndex?: number }

export type Proposal = {
  summary: string
  ops: Op[]
  diff: PixelDiff
  preview: Doc
  frame: number
}

export function validateResponse(
  raw: unknown,
  doc: Doc,
  frame = 0,
): Result<Proposal, ValidationError> {
  // ── 1. schema ────────────────────────────────────────────────────────────
  const parsed = aiEditResponseSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]!
    return err({
      code: 'schema',
      message: `the model's response did not match the expected shape: ${first.path.join('.')} ${first.message}`,
    })
  }
  const { summary, operations } = parsed.data

  // ── 2. summary ───────────────────────────────────────────────────────────
  if (!summary.trim() || summary.length > MAX_SUMMARY) {
    return err({ code: 'bad_summary', message: 'the model returned an unusable summary' })
  }

  // ── 3. op count ──────────────────────────────────────────────────────────
  if (operations.length === 0) {
    return err({ code: 'no_ops', message: 'the model proposed no changes' })
  }
  if (operations.length > MAX_OPS) {
    return err({
      code: 'too_many_ops',
      message: `that edit needed ${operations.length} operations; the limit is ${MAX_OPS}. Try asking for one change at a time.`,
    })
  }

  // ── 4. pixel budget ──────────────────────────────────────────────────────
  let pixelCount = 0
  for (const op of operations) if (op.op === 'set_pixels') pixelCount += op.px.length
  if (pixelCount > MAX_PIXELS) {
    return err({
      code: 'pixel_budget',
      message: `that edit touched ${pixelCount} pixels; the limit is ${MAX_PIXELS}. Try asking for one change at a time.`,
    })
  }

  // ── 5. colour budget ─────────────────────────────────────────────────────
  const newColors = operations.filter((o) => o.op === 'add_palette_color').length
  if (newColors > MAX_NEW_COLORS) {
    return err({
      code: 'too_many_colors',
      message: `that edit added ${newColors} colours; the limit is ${MAX_NEW_COLORS} per edit.`,
    })
  }
  if (doc.palette.length + newColors > MAX_PALETTE) {
    return err({
      code: 'palette_full',
      message: `that edit would exceed the ${MAX_PALETTE}-colour palette limit.`,
    })
  }

  // ── 6 + 7 + 8. bounds, palette range, sanity — one pass, in op order ──────
  // Palette length must be simulated as it grows: an op may legitimately
  // reference an index created by an earlier add_palette_color.
  let paletteLen = doc.palette.length
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < doc.w && y < doc.h

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!
    const oob = (x: number, y: number): ValidationError | null =>
      inBounds(x, y)
        ? null
        : {
            code: 'out_of_bounds',
            message: `an operation targeted (${x}, ${y}), outside the ${doc.w}x${doc.h} canvas`,
            opIndex: i,
          }
    const badIndex = (n: number): ValidationError | null =>
      n < paletteLen
        ? null
        : {
            code: 'palette_range',
            message: `an operation used colour index ${n}, but only ${paletteLen} colours exist`,
            opIndex: i,
          }

    switch (op.op) {
      case 'set_pixels': {
        for (const [x, y, n] of op.px) {
          const e = oob(x, y) ?? badIndex(n)
          if (e) return err(e)
        }
        break
      }
      case 'draw_line': {
        const e = oob(op.x1, op.y1) ?? oob(op.x2, op.y2) ?? badIndex(op.i)
        if (e) return err(e)
        break
      }
      case 'draw_rect': {
        if (op.w < 1 || op.h < 1) {
          return err({ code: 'bad_rect', message: 'a rectangle had zero width or height', opIndex: i })
        }
        const e = oob(op.x, op.y) ?? oob(op.x + op.w - 1, op.y + op.h - 1) ?? badIndex(op.i)
        if (e) return err(e)
        break
      }
      case 'flood_fill': {
        const e = oob(op.x, op.y) ?? badIndex(op.i)
        if (e) return err(e)
        break
      }
      case 'replace_color': {
        if (op.from === op.to) {
          return err({ code: 'noop', message: 'an operation replaced a colour with itself', opIndex: i })
        }
        const e = badIndex(op.from) ?? badIndex(op.to)
        if (e) return err(e)
        break
      }
      case 'add_palette_color': {
        paletteLen++
        break
      }
    }
  }

  // ── 9. dry run against a clone ───────────────────────────────────────────
  const applied = applyOps(doc, operations, frame)
  if (!applied.ok) {
    return err({
      code: 'apply_failed',
      message: `the proposed edit could not be applied: ${applied.error.message}`,
      opIndex: applied.error.opIndex,
    })
  }

  // ── 10. did anything actually change? ────────────────────────────────────
  const d = diff(doc, applied.value, frame)
  if (isEmpty(d)) {
    return err({
      code: 'empty_diff',
      message: 'no change was proposed — try being more specific',
    })
  }

  return ok({ summary, ops: operations, diff: d, preview: applied.value, frame })
}
