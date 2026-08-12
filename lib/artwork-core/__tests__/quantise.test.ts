import { describe, expect, it } from 'vitest'
import { REUSE_MAX, colorDistance, parseHex, quantise, toHex } from '../quantise'
import type { Rgba } from '../fit-image'
import { DEFAULT_PALETTE } from '../create'
import { MAX_PALETTE, type PaletteEntry } from '../schema'

const TRANSPARENT_ONLY: PaletteEntry[] = [{ c: 'transparent' }]

function fromColours(w: number, h: number, px: Array<[number, number, number, number]>): Rgba {
  const data = new Uint8ClampedArray(w * h * 4)
  px.forEach(([r, g, b, a], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  })
  return { w, h, data }
}

/** A deterministic pseudo-photo: `count` distinct colours spread over w*h. */
function noisy(w: number, h: number, count: number, seed = 1): Rgba {
  const px: Array<[number, number, number, number]> = []
  let s = seed
  for (let i = 0; i < w * h; i++) {
    s = (s * 1103515245 + 12345) % 2147483648
    // The high bits: an LCG modulo a power of two has notoriously short cycles
    // in its low ones, and `s % count` produced 32 distinct colours out of 200.
    const k = Math.floor(s / 65536) % count
    px.push([(k * 37) % 256, (k * 91) % 256, (k * 149) % 256, 255])
  }
  return fromColours(w, h, px)
}

describe('colorDistance — redmean, §9.3', () => {
  it('is zero for identical colours', () => {
    expect(colorDistance({ r: 12, g: 34, b: 56 }, { r: 12, g: 34, b: 56 })).toBe(0)
  })

  it('is symmetric', () => {
    const a = { r: 200, g: 10, b: 60 }
    const b = { r: 30, g: 180, b: 90 }
    expect(colorDistance(a, b)).toBeCloseTo(colorDistance(b, a), 10)
  })

  it('tops out around 765 for black against white', () => {
    const d = colorDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })
    expect(d).toBeGreaterThan(750)
    expect(d).toBeLessThan(770)
  })

  /** The reason it is not plain Euclidean: the eye does not weight the
   *  channels equally, and a threshold built on the assumption that it does is
   *  either too eager in green or useless in blue. */
  it('weights green above blue for the same numeric difference', () => {
    const base = { r: 100, g: 100, b: 100 }
    const green = colorDistance(base, { r: 100, g: 140, b: 100 })
    const blue = colorDistance(base, { r: 100, g: 100, b: 140 })
    expect(green).toBeGreaterThan(blue)
  })

  /** The threshold is quoted in the spec as "about eight levels per channel",
   *  and that sentence has to stay true if the constant ever moves. */
  it('puts #808080 against #888888 exactly at the reuse threshold', () => {
    expect(colorDistance({ r: 128, g: 128, b: 128 }, { r: 136, g: 136, b: 136 }))
      .toBeCloseTo(REUSE_MAX, 1)
  })
})

describe('hex', () => {
  it('round-trips the long lowercase form the schema demands', () => {
    expect(toHex({ r: 255, g: 0, b: 171 })).toBe('#ff00ab')
    expect(parseHex('#ff00ab')).toEqual({ r: 255, g: 0, b: 171, a: 255 })
  })

  it('reads an alpha suffix, and refuses transparent and short forms', () => {
    expect(parseHex('#11223344')).toEqual({ r: 17, g: 34, b: 51, a: 68 })
    expect(parseHex('transparent')).toBeNull()
    expect(parseHex('#abc')).toBeNull()
  })

  it('clamps and rounds rather than emitting something unparseable', () => {
    expect(parseHex(toHex({ r: -5, g: 300, b: 127.6 }))).toEqual({ r: 0, g: 255, b: 128, a: 255 })
  })
})

describe('quantise — the format is the constraint, §5 and §9.3', () => {
  it('reduces 200 colours to something the palette can hold', () => {
    const r = quantise(noisy(32, 32, 200), TRANSPARENT_ONLY)
    expect(r.sourceColours).toBeGreaterThan(150)
    expect(r.colours).toBeLessThanOrEqual(MAX_PALETTE - 1)
    expect(TRANSPARENT_ONLY.length + r.added.length).toBeLessThanOrEqual(MAX_PALETTE)
  })

  it('is deterministic across runs', () => {
    const src = noisy(24, 24, 200)
    const a = quantise(src, DEFAULT_PALETTE)
    const b = quantise(src, DEFAULT_PALETTE)
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices))
    expect(a.added).toEqual(b.added)
    expect(a.colours).toBe(b.colours)
  })

  /**
   * A proxy for "nothing depends on Map insertion order": the same colours in a
   * different spatial arrangement must produce the same palette.
   */
  it('does not depend on the order the colours were encountered', () => {
    const src = noisy(16, 16, 120)
    const reversed: Rgba = { w: 16, h: 16, data: new Uint8ClampedArray(src.data.length) }
    const n = 16 * 16
    for (let p = 0; p < n; p++) {
      const q = n - 1 - p
      for (let c = 0; c < 4; c++) reversed.data[p * 4 + c] = src.data[q * 4 + c]!
    }
    expect(quantise(reversed, DEFAULT_PALETTE).added)
      .toEqual(quantise(src, DEFAULT_PALETTE).added)
  })

  it('maps a fully transparent pixel to index 0 (spec §2)', () => {
    const r = quantise(fromColours(2, 1, [[255, 0, 0, 255], [255, 0, 0, 0]]), TRANSPARENT_ONLY)
    expect(r.indices[1]).toBe(0)
    expect(r.indices[0]).not.toBe(0)
  })

  /** §9.3: alpha is a cutoff, not a channel. */
  it('cuts alpha at 128 rather than inventing an entry per alpha level', () => {
    const r = quantise(
      fromColours(4, 1, [[10, 20, 30, 127], [10, 20, 30, 128], [10, 20, 30, 200], [10, 20, 30, 255]]),
      TRANSPARENT_ONLY,
    )
    expect(Array.from(r.indices)).toEqual([0, 1, 1, 1])
    expect(r.added).toHaveLength(1)
  })

  it('reports no colours at all for a wholly transparent image', () => {
    const r = quantise(fromColours(2, 2, new Array(4).fill([9, 9, 9, 0])), DEFAULT_PALETTE)
    expect(r.sourceColours).toBe(0)
    expect(r.colours).toBe(0)
    expect(r.added).toEqual([])
    expect(Array.from(r.indices)).toEqual([0, 0, 0, 0])
  })

  it('reports the count it actually produced', () => {
    const r = quantise(noisy(20, 20, 60), TRANSPARENT_ONLY)
    const distinct = new Set(Array.from(r.indices).filter((i) => i !== 0))
    expect(r.colours).toBe(distinct.size)
  })

  it('leaves a small image exact — nothing to reduce, nothing reduced', () => {
    const src = fromColours(2, 2, [
      [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255],
    ])
    const r = quantise(src, TRANSPARENT_ONLY)
    expect(r.sourceColours).toBe(4)
    expect(r.colours).toBe(4)
    expect(r.added.map((e) => e.c)).toEqual(
      expect.arrayContaining(['#ff0000', '#00ff00', '#0000ff', '#ffff00']),
    )
  })
})

describe('quantise — reuse before adding, §9.3', () => {
  const ink = DEFAULT_PALETTE[1]!.c // #1a1c2c

  it('reuses an entry the eye cannot tell the colour from', () => {
    // Four levels off ink in each channel — well inside REUSE_MAX.
    const near = fromColours(1, 1, [[0x1e, 0x20, 0x30, 255]])
    const r = quantise(near, DEFAULT_PALETTE)
    expect(r.added).toEqual([])
    expect(r.indices[0]).toBe(1)
    expect(parseHex(ink)).not.toBeNull()
  })

  it('adds an entry for a colour that is visibly different', () => {
    const r = quantise(fromColours(1, 1, [[0xd0, 0x10, 0x90, 255]]), DEFAULT_PALETTE)
    expect(r.added).toEqual([{ c: '#d01090' }])
    expect(r.indices[0]).toBe(DEFAULT_PALETTE.length)
  })

  it('never lets two near-identical new colours both claim a slot', () => {
    const src = fromColours(2, 1, [[0xd0, 0x10, 0x90, 255], [0xd2, 0x12, 0x92, 255]])
    const r = quantise(src, DEFAULT_PALETTE)
    expect(r.added).toHaveLength(1)
    expect(r.indices[0]).toBe(r.indices[1])
  })

  it('does not reuse a palette entry that is itself transparent', () => {
    // Matching a pasted colour to a transparent entry would make it disappear.
    const palette: PaletteEntry[] = [{ c: 'transparent' }, { c: '#d0109000' }]
    const r = quantise(fromColours(1, 1, [[0xd0, 0x10, 0x90, 255]]), palette)
    expect(r.added).toEqual([{ c: '#d01090' }])
    expect(r.indices[0]).toBe(2)
  })
})

describe('quantise — when the palette is full', () => {
  /** 36 entries: transparent plus 35 opaque. Nothing can be added. */
  const full: PaletteEntry[] = [
    { c: 'transparent' },
    ...Array.from({ length: MAX_PALETTE - 1 }, (_, i) => ({
      c: toHex({ r: (i * 7) % 256, g: (i * 61) % 256, b: (i * 113) % 256 }),
    })),
  ]

  it('adds nothing and says so', () => {
    const r = quantise(noisy(16, 16, 200), full)
    expect(full).toHaveLength(MAX_PALETTE)
    expect(r.added).toEqual([])
    expect(r.clipped).toBe(true)
  })

  it('snaps every pixel to a real entry rather than dropping it', () => {
    const r = quantise(noisy(16, 16, 200), full)
    for (const i of r.indices) {
      expect(i).toBeLessThan(full.length)
    }
    expect(r.colours).toBeGreaterThan(0)
  })

  it('is not clipped when there was room all along', () => {
    expect(quantise(noisy(8, 8, 4), DEFAULT_PALETTE).clipped).toBe(false)
  })

  it('respects a tighter budget than the format allows', () => {
    // maxPalette is injected so the caller can reserve room; here it means "one
    // free slot", and everything else must snap to what already exists.
    const r = quantise(noisy(16, 16, 60), DEFAULT_PALETTE, DEFAULT_PALETTE.length + 1)
    expect(r.added).toHaveLength(1)
    expect(r.clipped).toBe(true)
  })
})
