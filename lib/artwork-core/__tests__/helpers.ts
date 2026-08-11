import fc from 'fast-check'
import { encodeRows } from '../codec'
import { FORMAT_VERSION, MAX_PALETTE, type Doc, type PaletteEntry } from '../schema'

/** A deterministic minimal document, handy for targeted cases. */
export function docOf(rows: string[], palette: PaletteEntry[]): Doc {
  const h = rows.length
  const w = rows[0]!.length
  const px = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y]![x]!
      px[y * w + x] = ch === '.' ? 0 : ch >= '1' && ch <= '9' ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 87
    }
  }
  return {
    v: FORMAT_VERSION,
    id: 'test',
    name: 'test',
    w,
    h,
    palette,
    frames: [{ ms: 100, layers: [{ n: 'base', px }] }],
    meta: { createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' },
  }
}

const hex = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => '#' + n.toString(16).padStart(6, '0'))

/**
 * Biased toward small canvases and the boundary sizes, per 11 §4 — uniform
 * random dimensions would almost never hit the interesting cases.
 */
export function arbDoc(): fc.Arbitrary<Doc> {
  return fc
    .tuple(
      fc.oneof(
        fc.constant(1),
        fc.constant(2),
        fc.integer({ min: 3, max: 12 }),
        fc.constant(16),
      ),
      fc.oneof(fc.constant(1), fc.integer({ min: 2, max: 12 }), fc.constant(16)),
      fc.oneof(
        fc.constant(1),
        fc.integer({ min: 2, max: 8 }),
        fc.constant(MAX_PALETTE),
      ),
    )
    .chain(([w, h, paletteLen]) =>
      fc
        .tuple(
          fc.array(hex, { minLength: paletteLen - 1, maxLength: paletteLen - 1 }),
          fc.array(fc.integer({ min: 0, max: paletteLen - 1 }), {
            minLength: w * h,
            maxLength: w * h,
          }),
          fc.integer({ min: 10, max: 10_000 }),
          fc.string({ maxLength: 20 }),
        )
        .map(([colors, indices, ms, name]) => ({
          v: FORMAT_VERSION as 1,
          id: 'gen',
          name,
          w,
          h,
          palette: [
            { c: 'transparent' },
            ...colors.map((c) => ({ c })),
          ] as PaletteEntry[],
          frames: [{ ms, layers: [{ n: 'base', px: Uint8Array.from(indices) }] }],
          meta: {
            createdAt: '2026-08-11T00:00:00.000Z',
            updatedAt: '2026-08-11T00:00:00.000Z',
          },
        })),
    )
}

/** Serialize without going through serializeDoc, so round-trip tests are independent. */
export function toJson(doc: Doc): string {
  return JSON.stringify(
    {
      v: doc.v,
      id: doc.id,
      name: doc.name,
      w: doc.w,
      h: doc.h,
      palette: doc.palette,
      frames: doc.frames.map((f) => ({
        ms: f.ms,
        layers: f.layers.map((l) => ({ n: l.n, px: encodeRows(l.px, doc.w, doc.h) })),
      })),
      meta: doc.meta,
    },
    null,
    2,
  )
}
