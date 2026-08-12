import { describe, expect, it } from 'vitest'
import { mirror, mirrored } from '../symmetry'

describe('mirror', () => {
  it('is an involution, at every size and index', () => {
    // Exhaustive rather than sampled — the domain is small and this is the
    // property everything else rests on. docs/specs/16-settings.md §7.
    const broken: Array<[number, number]> = []
    for (let n = 1; n <= 64; n++) {
      for (let v = 0; v < n; v++) if (mirror(mirror(v, n), n) !== v) broken.push([n, v])
    }
    expect(broken).toEqual([])
  })

  it('never leaves the canvas', () => {
    const out: Array<[number, number]> = []
    for (let n = 1; n <= 64; n++) {
      for (let v = 0; v < n; v++) {
        const m = mirror(v, n)
        if (m < 0 || m >= n) out.push([n, v])
      }
    }
    expect(out).toEqual([])
  })

  it('maps the centre of an odd axis to itself', () => {
    for (const n of [1, 3, 5, 15, 31, 63]) expect(mirror((n - 1) / 2, n)).toBe((n - 1) / 2)
  })

  it('has no fixed point on an even axis', () => {
    for (const n of [2, 4, 16, 64]) {
      for (let v = 0; v < n; v++) expect(mirror(v, n)).not.toBe(v)
    }
  })
})

describe('mirrored', () => {
  it('is the identity when symmetry is off', () => {
    expect(mirrored(2, 3, 8, 8, 'off')).toEqual([[2, 3]])
  })

  it('mirrors across the vertical centre line for H', () => {
    expect(mirrored(1, 2, 8, 8, 'h')).toEqual([[1, 2], [6, 2]])
  })

  it('mirrors across the horizontal centre line for V', () => {
    expect(mirrored(1, 2, 8, 8, 'v')).toEqual([[1, 2], [1, 5]])
  })

  it('reaches all four quadrants for Both', () => {
    expect(mirrored(1, 2, 8, 8, 'both')).toEqual([[1, 2], [6, 2], [1, 5], [6, 5]])
  })

  it('dedupes on the centre column of an odd canvas', () => {
    // 5 wide: column 2 is its own mirror, so H must not paint it twice.
    expect(mirrored(2, 1, 5, 5, 'h')).toEqual([[2, 1]])
    expect(mirrored(2, 2, 5, 5, 'both')).toEqual([[2, 2]])
  })

  it('dedupes on the centre row too', () => {
    expect(mirrored(1, 2, 5, 5, 'v')).toEqual([[1, 2]])
    // Centre row, off-centre column: two cells, not four.
    expect(mirrored(0, 2, 5, 5, 'both')).toEqual([[0, 2], [4, 2]])
  })

  it('never returns more than four cells, or fewer than one', () => {
    for (const mode of ['off', 'h', 'v', 'both'] as const) {
      for (const [w, h] of [[1, 1], [5, 5], [8, 8], [16, 9], [3, 12]] as const) {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const cells = mirrored(x, y, w, h, mode)
            expect(cells.length).toBeGreaterThanOrEqual(1)
            expect(cells.length).toBeLessThanOrEqual(4)
            for (const [cx, cy] of cells) {
              expect(cx).toBeGreaterThanOrEqual(0)
              expect(cx).toBeLessThan(w)
              expect(cy).toBeGreaterThanOrEqual(0)
              expect(cy).toBeLessThan(h)
            }
          }
        }
      }
    }
  })

  it('is a no-op on a 1x1 canvas whatever the mode — S-E3', () => {
    for (const mode of ['off', 'h', 'v', 'both'] as const) {
      expect(mirrored(0, 0, 1, 1, mode)).toEqual([[0, 0]])
    }
  })

  it('always includes the cell that was actually painted', () => {
    for (const mode of ['off', 'h', 'v', 'both'] as const) {
      const cells = mirrored(3, 1, 9, 7, mode)
      expect(cells).toContainEqual([3, 1])
    }
  })
})
