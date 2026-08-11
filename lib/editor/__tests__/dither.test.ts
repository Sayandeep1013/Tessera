import { describe, expect, it } from 'vitest'
import { DITHER_MODES, densityFor, ditherPasses, gradientCells } from '../dither'

describe('ordered dither', () => {
  it('solid paints every cell', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) expect(ditherPasses(x, y, 1)).toBe(true)
    }
  })

  it('zero density paints nothing', () => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) expect(ditherPasses(x, y, 0)).toBe(false)
    }
  })

  it('hits the requested density across a 4x4 tile', () => {
    for (const { density } of DITHER_MODES) {
      let on = 0
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) if (ditherPasses(x, y, density)) on++
      }
      expect(on / 16).toBe(density)
    }
  })

  it('is anchored to document coordinates, so it tiles across strokes', () => {
    // The reason ordered beats random: painting the same cell twice, or two
    // strokes meeting, must agree. Offsetting by the tile size changes nothing.
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(ditherPasses(x, y, 0.5)).toBe(ditherPasses(x + 4, y, 0.5))
        expect(ditherPasses(x, y, 0.5)).toBe(ditherPasses(x, y + 8, 0.5))
      }
    }
  })

  it('handles negative coordinates without falling off the matrix', () => {
    expect(() => ditherPasses(-1, -1, 0.5)).not.toThrow()
    expect(ditherPasses(-4, -4, 0.5)).toBe(ditherPasses(0, 0, 0.5))
  })

  it('densityFor falls back to solid for an unknown mode', () => {
    expect(densityFor('solid')).toBe(1)
    expect(densityFor('nonsense' as never)).toBe(1)
  })
})

describe('dithered gradient', () => {
  it('is dense at the start and empty at the end', () => {
    const cells = gradientCells(0, 0, 15, 0, 16, 1)
    const xs = cells.map(([x]) => x)
    const nearStart = xs.filter((x) => x < 4).length
    const nearEnd = xs.filter((x) => x >= 12).length
    expect(nearStart).toBeGreaterThan(nearEnd)
  })

  it('never leaves the canvas', () => {
    for (const [x, y] of gradientCells(-5, -5, 40, 40, 16, 16)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(16)
      expect(y).toBeLessThan(16)
    }
  })

  it('a zero-length drag is one cell, not a division by zero', () => {
    expect(gradientCells(3, 3, 3, 3, 16, 16)).toEqual([[3, 3]])
  })

  it('a zero-length drag outside the canvas produces nothing', () => {
    expect(gradientCells(99, 99, 99, 99, 16, 16)).toEqual([])
  })

  it('produces no duplicate cells', () => {
    const cells = gradientCells(0, 0, 15, 15, 16, 16)
    const keys = new Set(cells.map(([x, y]) => `${x},${y}`))
    expect(keys.size).toBe(cells.length)
  })

  it('works in every drag direction', () => {
    for (const [x1, y1, x2, y2] of [
      [0, 0, 15, 15], [15, 15, 0, 0], [15, 0, 0, 15], [0, 15, 15, 0],
    ]) {
      expect(gradientCells(x1!, y1!, x2!, y2!, 16, 16).length).toBeGreaterThan(0)
    }
  })
})
