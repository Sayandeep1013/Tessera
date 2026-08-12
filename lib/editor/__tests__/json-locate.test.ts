import { describe, expect, it } from 'vitest'
import { locate, parsePath, pxRowRanges } from '../json-locate'
import { parseDoc, serializeDoc } from '../../artwork-core/codec'
import { createDoc } from '../../artwork-core/create'

const doc = () => createDoc({ id: 'c', w: 4, h: 3, name: 'grid', now: '2026-08-12T00:00:00.000Z' })
const text = () => serializeDoc(doc())

/** What the mark would actually cover. The clearest way to assert a range. */
const at = (t: string, r: { from: number; to: number } | null) =>
  r === null ? null : t.slice(r.from, r.to)

describe('parsePath — two grammars meet in DocError.path', () => {
  it('reads zod dot paths, indices included', () => {
    expect(parsePath('frames.0.layers.0.px')).toEqual([
      { key: 'frames' }, { index: 0 }, { key: 'layers' }, { index: 0 }, { key: 'px' },
    ])
  })

  it("reads codec's bracket suffixes", () => {
    expect(parsePath('px[3][7]')).toEqual([{ key: 'px' }, { index: 3 }, { index: 7 }])
  })

  it('reads the two mixed, which is what actually arrives', () => {
    expect(parsePath('frames.0.layers.1.px[2]')).toEqual([
      { key: 'frames' }, { index: 0 }, { key: 'layers' }, { index: 1 },
      { key: 'px' }, { index: 2 },
    ])
  })

  it('is empty for an empty path, so the caller falls back to a banner', () => {
    expect(parsePath('')).toEqual([])
  })
})

describe('locate — spec §3', () => {
  it('marks a top-level value', () => {
    const t = text()
    expect(at(t, locate(t, 'w'))).toBe('4')
    expect(at(t, locate(t, 'v'))).toBe('1')
  })

  it('marks a string without its quotes', () => {
    const t = text()
    expect(at(t, locate(t, 'name'))).toBe('grid')
  })

  it('marks a palette entry', () => {
    const t = text()
    expect(at(t, locate(t, 'palette.0.c'))).toBe('transparent')
    expect(at(t, locate(t, 'palette.1.c'))).toBe(doc().palette[1]!.c)
  })

  it('marks a whole pixel row', () => {
    const t = text()
    expect(at(t, locate(t, 'frames.0.layers.0.px[1]'))).toBe('....')
  })

  /** The one that earns the module: row 3, column 7 is a single pixel. */
  it('marks exactly one character for a row-and-column path', () => {
    const t = serializeDoc({ ...doc(), frames: doc().frames })
    const marked = locate(t, 'frames.0.layers.0.px[2][3]')
    expect(marked!.to - marked!.from).toBe(1)
    expect(at(t, marked)).toBe('.')
    // …and it is the character the row range says it is.
    const rows = pxRowRanges(t, 0, 0)
    expect(marked!.from).toBe(rows[2]!.from + 3)
  })

  it('marks an array when the path stops at one', () => {
    const t = text()
    expect(at(t, locate(t, 'frames.0.layers.0.px'))!.startsWith('[')).toBe(true)
  })

  it('returns null rather than throwing for a path that is not there', () => {
    const t = text()
    expect(locate(t, 'nope')).toBeNull()
    expect(locate(t, 'frames.9.layers.0.px')).toBeNull()
    expect(locate(t, 'palette.99.c')).toBeNull()
    expect(locate(t, '')).toBeNull()
  })

  it('returns null rather than throwing on text that is not JSON at all', () => {
    for (const bad of ['', '{', '{"a"', 'nonsense', '{"frames": [', '[[[[']) {
      expect(() => locate(bad, 'frames.0.layers.0.px[0]')).not.toThrow()
      expect(locate(bad, 'frames.0.layers.0.px[0]')).toBeNull()
    }
  })

  it('degrades a past-the-end character index to the whole row', () => {
    const t = text()
    const row = locate(t, 'frames.0.layers.0.px[0]')
    expect(locate(t, 'frames.0.layers.0.px[0][99]')).toEqual(row)
  })

  it('degrades to the whole string when it contains an escape', () => {
    const t = '{"name":"a\\"b","w":2}'
    expect(at(t, locate(t, 'name[1]'))).toBe('a\\"b')
  })

  it('is not confused by braces and brackets inside strings', () => {
    const t = '{"name":"}{][","w":7}'
    expect(at(t, locate(t, 'w'))).toBe('7')
  })

  it('does not care about whitespace, because the user is editing it', () => {
    const t = '{\n  "w"  :  9 ,\n  "h":10\n}'
    expect(at(t, locate(t, 'w'))).toBe('9')
    expect(at(t, locate(t, 'h'))).toBe('10')
  })
})

describe('locate — against paths parseDoc really produces', () => {
  /** Not invented paths: the ones the codec emits, taken from the codec. */
  const broken = (mutate: (o: Record<string, unknown>) => void) => {
    const o = JSON.parse(text()) as Record<string, unknown>
    mutate(o)
    const raw = JSON.stringify(o, null, 2)
    const r = parseDoc(raw)
    if (r.ok) throw new Error('expected this document to be invalid')
    return { raw, error: r.error }
  }

  it('marks the offending character for bad_char', () => {
    const { raw, error } = broken((o) => {
      const frames = o.frames as Array<{ layers: Array<{ px: string[] }> }>
      frames[0]!.layers[0]!.px[1] = '.@..'
    })
    expect(error.code).toBe('bad_char')
    const r = locate(raw, error.path!)
    expect(at(raw, r)).toBe('@')
  })

  it('marks the row for a row of the wrong width', () => {
    const { raw, error } = broken((o) => {
      const frames = o.frames as Array<{ layers: Array<{ px: string[] }> }>
      frames[0]!.layers[0]!.px[2] = '..'
    })
    expect(error.code).toBe('row_width')
    expect(at(raw, locate(raw, error.path!))).toBe('..')
  })

  it('marks the palette entry that is not transparent', () => {
    const { raw, error } = broken((o) => {
      ;(o.palette as Array<{ c: string }>)[0]!.c = '#ff0000'
    })
    expect(error.code).toBe('palette_zero')
    expect(at(raw, locate(raw, error.path!))).toBe('#ff0000')
  })

  it('marks the offending pixel for an out-of-range palette index', () => {
    const { raw, error } = broken((o) => {
      const frames = o.frames as Array<{ layers: Array<{ px: string[] }> }>
      frames[0]!.layers[0]!.px[1] = '..z.'
    })
    expect(error.code).toBe('palette_range')
    // The message names a pixel; so must the mark, or the two disagree.
    expect(error.message).toContain('(2, 1)')
    const r = locate(raw, error.path!)
    expect(r!.to - r!.from).toBe(1)
    expect(at(raw, r)).toBe('z')
  })

  it('marks the field zod complains about', () => {
    const { raw, error } = broken((o) => {
      o.w = 0
    })
    expect(error.path).toBe('w')
    expect(at(raw, locate(raw, error.path!))).toBe('0')
  })
})

describe('pxRowRanges', () => {
  it('gives one range per row, holding exactly that row', () => {
    const t = text()
    const rows = pxRowRanges(t, 0, 0)
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(t.slice(r.from, r.to)).toBe('....')
  })

  it('is empty for a layer that is not there, rather than throwing', () => {
    const t = text()
    expect(pxRowRanges(t, 0, 5)).toEqual([])
    expect(pxRowRanges(t, 3, 0)).toEqual([])
  })

  it('is empty for text mid-edit rather than guessing', () => {
    expect(pxRowRanges('{"frames":[{"layers":[{"px":[', 0, 0)).toEqual([])
    expect(pxRowRanges('not json', 0, 0)).toEqual([])
  })

  it('reads the second layer, not the first', () => {
    const base = doc()
    const two = {
      ...base,
      frames: [{
        ms: 100,
        layers: [
          base.frames[0]!.layers[0]!,
          { n: 'top', px: Uint8Array.from([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]) },
        ],
      }],
    }
    const t = serializeDoc(two)
    expect(t.slice(pxRowRanges(t, 0, 1)[0]!.from, pxRowRanges(t, 0, 1)[0]!.to)).toBe('1111')
    expect(t.slice(pxRowRanges(t, 0, 0)[0]!.from, pxRowRanges(t, 0, 0)[0]!.to)).toBe('....')
  })

  it('survives a 256-row document without re-walking it per row', () => {
    const big = serializeDoc(createDoc({ id: 'b', w: 256, h: 256 }))
    const rows = pxRowRanges(big, 0, 0)
    expect(rows).toHaveLength(256)
    expect(big.slice(rows[255]!.from, rows[255]!.to)).toHaveLength(256)
  })
})
