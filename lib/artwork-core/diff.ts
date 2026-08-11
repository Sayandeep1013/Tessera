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
 * Compare one frame of two documents.
 *
 * Throws RangeError on mismatched dimensions — reaching that means a caller bug,
 * not bad user input. A dimension change is a `resize` command, not a diff.
 */
export function diff(before: Doc, after: Doc, frame = 0): PixelDiff {
  if (before.w !== after.w || before.h !== after.h) {
    throw new RangeError(
      `cannot diff documents of different sizes (${before.w}x${before.h} vs ${after.w}x${after.h})`,
    )
  }

  const a = before.frames[frame]?.layers[0]?.px
  const b = after.frames[frame]?.layers[0]?.px
  if (!a || !b) throw new RangeError(`frame ${frame} does not exist in both documents`)

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
