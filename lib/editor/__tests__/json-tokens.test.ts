import { describe, expect, it } from 'vitest'
import { pieces, tokenizeJson, type Token } from '../json-tokens'
import { serializeDoc } from '../../artwork-core/codec'
import { createDoc, DEFAULT_PALETTE, loadStarter } from '../../artwork-core/create'

const text = () => serializeDoc(createDoc({ id: 'c', w: 4, h: 3, name: 'grid' }))
const of = (t: string, tok: Token) => t.slice(tok.from, tok.to)
const kinds = (t: string, kind: string) => tokenizeJson(t).filter((x) => x.kind === kind).map((x) => of(t, x))

describe('tokenizeJson — what it picks out, and what it deliberately does not', () => {
  it('finds the keys', () => {
    expect(kinds(text(), 'key')).toEqual(
      expect.arrayContaining(['"v"', '"id"', '"name"', '"w"', '"h"', '"palette"', '"frames"']),
    )
  })

  it('finds the numbers', () => {
    expect(kinds(text(), 'number')).toEqual(expect.arrayContaining(['1', '4', '3', '100']))
  })

  /**
   * The whole reason this file exists. §9.1 priced colouring at "a span per
   * token on a 70KB string" and never checked it: a pixel row is ONE token, so
   * a 256×256 document is a few hundred spans rather than seventy thousand.
   */
  it('treats a whole pixel row as one token', () => {
    const rows = kinds(text(), 'pixels')
    expect(rows).toEqual(['"...."', '"...."', '"...."'])
  })

  it('keeps a 256×256 document to a few hundred tokens, not tens of thousands', () => {
    const big = serializeDoc(createDoc({ id: 'b', w: 256, h: 256 }))
    expect(big.length).toBeGreaterThan(60_000)
    const n = tokenizeJson(big).length
    expect(n).toBeLessThan(700)
    // …and not because it gave up early: one token per row, plus the header.
    expect(tokenizeJson(big).filter((t) => t.kind === 'pixels')).toHaveLength(256)
  })

  it('emits nothing for punctuation or whitespace — they take the base colour', () => {
    const t = '{ "a" : 1 , "b" : [ 2 ] }'
    const covered = tokenizeJson(t).reduce((n, tok) => n + (tok.to - tok.from), 0)
    expect(covered).toBeLessThan(t.length / 2)
    expect(tokenizeJson(t).map((x) => of(t, x))).toEqual(['"a"', '1', '"b"', '2'])
  })
})

describe('tokenizeJson — the palette draws itself', () => {
  it('recognises a palette colour and carries its value', () => {
    const t = serializeDoc(createDoc({ id: 'p', w: 2, h: 2, palette: DEFAULT_PALETTE }))
    const colours = tokenizeJson(t).filter((x) => x.kind === 'colour')
    expect(colours.map((c) => c.colour)).toEqual(
      DEFAULT_PALETTE.slice(1).map((p) => p.c),
    )
  })

  /** `transparent` is a colour with nothing to draw, so it stays a string. */
  it('does not claim transparent is a colour it can show', () => {
    const t = serializeDoc(createDoc({ id: 'p', w: 2, h: 2 }))
    expect(tokenizeJson(t).filter((x) => x.colour === 'transparent')).toEqual([])
    expect(kinds(t, 'string')).toContain('"transparent"')
  })

  it('does not mistake a layer name for a colour', () => {
    const t = serializeDoc(loadStarter('face'))
    expect(tokenizeJson(t).filter((x) => x.kind === 'colour').every((x) => /^#/.test(x.colour!)))
      .toBe(true)
    expect(kinds(t, 'string')).toContain('"base"')
  })

  /** `"c"` under something that is not a palette entry is still just a string. */
  it('only colours a "c" whose value actually parses as one', () => {
    const t = '{"c":"not a colour","d":"#ff0000"}'
    expect(tokenizeJson(t).filter((x) => x.kind === 'colour')).toEqual([])
  })

  it('normalises the case, because the schema demands lowercase anyway', () => {
    expect(tokenizeJson('{"c":"#AABBCC"}')[1]!.colour).toBe('#aabbcc')
  })
})

describe('tokenizeJson — the buffer is usually mid-edit', () => {
  it('never throws on anything, however broken', () => {
    for (const bad of ['', '{', '{"a"', '{"a":', '[[[[', 'nonsense', '{"a":"unterminated']) {
      expect(() => tokenizeJson(bad)).not.toThrow()
    }
  })

  it('stops at an unterminated string rather than inventing tokens past it', () => {
    const t = '{"a": 1, "b": "no end'
    const out = tokenizeJson(t)
    expect(out.map((x) => of(t, x))).toEqual(['"a"', '1', '"b"'])
  })

  it('is not fooled by braces and brackets inside strings', () => {
    const t = '{"n": "}{][", "w": 7}'
    expect(kinds(t, 'number')).toEqual(['7'])
  })

  it('distinguishes a key from a value that looks like one', () => {
    const t = '{"px": "px"}'
    const out = tokenizeJson(t)
    expect(out[0]!.kind).toBe('key')
    expect(out[1]!.kind).toBe('string')
  })

  it('reads a nested array of rows as pixels, not the array around it', () => {
    const t = '{"frames":[{"layers":[{"px":["..",".1"]}]}]}'
    expect(kinds(t, 'pixels')).toEqual(['".."', '".1"'])
  })
})

describe('pieces — colouring and marks are cut together', () => {
  const tok = (from: number, to: number, kind: Token['kind'] = 'pixels'): Token => ({ from, to, kind })

  it('covers the whole text exactly once, in order', () => {
    const out = pieces(20, [tok(4, 9)], [{ from: 6, to: 7, kind: 'error' }])
    expect(out[0]!.from).toBe(0)
    expect(out[out.length - 1]!.to).toBe(20)
    for (let i = 1; i < out.length; i++) expect(out[i]!.from).toBe(out[i - 1]!.to)
  })

  /** The case that has an ordering bug in every other formulation: one marked
   *  character in the middle of a token. */
  it('splits a token around a mark inside it', () => {
    const out = pieces(20, [tok(4, 9)], [{ from: 6, to: 7, kind: 'error' }])
    const inside = out.filter((p) => p.from >= 4 && p.to <= 9)
    expect(inside.map((p) => [p.from, p.to, p.mark])).toEqual([
      [4, 6, undefined], [6, 7, 'error'], [7, 9, undefined],
    ])
    // …and every part of it keeps the token's colour.
    expect(inside.every((p) => p.kind === 'pixels')).toBe(true)
  })

  it('marks text that is inside no token at all', () => {
    const out = pieces(20, [], [{ from: 6, to: 7, kind: 'cursor' }])
    expect(out.find((p) => p.mark === 'cursor')).toMatchObject({ from: 6, to: 7 })
  })

  it('merges the untagged gaps rather than emitting one per whitespace run', () => {
    const out = pieces(30, [tok(4, 6), tok(10, 12)], [])
    expect(out.map((p) => [p.from, p.to, p.kind ?? null])).toEqual([
      [0, 4, null], [4, 6, 'pixels'], [6, 10, null], [10, 12, 'pixels'], [12, 30, null],
    ])
  })

  it('keeps two adjacent tokens apart, because they are two tokens', () => {
    const out = pieces(10, [tok(0, 5), tok(5, 10)], [])
    expect(out).toHaveLength(2)
  })

  it('carries a colour through to the piece that needs it', () => {
    const out = pieces(10, [{ from: 2, to: 8, kind: 'colour', colour: '#ff0000' }], [])
    expect(out.find((p) => p.kind === 'colour')!.colour).toBe('#ff0000')
  })

  it('is empty for empty text rather than returning a zero-length piece', () => {
    expect(pieces(0, [], [])).toEqual([])
  })

  it('handles a mark that runs to the very end', () => {
    const out = pieces(10, [], [{ from: 8, to: 10, kind: 'error' }])
    expect(out[out.length - 1]).toMatchObject({ from: 8, to: 10, mark: 'error' })
  })

  /** A real document, so the count is the one the panel actually renders. */
  it('stays small on the biggest document this editor makes', () => {
    const big = serializeDoc(createDoc({ id: 'b', w: 256, h: 256 }))
    const out = pieces(big.length, tokenizeJson(big), [{ from: 100, to: 101, kind: 'cursor' }])
    expect(out.length).toBeLessThan(1500)
  })
})
