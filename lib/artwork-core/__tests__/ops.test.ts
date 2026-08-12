import { describe, expect, it } from 'vitest'
import { applyOps, floodFillPoints, linePoints, rectPoints, type Op } from '../ops'
import { encodeRows } from '../codec'
import { MAX_PALETTE, type PaletteEntry } from '../schema'
import { docLayers, docOf } from './helpers'

const PAL: PaletteEntry[] = [{ c: 'transparent' }, { c: '#2d1b00' }, { c: '#f4c430' }]
const blank4 = () => docOf(['....', '....', '....', '....'], PAL)

/** Convenience: apply and return the rendered rows, failing loudly on error. */
function rows(doc: ReturnType<typeof blank4>, ops: Op[]): string[] {
  const r = applyOps(doc, ops)
  if (!r.ok) throw new Error(`unexpected op failure: ${r.error.code} ${r.error.message}`)
  return encodeRows(r.value.frames[0]!.layers[0]!.px, r.value.w, r.value.h)
}

describe('geometry primitives', () => {
  it('linePoints draws horizontals, verticals and diagonals', () => {
    expect(linePoints(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]])
    expect(linePoints(0, 0, 0, 3)).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]])
    expect(linePoints(0, 0, 3, 3)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]])
    expect(linePoints(3, 0, 0, 3)).toEqual([[3, 0], [2, 1], [1, 2], [0, 3]])
  })

  it('linePoints includes both endpoints and handles a single point', () => {
    expect(linePoints(2, 2, 2, 2)).toEqual([[2, 2]])
  })

  it('linePoints covers the same cells in either direction', () => {
    const key = (p: Array<[number, number]>) => p.map((c) => c.join(',')).sort().join(' ')
    expect(key(linePoints(0, 0, 5, 2))).toBe(key(linePoints(5, 2, 0, 0)))
  })

  it('rectPoints distinguishes outline from fill', () => {
    expect(rectPoints(0, 0, 3, 3, true)).toHaveLength(9)
    expect(rectPoints(0, 0, 3, 3, false)).toHaveLength(8) // 9 minus the centre
    expect(rectPoints(0, 0, 1, 1, false)).toEqual([[0, 0]])
  })

  it('floodFillPoints respects enclosure', () => {
    // A ring of 1s around a single transparent centre.
    const d = docOf(['111', '1.1', '111'], PAL)
    const px = d.frames[0]!.layers[0]!.px
    expect(floodFillPoints(px, 3, 3, 1, 1)).toEqual([[1, 1]])
  })

  it('floodFillPoints fills the whole canvas when uniform', () => {
    const d = blank4()
    expect(floodFillPoints(d.frames[0]!.layers[0]!.px, 4, 4, 0, 0)).toHaveLength(16)
  })

  it('floodFillPoints is 4-connected, not 8-connected', () => {
    // Diagonal neighbours of (0,0) must not be reached through the corner.
    const d = docOf(['.1', '1.'], PAL)
    const px = d.frames[0]!.layers[0]!.px
    expect(floodFillPoints(px, 2, 2, 0, 0)).toEqual([[0, 0]])
  })
})

describe('applyOps — happy paths', () => {
  it('set_pixels', () => {
    expect(rows(blank4(), [{ op: 'set_pixels', px: [[0, 0, 1], [3, 3, 2]] }]))
      .toEqual(['1...', '....', '....', '...2'])
  })

  it('draw_line', () => {
    expect(rows(blank4(), [{ op: 'draw_line', x1: 0, y1: 0, x2: 3, y2: 0, i: 1 }]))
      .toEqual(['1111', '....', '....', '....'])
  })

  it('draw_rect outline and filled', () => {
    expect(rows(blank4(), [{ op: 'draw_rect', x: 0, y: 0, w: 3, h: 3, i: 1, fill: false }]))
      .toEqual(['111.', '1.1.', '111.', '....'])
    expect(rows(blank4(), [{ op: 'draw_rect', x: 0, y: 0, w: 2, h: 2, i: 2, fill: true }]))
      .toEqual(['22..', '22..', '....', '....'])
  })

  it('flood_fill', () => {
    expect(rows(blank4(), [{ op: 'flood_fill', x: 0, y: 0, i: 2 }]))
      .toEqual(['2222', '2222', '2222', '2222'])
  })

  it('replace_color', () => {
    const d = docOf(['11', '22'], PAL)
    const r = applyOps(d, [{ op: 'replace_color', from: 1, to: 2 }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(encodeRows(r.value.frames[0]!.layers[0]!.px, 2, 2)).toEqual(['22', '22'])
  })

  it('add_palette_color makes the new index usable in the same call', () => {
    const r = applyOps(blank4(), [
      { op: 'add_palette_color', c: '#ff0000' }, // becomes index 3
      { op: 'set_pixels', px: [[0, 0, 3]] },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.palette).toHaveLength(4)
      expect(r.value.palette[3]!.c).toBe('#ff0000')
      expect(r.value.frames[0]!.layers[0]!.px[0]).toBe(3)
    }
  })

  it('ops apply in order', () => {
    expect(rows(blank4(), [
      { op: 'flood_fill', x: 0, y: 0, i: 1 },
      { op: 'set_pixels', px: [[0, 0, 2]] },
    ])[0]).toBe('2111')
  })
})

describe('applyOps — rejections', () => {
  const cases: Array<[string, Op, string]> = [
    ['set_pixels out of bounds', { op: 'set_pixels', px: [[9, 0, 1]] }, 'out_of_bounds'],
    ['negative coordinate', { op: 'set_pixels', px: [[-1, 0, 1]] }, 'out_of_bounds'],
    ['draw_line leaving the canvas', { op: 'draw_line', x1: 0, y1: 0, x2: 9, y2: 0, i: 1 }, 'out_of_bounds'],
    ['draw_rect overflowing', { op: 'draw_rect', x: 2, y: 2, w: 9, h: 9, i: 1, fill: true }, 'out_of_bounds'],
    ['flood_fill outside', { op: 'flood_fill', x: 9, y: 9, i: 1 }, 'out_of_bounds'],
    ['unknown palette index', { op: 'set_pixels', px: [[0, 0, 7]] }, 'palette_range'],
    ['replace_color no-op', { op: 'replace_color', from: 1, to: 1 }, 'noop'],
    ['bad colour string', { op: 'add_palette_color', c: '#FFF' }, 'bad_color'],
  ]

  for (const [name, op, code] of cases) {
    it(`rejects ${name} with ${code}`, () => {
      const r = applyOps(blank4(), [op])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe(code)
    })
  }

  it('rejects a missing frame', () => {
    const r = applyOps(blank4(), [{ op: 'set_pixels', px: [[0, 0, 1]] }], 5)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('no_frame')
  })

  it('reports which op failed', () => {
    const r = applyOps(blank4(), [
      { op: 'set_pixels', px: [[0, 0, 1]] },
      { op: 'set_pixels', px: [[9, 9, 1]] },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.opIndex).toBe(1)
  })

  it('rejects add_palette_color at the 36-entry cap', () => {
    const full: PaletteEntry[] = [
      { c: 'transparent' },
      ...Array.from({ length: MAX_PALETTE - 1 }, (_, n) => ({
        c: '#' + n.toString(16).padStart(6, '0'),
      })),
    ]
    const d = docOf(['..', '..'], full)
    const r = applyOps(d, [{ op: 'add_palette_color', c: '#abcdef' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('palette_full')
  })
})

describe('applyOps — immutability and atomicity', () => {
  it('never mutates its input', () => {
    const d = blank4()
    const before = Array.from(d.frames[0]!.layers[0]!.px)
    applyOps(d, [{ op: 'flood_fill', x: 0, y: 0, i: 1 }])
    expect(Array.from(d.frames[0]!.layers[0]!.px)).toEqual(before)
  })

  it('leaves the input untouched when a later op fails', () => {
    const d = blank4()
    const before = Array.from(d.frames[0]!.layers[0]!.px)
    const r = applyOps(d, [
      { op: 'flood_fill', x: 0, y: 0, i: 1 }, // would succeed
      { op: 'set_pixels', px: [[99, 99, 1]] }, // fails
    ])
    expect(r.ok).toBe(false)
    expect(Array.from(d.frames[0]!.layers[0]!.px)).toEqual(before)
  })

  it('returns a new document rather than the same reference', () => {
    const d = blank4()
    const r = applyOps(d, [{ op: 'set_pixels', px: [[0, 0, 1]] }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).not.toBe(d)
  })

  it('stamps updatedAt', () => {
    const d = blank4()
    const r = applyOps(d, [{ op: 'set_pixels', px: [[0, 0, 1]] }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.meta.updatedAt).not.toBe(d.meta.updatedAt)
  })
})

// ─── layers. See docs/specs/14-layers.md §8.4. ───────────────────────────────

describe('applyOps targets one layer', () => {
  const twoLayer = () =>
    docLayers(
      [
        { n: 'base', rows: ['1111', '1111', '1111', '1111'] },
        { n: 'over', rows: ['....', '....', '....', '....'] },
      ],
      PAL,
    )

  it('writes to the requested layer and leaves the others byte-identical', () => {
    const d = twoLayer()
    const r = applyOps(d, [{ op: 'set_pixels', px: [[0, 0, 2]] }], 0, 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Array.from(r.value.frames[0]!.layers[0]!.px)).toEqual(
      Array.from(d.frames[0]!.layers[0]!.px),
    )
    expect(r.value.frames[0]!.layers[1]!.px[0]).toBe(2)
  })

  it('defaults to layer 0', () => {
    const r = applyOps(twoLayer(), [{ op: 'set_pixels', px: [[0, 0, 2]] }])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.frames[0]!.layers[0]!.px[0]).toBe(2)
      expect(r.value.frames[0]!.layers[1]!.px[0]).toBe(0)
    }
  })

  it('fails with no_layer for a missing layer, mutating nothing (L-E4)', () => {
    const d = twoLayer()
    const before = Array.from(d.frames[0]!.layers[0]!.px)
    const r = applyOps(d, [{ op: 'set_pixels', px: [[0, 0, 2]] }], 0, 5)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('no_layer')
    expect(Array.from(d.frames[0]!.layers[0]!.px)).toEqual(before)
  })

  it('flood fill is bounded by its own layer, not by what is beneath it', () => {
    // Layer 0 is a solid block that would stop nothing; layer 1 has a wall of 1s
    // down the middle. Filling the left half of layer 1 must not cross it, and
    // must not be influenced by layer 0 at all.
    const d = docLayers(
      [
        { n: 'base', rows: ['2222', '2222', '2222', '2222'] },
        { n: 'over', rows: ['..1.', '..1.', '..1.', '..1.'] },
      ],
      PAL,
    )
    const r = applyOps(d, [{ op: 'flood_fill', x: 0, y: 0, i: 2 }], 0, 1)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(encodeRows(r.value.frames[0]!.layers[1]!.px, 4, 4)).toEqual([
        '221.', '221.', '221.', '221.',
      ])
      expect(encodeRows(r.value.frames[0]!.layers[0]!.px, 4, 4)).toEqual([
        '2222', '2222', '2222', '2222',
      ])
    }
  })

  it('replace_color only touches the addressed layer', () => {
    const d = twoLayer()
    const r = applyOps(d, [{ op: 'replace_color', from: 1, to: 2 }], 0, 1)
    expect(r.ok).toBe(true)
    // Layer 1 has no 1s, so nothing changes anywhere — layer 0's 1s are untouched.
    if (r.ok) {
      expect(encodeRows(r.value.frames[0]!.layers[0]!.px, 4, 4)).toEqual([
        '1111', '1111', '1111', '1111',
      ])
    }
  })
})
