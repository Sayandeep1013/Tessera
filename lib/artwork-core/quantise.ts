/**
 * Reduce arbitrary RGBA to palette indices this format can hold.
 * See docs/specs/17-file-menu.md §9.3.
 *
 * Pure and deterministic — the same bytes in give the same bytes out, every
 * run, which §5 requires and which is the only reason a golden test of a
 * quantiser is worth writing. Every choice below that could have gone either
 * way has an explicit tie-break for exactly that reason.
 *
 * **The palette is the hard constraint, not the pixels.** A document holds 36
 * entries, index 0 is permanently transparent, so 35 opaque colours is the
 * ceiling — and the open document may already be using fifteen of them. Three
 * rules resolve that, in order: reuse an entry that is close enough, else take
 * a free slot, else snap to the nearest entry there is. The last branch is the
 * one that honours the constraint, and the message says when it happened.
 */

import type { Rgba } from './fit-image'
import { MAX_PALETTE, TRANSPARENT_INDEX, type PaletteEntry } from './schema'

/**
 * Below this, a source pixel is transparent; at or above it, opaque.
 *
 * Alpha is a cutoff and not a channel (§9.3). Palette entries *can* carry
 * `#rrggbbaa`, so honouring partial alpha would mean one entry per (colour,
 * alpha) pair — the soft edge of a single PNG would eat the whole 36-slot
 * budget and leave nothing for the picture.
 */
export const OPAQUE_MIN_ALPHA = 128

/**
 * How close an existing palette entry has to be before a pasted colour reuses
 * it instead of claiming a slot of its own. On the redmean scale below, whose
 * range is 0..≈765.
 *
 * 24 is about eight levels per channel — `#808080` against `#888888` is exactly
 * 24. Deliberately small: reuse silently changes the image the user pasted, so
 * it may only happen where the change is not visible. A generous threshold buys
 * palette economy with picture quality, and the picture is the thing that was
 * pasted.
 */
export const REUSE_MAX = 24

export type Rgb = { r: number; g: number; b: number }

/**
 * Perceptual distance, cheaply — the "redmean" approximation.
 *
 * Plain Euclidean distance in sRGB claims two blues 40 apart are as different
 * as two greens 40 apart, which the eye flatly contradicts, and a reuse
 * threshold built on it is either too eager in green or useless in blue.
 * Redmean fixes the worst of that with no colour-space conversion and no
 * dependency, which matters because artwork-core imports nothing but zod.
 *
 * Returns the distance itself rather than its square: the threshold is a number
 * a human has to be able to reason about, and 24 is legible where 576 is not.
 */
export function colorDistance(a: Rgb, b: Rgb): number {
  const rm = (a.r + b.r) / 2
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
}

/** `#rrggbb` / `#rrggbbaa` → channels. `transparent` and anything unparseable → null. */
export function parseHex(c: string): { r: number; g: number; b: number; a: number } | null {
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c)) return null
  const n = (i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16)
  return { r: n(0), g: n(1), b: n(2), a: c.length === 9 ? n(3) : 255 }
}

/** Channels → the lowercase long form the schema's colour rule demands. */
export function toHex({ r, g, b }: Rgb): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export type QuantiseResult = {
  /** One palette index per pixel, row-major, length w*h. */
  indices: Uint8Array
  /** Entries to append to the palette, in order. Empty when everything reused. */
  added: PaletteEntry[]
  /** Distinct opaque colours in the source, before any of this happened. */
  sourceColours: number
  /** Distinct palette indices the result uses, not counting transparent. */
  colours: number
  /** True when the palette ran out of room and colours were snapped to fit. */
  clipped: boolean
}

// ─── median cut ──────────────────────────────────────────────────────────────

type Bucket = { r: number; g: number; b: number; n: number }
type Box = { items: Bucket[]; seq: number }

const packed = (c: Rgb): number => (c.r << 16) | (c.g << 8) | c.b

/** The widest channel of a box, and how wide it is. Ties break r → g → b. */
function widest(items: Bucket[]): { axis: 'r' | 'g' | 'b'; range: number } {
  let rlo = 255, rhi = 0, glo = 255, ghi = 0, blo = 255, bhi = 0
  for (const it of items) {
    if (it.r < rlo) rlo = it.r
    if (it.r > rhi) rhi = it.r
    if (it.g < glo) glo = it.g
    if (it.g > ghi) ghi = it.g
    if (it.b < blo) blo = it.b
    if (it.b > bhi) bhi = it.b
  }
  const dr = rhi - rlo
  const dg = ghi - glo
  const db = bhi - blo
  if (dr >= dg && dr >= db) return { axis: 'r', range: dr }
  if (dg >= db) return { axis: 'g', range: dg }
  return { axis: 'b', range: db }
}

/**
 * Split boxes until there are `k` of them, always splitting the one with the
 * widest single channel.
 *
 * Ties break by population and then by the order the box was created, so the
 * result does not depend on `Array.prototype.sort` stability or on the order a
 * Map happened to be built in.
 */
function medianCut(items: Bucket[], k: number): Bucket[][] {
  let seq = 0
  const boxes: Box[] = [{ items, seq: seq++ }]

  while (boxes.length < k) {
    let pick = -1
    let best = { range: 0, pop: 0, seq: 0 }
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!
      if (box.items.length < 2) continue
      const { range } = widest(box.items)
      const pop = box.items.reduce((n, it) => n + it.n, 0)
      const better =
        range > best.range ||
        (range === best.range && pop > best.pop) ||
        (range === best.range && pop === best.pop && box.seq < best.seq)
      if (pick === -1 || better) {
        pick = i
        best = { range, pop, seq: box.seq }
      }
    }
    // Every remaining box is a single colour: there is nothing left to split,
    // and asking for more boxes than the image has colours is not an error.
    if (pick === -1 || best.range === 0) break

    const box = boxes[pick]!
    const { axis } = widest(box.items)
    // The packed value is the final tie-break, so two colours equal on the
    // split axis always order the same way.
    const sorted = [...box.items].sort((a, b) => a[axis] - b[axis] || packed(a) - packed(b))

    // Split at the population-weighted median: a colour covering half the image
    // is not outvoted by a hundred stray anti-aliasing pixels.
    const total = sorted.reduce((n, it) => n + it.n, 0)
    let acc = 0
    let cut = 0
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i]!.n
      cut = i + 1
      if (acc * 2 >= total) break
    }

    boxes.splice(pick, 1, { items: sorted.slice(0, cut), seq: box.seq }, { items: sorted.slice(cut), seq: seq++ })
  }

  return boxes.map((b) => b.items)
}

/** A box's colour: the population-weighted mean of what is in it. */
function representative(items: Bucket[]): Rgb {
  let r = 0, g = 0, b = 0, n = 0
  for (const it of items) {
    r += it.r * it.n
    g += it.g * it.n
    b += it.b * it.n
    n += it.n
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

// ─── the whole thing ─────────────────────────────────────────────────────────

/**
 * RGBA → palette indices against `palette`, adding at most as many entries as
 * the format has room for.
 *
 * Representatives are placed in descending population order, so the colours
 * covering the most of the image get first claim on the free slots and the
 * strays are the ones that snap. That is a quality decision rather than an
 * implementation detail: reversing it would spend the palette on the fringe of
 * an anti-aliased edge and then flatten the subject.
 */
export function quantise(
  rgba: Rgba,
  palette: readonly PaletteEntry[],
  maxPalette: number = MAX_PALETTE,
): QuantiseResult {
  const n = rgba.w * rgba.h
  const indices = new Uint8Array(n)

  // ── histogram, walked in packed order so nothing depends on Map insertion ──
  const hist = new Map<number, number>()
  for (let p = 0; p < n; p++) {
    if (rgba.data[p * 4 + 3]! < OPAQUE_MIN_ALPHA) continue
    const key = (rgba.data[p * 4]! << 16) | (rgba.data[p * 4 + 1]! << 8) | rgba.data[p * 4 + 2]!
    hist.set(key, (hist.get(key) ?? 0) + 1)
  }

  const sourceColours = hist.size
  if (sourceColours === 0) {
    return { indices, added: [], sourceColours: 0, colours: 0, clipped: false }
  }

  const buckets: Bucket[] = [...hist.keys()]
    .sort((a, b) => a - b)
    .map((key) => ({ r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, n: hist.get(key)! }))

  // ── reduce to at most 35 representatives ──────────────────────────────────
  const boxes = medianCut(buckets, Math.min(sourceColours, MAX_PALETTE - 1))

  const reps = boxes
    .map((items) => ({
      rgb: representative(items),
      pop: items.reduce((t, it) => t + it.n, 0),
      items,
    }))
    // Descending population, packed colour as the tie-break.
    .sort((a, b) => b.pop - a.pop || packed(a.rgb) - packed(b.rgb))

  // ── place each representative in the palette ──────────────────────────────
  // Candidates grow as entries are added, so two near-identical new colours
  // cannot both claim a slot — the second reuses the first.
  const candidates: Array<{ index: number; rgb: Rgb }> = []
  palette.forEach((e, i) => {
    if (i === TRANSPARENT_INDEX) return
    const c = parseHex(e.c)
    // An entry that is itself transparent is not something to reuse: matching a
    // pasted colour to it would make the pixel disappear.
    if (c && c.a >= OPAQUE_MIN_ALPHA) candidates.push({ index: i, rgb: c })
  })

  const added: PaletteEntry[] = []
  let free = Math.max(0, maxPalette - palette.length)
  let clipped = false
  const indexOfColour = new Map<number, number>()

  for (const rep of reps) {
    let nearest = -1
    let best = Infinity
    for (const c of candidates) {
      const d = colorDistance(rep.rgb, c.rgb)
      // `<` not `<=`: the earliest entry wins a tie, which keeps the document's
      // own palette order meaningful.
      if (d < best) {
        best = d
        nearest = c.index
      }
    }

    let index: number
    if (nearest >= 0 && best <= REUSE_MAX) {
      index = nearest
    } else if (free > 0) {
      index = palette.length + added.length
      added.push({ c: toHex(rep.rgb) })
      candidates.push({ index, rgb: rep.rgb })
      free--
    } else if (nearest >= 0) {
      index = nearest
      clipped = true
    } else {
      // No opaque entry to snap to and no room to add one. Unreachable from a
      // valid document — palette[0] is transparent and 35 more would leave
      // something to match — but a total function beats a thrown error inside a
      // paste.
      index = TRANSPARENT_INDEX
      clipped = true
    }

    for (const it of rep.items) indexOfColour.set(packed(it), index)
  }

  // ── paint the index grid ──────────────────────────────────────────────────
  const used = new Set<number>()
  for (let p = 0; p < n; p++) {
    if (rgba.data[p * 4 + 3]! < OPAQUE_MIN_ALPHA) continue
    const key = (rgba.data[p * 4]! << 16) | (rgba.data[p * 4 + 1]! << 8) | rgba.data[p * 4 + 2]!
    const index = indexOfColour.get(key) ?? TRANSPARENT_INDEX
    indices[p] = index
    if (index !== TRANSPARENT_INDEX) used.add(index)
  }

  return { indices, added, sourceColours, colours: used.size, clipped }
}
