import { describe, expect, it } from 'vitest'
import { fitImage, fitRect, resample, type Rgba } from '../fit-image'

/** Build an image from a row-major list of [r,g,b,a] tuples. */
function img(w: number, h: number, px: Array<[number, number, number, number]>): Rgba {
  const data = new Uint8ClampedArray(w * h * 4)
  px.forEach(([r, g, b, a], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  })
  return { w, h, data }
}

/** A flat colour of a given size — the shape most of these tests want. */
function solid(w: number, h: number, rgba: [number, number, number, number]): Rgba {
  return img(w, h, new Array(w * h).fill(rgba))
}

const at = (im: Rgba, x: number, y: number): number[] => {
  const i = (y * im.w + x) * 4
  return [im.data[i]!, im.data[i + 1]!, im.data[i + 2]!, im.data[i + 3]!]
}

describe('fitRect — spec §9.2', () => {
  /** The case §5 names by name. */
  it('centres a 1000×500 image in a 32×32 document, preserving aspect', () => {
    expect(fitRect(1000, 500, 32, 32)).toEqual({ x: 0, y: 8, w: 32, h: 16, mode: 'reduce' })
  })

  it('reduces on the binding axis, not on both independently', () => {
    // 40 wide against 32 binds; the height follows the same ratio rather than
    // being squashed to fit separately.
    const r = fitRect(40, 10, 32, 32)
    expect([r.w, r.h]).toEqual([32, 8])
    expect(Math.abs(r.w / r.h - 4)).toBeLessThan(0.001)
  })

  it('never places the image outside the canvas', () => {
    for (const [sw, sh] of [[1000, 3], [3, 1000], [999, 500], [1, 1], [255, 256]] as const) {
      const r = fitRect(sw, sh, 32, 32)
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(32)
      expect(r.y + r.h).toBeLessThanOrEqual(32)
      expect(r.w).toBeGreaterThanOrEqual(1)
      expect(r.h).toBeGreaterThanOrEqual(1)
    }
  })

  it('enlarges by a whole number, and only by a whole number', () => {
    expect(fitRect(16, 16, 32, 32)).toEqual({ x: 0, y: 0, w: 32, h: 32, mode: 'enlarge' })
    // 32/13 is 2.46. Drawing at 2.46× would give some source rows three
    // destination rows and their neighbours two — §9.2.
    expect(fitRect(13, 13, 32, 32)).toEqual({ x: 3, y: 3, w: 26, h: 26, mode: 'enlarge' })
  })

  it('leaves an image that cannot be doubled at 1:1, centred', () => {
    expect(fitRect(20, 10, 32, 32)).toEqual({ x: 6, y: 11, w: 20, h: 10, mode: 'exact' })
  })

  it('calls the same size exact rather than enlarging by 1', () => {
    expect(fitRect(32, 32, 32, 32).mode).toBe('exact')
  })

  /** The odd-pixel bias is A1's, reused rather than reinvented. */
  it('biases an odd remainder the same way a canvas resize does', () => {
    const r = fitRect(31, 31, 32, 32)
    expect([r.x, r.y]).toEqual([0, 0])
    expect(r.x + r.w).toBe(31) // the spare pixel is bottom-right, as in resize.ts
  })

  it('is total on a degenerate source rather than throwing', () => {
    expect(fitRect(0, 0, 16, 16).w).toBeGreaterThanOrEqual(1)
  })
})

describe('resample — enlarging', () => {
  it('takes nearest neighbour, inventing no colours', () => {
    const src = img(2, 1, [[255, 0, 0, 255], [0, 0, 255, 255]])
    const out = resample(src, 4, 2)
    expect(at(out, 0, 0)).toEqual([255, 0, 0, 255])
    expect(at(out, 1, 0)).toEqual([255, 0, 0, 255])
    expect(at(out, 2, 0)).toEqual([0, 0, 255, 255])
    expect(at(out, 3, 1)).toEqual([0, 0, 255, 255])
    // The whole point: no third colour appeared between the two.
    const seen = new Set<string>()
    for (let i = 0; i < out.data.length; i += 4) {
      seen.add(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`)
    }
    expect(seen).toEqual(new Set(['255,0,0', '0,0,255']))
  })

  it('leaves a 1:1 resample byte-identical', () => {
    const src = img(2, 2, [
      [1, 2, 3, 255], [4, 5, 6, 128], [7, 8, 9, 0], [10, 11, 12, 255],
    ])
    expect(Array.from(resample(src, 2, 2).data)).toEqual(Array.from(src.data))
  })
})

describe('resample — reducing', () => {
  it('averages the box rather than sampling one pixel out of it', () => {
    // Four cells, one of them white. Nearest neighbour would return whichever
    // corner the grid landed on — 0 or 255. The average is the honest answer.
    const src = img(2, 2, [
      [255, 255, 255, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255],
    ])
    expect(at(resample(src, 1, 1), 0, 0)).toEqual([64, 64, 64, 255])
  })

  it('counts every source pixel exactly once', () => {
    // 6→4 is not a whole ratio, so the boxes are uneven. If any source pixel
    // were counted twice or dropped, the mean of the output would drift off the
    // mean of the input.
    const src = img(6, 1, [
      [0, 0, 0, 255], [60, 0, 0, 255], [120, 0, 0, 255],
      [180, 0, 0, 255], [240, 0, 0, 255], [255, 0, 0, 255],
    ])
    const out = resample(src, 4, 1)
    expect(out.w).toBe(4)
    for (let x = 0; x < 4; x++) expect(at(out, x, 0)[3]).toBe(255)
    // Monotonic in, monotonic out — no box picked up a pixel from the far end.
    const reds = [0, 1, 2, 3].map((x) => at(out, x, 0)[0]!)
    expect(reds).toEqual([...reds].sort((a, b) => a - b))
  })

  /**
   * The halo. Averaging RGB without weighting by alpha lets the black,
   * fully-transparent half contribute its colour to the visible half — the
   * standard artefact of a naïve resizer, and one multiply to avoid.
   */
  it('premultiplies, so a transparent black neighbour does not darken red', () => {
    const src = img(2, 1, [[255, 0, 0, 255], [0, 0, 0, 0]])
    const out = at(resample(src, 1, 1), 0, 0)
    expect([out[0], out[1], out[2]]).toEqual([255, 0, 0])
    expect(out[3]).toBe(128) // half covered, so half opaque — that part is real
  })

  it('leaves a wholly transparent box transparent, and asks nothing about its colour', () => {
    const src = img(2, 1, [[9, 9, 9, 0], [200, 200, 200, 0]])
    expect(at(resample(src, 1, 1), 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('averages a flat colour to itself', () => {
    expect(at(resample(solid(9, 9, [17, 34, 51, 255]), 4, 4), 2, 2))
      .toEqual([17, 34, 51, 255])
  })
})

describe('fitImage', () => {
  it('places the image where fitRect says, and leaves the rest transparent', () => {
    const { rgba, at: place } = fitImage(solid(1000, 500, [10, 20, 30, 255]), 32, 32)
    expect(place).toEqual({ x: 0, y: 8, w: 32, h: 16, mode: 'reduce' })
    expect(rgba.w).toBe(32)
    expect(rgba.h).toBe(32)
    expect(at(rgba, 0, 0)).toEqual([0, 0, 0, 0]) // above the band
    expect(at(rgba, 16, 8)).toEqual([10, 20, 30, 255]) // first placed row
    expect(at(rgba, 16, 23)).toEqual([10, 20, 30, 255]) // last placed row
    expect(at(rgba, 16, 24)).toEqual([0, 0, 0, 0]) // below it
  })

  it('fills the canvas exactly when the image doubles into it', () => {
    const { rgba } = fitImage(solid(16, 16, [5, 5, 5, 255]), 32, 32)
    for (let i = 3; i < rgba.data.length; i += 4) expect(rgba.data[i]).toBe(255)
  })

  it('never writes outside the field', () => {
    const { rgba } = fitImage(solid(7, 3, [1, 1, 1, 255]), 16, 16)
    expect(rgba.data.length).toBe(16 * 16 * 4)
  })

  it('is deterministic — the same input twice gives identical bytes', () => {
    const src = img(5, 3, Array.from({ length: 15 }, (_, i) =>
      [i * 17 % 256, i * 29 % 256, i * 41 % 256, i % 4 === 0 ? 0 : 255] as [number, number, number, number]))
    expect(Array.from(fitImage(src, 32, 32).rgba.data))
      .toEqual(Array.from(fitImage(src, 32, 32).rgba.data))
  })
})
