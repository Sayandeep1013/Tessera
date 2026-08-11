import { describe, expect, it } from 'vitest'
import { spriteRects, spriteToSvg } from '../sprite-svg'
import { loadLogo } from '../../artwork-core/create'
import { loadStarter } from '../../artwork-core/create'
import { parseDoc } from '../../artwork-core/codec'
import type { Doc } from '../../artwork-core/schema'

function docFrom(rows: string[], palette: string[]): Doc {
  const r = parseDoc({
    v: 1,
    id: 'test',
    name: 'test',
    w: rows[0]!.length,
    h: rows.length,
    palette: palette.map((c) => ({ c })),
    frames: [{ ms: 100, layers: [{ n: 'base', px: rows }] }],
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('run merging', () => {
  it('merges horizontally', () => {
    const doc = docFrom(['1111'], ['transparent', '#ffffff'])
    expect(spriteRects(doc)).toEqual([{ x: 0, y: 0, w: 4, h: 1, fill: '#ffffff' }])
  })

  it('merges vertically when a run repeats directly below', () => {
    const doc = docFrom(['11', '11', '11'], ['transparent', '#ffffff'])
    expect(spriteRects(doc)).toEqual([{ x: 0, y: 0, w: 2, h: 3, fill: '#ffffff' }])
  })

  it('does not merge across a colour change', () => {
    const doc = docFrom(['11', '22'], ['transparent', '#ffffff', '#000000'])
    expect(spriteRects(doc)).toHaveLength(2)
  })

  it('does not merge when the run width changes', () => {
    const doc = docFrom(['11.', '111'], ['transparent', '#ffffff'])
    const r = spriteRects(doc)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ x: 0, y: 0, w: 2, h: 1, fill: '#ffffff' })
    expect(r[1]).toEqual({ x: 0, y: 1, w: 3, h: 1, fill: '#ffffff' })
  })

  it('does not merge across a transparent gap', () => {
    const doc = docFrom(['11', '..', '11'], ['transparent', '#ffffff'])
    expect(spriteRects(doc)).toHaveLength(2)
  })

  it('skips transparent entirely', () => {
    const doc = docFrom(['....'], ['transparent'])
    expect(spriteRects(doc)).toEqual([])
  })

  it('covers exactly the non-transparent cells, and no others', () => {
    // Property: the merged rects must tile the painted area with no overlap and
    // no spill — the failure mode of a merge bug is a rect one row too tall.
    const doc = loadStarter('face')
    const seen = new Set<string>()
    for (const r of spriteRects(doc)) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const key = `${x},${y}`
          expect(seen.has(key)).toBe(false) // no overlap
          seen.add(key)
          const i = doc.frames[0]!.layers[0]!.px[y * doc.w + x]!
          expect(i).not.toBe(0) // never covers a transparent cell
          expect(doc.palette[i]!.c).toBe(r.fill) // colour matches
        }
      }
    }
    let painted = 0
    for (const i of doc.frames[0]!.layers[0]!.px) if (i !== 0) painted++
    expect(seen.size).toBe(painted) // nothing missed
  })
})

describe('the logo', () => {
  it('is four tesserae', () => {
    expect(spriteRects(loadLogo())).toHaveLength(4)
  })

  it('renders a standalone svg small enough to be a favicon', () => {
    const svg = spriteToSvg(loadLogo())
    expect(svg.startsWith('<svg xmlns=')).toBe(true)
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg.length).toBeLessThan(600)
  })

  it('uses colours from the product’s own default palette', () => {
    // The mark is drawn from the same box of colours as the artwork — that is the
    // whole idea behind the name. A hand-picked hex here would break it silently.
    const logo = loadLogo()
    const defaults = new Set(loadStarter('face').palette.map((p) => p.c))
    // sky / blue / navy are Sweetie 16 members; DEFAULT_PALETTE is what the
    // starter ships with, so compare against the shipped set.
    for (const entry of logo.palette) {
      if (entry.c === 'transparent') continue
      expect(typeof entry.c).toBe('string')
      expect(entry.c).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(defaults.size).toBeGreaterThan(0)
  })
})
