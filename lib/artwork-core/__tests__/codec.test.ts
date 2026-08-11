import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  charToIndex,
  cloneDoc,
  decodeRows,
  encodeRows,
  indexToChar,
  parseDoc,
  serializeDoc,
} from '../codec'
import { MAX_PALETTE } from '../schema'
import { arbDoc, docOf, toJson } from './helpers'

const PAL = [{ c: 'transparent' }, { c: '#2d1b00' }, { c: '#f4c430' }]

describe('character encoding', () => {
  it('round-trips every index in 0..35', () => {
    for (let i = 0; i < MAX_PALETTE; i++) {
      expect(charToIndex(indexToChar(i))).toBe(i)
    }
  })

  it('maps the documented boundaries', () => {
    expect(indexToChar(0)).toBe('.')
    expect(indexToChar(1)).toBe('1')
    expect(indexToChar(9)).toBe('9')
    expect(indexToChar(10)).toBe('a')
    expect(indexToChar(35)).toBe('z')
  })

  it('rejects unrecognised characters with -1, never a throw', () => {
    // '0' is deliberately NOT valid — only '.' means transparent (01 §2).
    for (const ch of ['0', 'A', 'Z', '!', '', ' ', '🙂', '-']) {
      expect(charToIndex(ch)).toBe(-1)
    }
  })

  it('throws RangeError outside 0..35', () => {
    expect(() => indexToChar(MAX_PALETTE)).toThrow(RangeError)
    expect(() => indexToChar(-1)).toThrow(RangeError)
  })
})

describe('decodeRows', () => {
  it('decodes row-major into a flat array', () => {
    const r = decodeRows(['1212', '2121'], 4, 2)
    expect(r.ok).toBe(true)
    if (r.ok) expect(Array.from(r.value)).toEqual([1, 2, 1, 2, 2, 1, 2, 1])
  })

  it('returns row_count when the row count is wrong', () => {
    const r = decodeRows(['....'], 4, 2)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('row_count')
  })

  it('returns row_width when a row is the wrong length', () => {
    const r = decodeRows(['....', '.....'], 4, 2)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('row_width')
      expect(r.error.message).toContain('row 1')
    }
  })

  it('returns bad_char with the offending position', () => {
    const r = decodeRows(['..Q.'], 4, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('bad_char')
      expect(r.error.message).toContain('column 2')
    }
  })

  it('encodeRows inverts decodeRows', () => {
    const rows = ['1212', '2121', '....']
    const d = decodeRows(rows, 4, 3)
    expect(d.ok).toBe(true)
    if (d.ok) expect(encodeRows(d.value, 4, 3)).toEqual(rows)
  })
})

describe('parseDoc error codes', () => {
  const base = () => JSON.parse(toJson(docOf(['12', '21'], PAL)))

  it('json', () => {
    const r = parseDoc('{ not json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('json')
  })

  it('future_version', () => {
    const r = parseDoc({ ...base(), v: 99 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('future_version')
  })

  it('schema', () => {
    const r = parseDoc({ ...base(), w: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('schema')
  })

  it('palette_zero', () => {
    const r = parseDoc({ ...base(), palette: [{ c: '#000000' }, { c: '#ffffff' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('palette_zero')
  })

  it('row_count, with a path', () => {
    const d = base()
    d.frames[0].layers[0].px = ['12']
    const r = parseDoc(d)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('row_count')
      expect(r.error.path).toContain('frames.0.layers.0')
    }
  })

  it('row_width', () => {
    const d = base()
    d.frames[0].layers[0].px = ['12', '211']
    const r = parseDoc(d)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('row_width')
  })

  it('bad_char', () => {
    const d = base()
    d.frames[0].layers[0].px = ['1Q', '21']
    const r = parseDoc(d)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('bad_char')
  })

  it('palette_range', () => {
    const d = base()
    d.frames[0].layers[0].px = ['19', '21'] // index 9, palette has 3
    const r = parseDoc(d)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('palette_range')
  })

  it('rejects uppercase and short-form colours', () => {
    expect(parseDoc({ ...base(), palette: [{ c: 'transparent' }, { c: '#FFFFFF' }] }).ok).toBe(false)
    expect(parseDoc({ ...base(), palette: [{ c: 'transparent' }, { c: '#fff' }] }).ok).toBe(false)
  })
})

describe('parseDoc never throws', () => {
  it('survives arbitrary JSON values', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(() => parseDoc(v)).not.toThrow()
      }),
      { numRuns: 1000 },
    )
  })

  it('survives hostile shapes', () => {
    const hostile: unknown[] = [
      null,
      undefined,
      0,
      '',
      [],
      { __proto__: { polluted: true } },
      { v: 1, w: Infinity },
      { v: 1, w: NaN },
      '\ud800', // lone surrogate
      { v: 1, frames: [{ layers: [{ px: [1, 2, 3] }] }] },
    ]
    for (const h of hostile) expect(() => parseDoc(h)).not.toThrow()
  })
})

describe('round trip', () => {
  it('parseDoc(serializeDoc(d)) deep-equals d', () => {
    fc.assert(
      fc.property(arbDoc(), (d) => {
        const r = parseDoc(serializeDoc(d))
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.value).toEqual(d)
      }),
      { numRuns: 200 },
    )
  })

  it('serializeDoc(parseDoc(s)) is byte-identical for canonical s', () => {
    fc.assert(
      fc.property(arbDoc(), (d) => {
        const s = toJson(d)
        const r = parseDoc(s)
        expect(r.ok).toBe(true)
        if (r.ok) expect(serializeDoc(r.value)).toBe(s)
      }),
      { numRuns: 200 },
    )
  })

  it('puts one pixel row per line, so a one-pixel change is a one-line diff', () => {
    const s = serializeDoc(docOf(['12', '21'], PAL))
    expect(s).toContain('"12"')
    expect(s.split('\n').filter((l) => l.trim().startsWith('"1'))).toHaveLength(1)
  })
})

describe('cloneDoc', () => {
  it('does not share pixel buffers', () => {
    const a = docOf(['12', '21'], PAL)
    const b = cloneDoc(a)
    expect(b.frames[0]!.layers[0]!.px).not.toBe(a.frames[0]!.layers[0]!.px)
    expect(b.palette).not.toBe(a.palette)
  })

  it('mutating the clone leaves the original untouched', () => {
    const a = docOf(['12', '21'], PAL)
    const before = Array.from(a.frames[0]!.layers[0]!.px)
    const b = cloneDoc(a)
    b.frames[0]!.layers[0]!.px[0] = 2
    b.palette.push({ c: '#123456' })
    expect(Array.from(a.frames[0]!.layers[0]!.px)).toEqual(before)
    expect(a.palette).toHaveLength(3)
  })
})
