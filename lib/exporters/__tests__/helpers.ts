import { parseDoc } from '../../artwork-core/codec'
import type { Doc } from '../../artwork-core/schema'

/** One frame, arbitrarily many layers, built the same way sprite-svg.test.ts does. */
export function docFromLayers(
  layers: Array<{ rows: string[]; hidden?: boolean; n?: string }>,
  palette: string[],
): Doc {
  const w = layers[0]!.rows[0]!.length
  const h = layers[0]!.rows.length
  const r = parseDoc({
    v: 1,
    id: 'test',
    name: 'test',
    w,
    h,
    palette: palette.map((c) => ({ c })),
    frames: [{
      ms: 100,
      layers: layers.map((l, i) => ({ n: l.n ?? `L${i}`, hidden: l.hidden, px: l.rows })),
    }],
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

export function docFrom(rows: string[], palette: string[]): Doc {
  return docFromLayers([{ rows }], palette)
}
