/**
 * Document comparison. See docs/specs/03-artwork-core.md §6.
 *
 * Used by the AI proposal flow to show what an edit would change, and by the
 * spike to judge probe results.
 */

import type { Doc, PaletteEntry } from './schema'

export type PixelDiff = {
  /** was transparent, now not */
  added: Array<[x: number, y: number, to: number]>
  /** was one non-transparent colour, now a different one */
  changed: Array<[x: number, y: number, from: number, to: number]>
  /** was non-transparent, now transparent */
  removed: Array<[x: number, y: number, from: number]>
  paletteAdded: PaletteEntry[]
}

/**
 * Compare ONE LAYER of one frame of two documents.
 *
 * Throws RangeError on mismatched dimensions — reaching that means a caller bug,
 * not bad user input. A dimension change is a `resize` command, not a diff.
 *
 * `layer` defaults to 0 so every pre-layers call site keeps its meaning. A caller
 * that might be looking at a multi-layer document should ask `changedLayers`
 * first — a single-layer diff of a two-layer edit silently reports half of it.
 */
export function diff(before: Doc, after: Doc, frame = 0, layer = 0): PixelDiff {
  if (before.w !== after.w || before.h !== after.h) {
    throw new RangeError(
      `cannot diff documents of different sizes (${before.w}x${before.h} vs ${after.w}x${after.h})`,
    )
  }

  const a = before.frames[frame]?.layers[layer]?.px
  const b = after.frames[frame]?.layers[layer]?.px
  if (!a || !b) {
    throw new RangeError(`frame ${frame} layer ${layer} does not exist in both documents`)
  }

  const out: PixelDiff = { added: [], changed: [], removed: [], paletteAdded: [] }
  const { w } = before

  for (let p = 0; p < a.length; p++) {
    const from = a[p]!
    const to = b[p]!
    if (from === to) continue
    const x = p % w
    const y = (p - x) / w
    if (from === 0) out.added.push([x, y, to])
    else if (to === 0) out.removed.push([x, y, from])
    else out.changed.push([x, y, from, to])
  }

  // Indices are identity, so compare by position — two entries with the same hex
  // at different indices are different entries.
  for (let i = before.palette.length; i < after.palette.length; i++) {
    out.paletteAdded.push(after.palette[i]!)
  }

  return out
}

/**
 * Which layers of `frame` differ in pixels, ascending.
 *
 * The question `diff` cannot answer on its own. An agent session that painted on
 * two layers must not collapse to a single-layer `ai_edit`; that command would
 * undo half the work and leave the rest, which is the silent-corruption class
 * this whole design exists to avoid. See docs/specs/14-layers.md §7.3.
 *
 * Layers present in only one of the two documents count as changed.
 */
export function changedLayers(before: Doc, after: Doc, frame: number): number[] {
  const a = before.frames[frame]?.layers ?? []
  const b = after.frames[frame]?.layers ?? []
  const out: number[] = []

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const pa = a[i]?.px
    const pb = b[i]?.px
    if (!pa || !pb || pa.length !== pb.length) {
      out.push(i)
      continue
    }
    for (let p = 0; p < pa.length; p++) {
      if (pa[p] !== pb[p]) {
        out.push(i)
        break
      }
    }
  }
  return out
}

/**
 * True when the two documents have the same layer *structure* everywhere: same
 * frame count, same layer count per frame, same names, same visibility. Pixels
 * are not compared.
 *
 * Deliberately strict, and deliberately across all frames. It gates the session
 * fallback to `replace_doc`, so a false positive is a wrong undo and a false
 * negative is only a heavier command.
 */
export function sameLayerShape(before: Doc, after: Doc): boolean {
  if (before.frames.length !== after.frames.length) return false
  for (let f = 0; f < before.frames.length; f++) {
    const a = before.frames[f]!.layers
    const b = after.frames[f]!.layers
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.n !== b[i]!.n) return false
      if (Boolean(a[i]!.hidden) !== Boolean(b[i]!.hidden)) return false
    }
  }
  return true
}

export function isEmpty(d: PixelDiff): boolean {
  return (
    d.added.length === 0 &&
    d.changed.length === 0 &&
    d.removed.length === 0 &&
    d.paletteAdded.length === 0
  )
}

export function diffCounts(d: PixelDiff): {
  added: number
  changed: number
  removed: number
  palette: number
  total: number
} {
  return {
    added: d.added.length,
    changed: d.changed.length,
    removed: d.removed.length,
    palette: d.paletteAdded.length,
    total: d.added.length + d.changed.length + d.removed.length,
  }
}

/** A one-line human summary, e.g. "+12  ~6  -0  ·  1 new colour". */
export function describeDiff(d: PixelDiff): string {
  const c = diffCounts(d)
  const base = `+${c.added}  ~${c.changed}  -${c.removed}`
  if (!c.palette) return base
  return `${base}  ·  ${c.palette} new colour${c.palette === 1 ? '' : 's'}`
}
