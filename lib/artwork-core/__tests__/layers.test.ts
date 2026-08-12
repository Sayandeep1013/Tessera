/** Layer helpers. See docs/specs/14-layers.md §8.2. */

import { describe, expect, it } from 'vitest'
import { MAX_LAYERS, cleanLayerName, clampLayer, compositeAt, nextLayerName } from '../layers'
import { parseDoc, serializeDoc } from '../codec'
import type { PaletteEntry } from '../schema'
import { docLayers, docOf } from './helpers'

const PAL: PaletteEntry[] = [
  { c: 'transparent' },
  { c: '#111111' },
  { c: '#222222' },
  { c: '#333333' },
]

describe('compositeAt', () => {
  const doc = docLayers(
    [
      { n: 'base', rows: ['11', '11'] },
      { n: 'mid', rows: ['2.', '..'] },
      { n: 'top', rows: ['..', '.3'] },
    ],
    PAL,
  )

  it('returns the topmost non-transparent index', () => {
    expect(compositeAt(doc, 0, 0, 0)).toBe(2) // mid wins over base
    expect(compositeAt(doc, 0, 1, 1)).toBe(3) // top wins
  })

  it('falls through to a lower layer where the upper one is transparent', () => {
    expect(compositeAt(doc, 0, 1, 0)).toBe(1)
    expect(compositeAt(doc, 0, 0, 1)).toBe(1)
  })

  it('skips hidden layers', () => {
    const hidden = docLayers(
      [
        { n: 'base', rows: ['11', '11'] },
        { n: 'mid', rows: ['22', '22'], hidden: true },
      ],
      PAL,
    )
    expect(compositeAt(hidden, 0, 0, 0)).toBe(1)
  })

  it('returns 0 when every layer is transparent there, and out of bounds', () => {
    const empty = docLayers(
      [
        { n: 'a', rows: ['..', '..'] },
        { n: 'b', rows: ['..', '..'] },
      ],
      PAL,
    )
    expect(compositeAt(empty, 0, 1, 1)).toBe(0)
    expect(compositeAt(doc, 0, -1, 0)).toBe(0)
    expect(compositeAt(doc, 0, 0, 9)).toBe(0)
    expect(compositeAt(doc, 5, 0, 0)).toBe(0)
  })
})

describe('clampLayer', () => {
  const doc = docLayers(
    [
      { n: 'a', rows: ['..'] },
      { n: 'b', rows: ['..'] },
    ],
    PAL,
  )

  it('clamps below and above the range', () => {
    expect(clampLayer(doc, 0, -3)).toBe(0)
    expect(clampLayer(doc, 0, 9)).toBe(1)
    expect(clampLayer(doc, 0, 1)).toBe(1)
  })

  it('returns 0 for a missing frame or a null document', () => {
    expect(clampLayer(doc, 4, 1)).toBe(0)
    expect(clampLayer(null, 0, 1)).toBe(0)
  })

  it('survives nonsense input', () => {
    expect(clampLayer(doc, 0, Number.NaN)).toBe(0)
    expect(clampLayer(doc, 0, 1.7)).toBe(1)
  })
})

describe('nextLayerName', () => {
  it('numbers from the layer count up', () => {
    expect(nextLayerName(docOf(['..'], PAL), 0)).toBe('Layer 2')
  })

  it('skips a name that is already taken', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['..'] },
        { n: 'Layer 2', rows: ['..'] },
      ],
      PAL,
    )
    expect(nextLayerName(doc, 0)).toBe('Layer 3')
  })

  it('never exceeds the format limit', () => {
    expect(nextLayerName(docOf(['..'], PAL), 0).length).toBeLessThanOrEqual(32)
  })
})

describe('cleanLayerName', () => {
  it('trims, collapses whitespace and truncates to 32', () => {
    expect(cleanLayerName('  a   b  ')).toBe('a b')
    expect(cleanLayerName('x'.repeat(40))).toHaveLength(32)
    expect(cleanLayerName('   ')).toBe('')
  })
})

describe('MAX_LAYERS is not a format rule', () => {
  it('a document with more layers than the cap still parses', () => {
    const rows = ['..', '..']
    const many = docLayers(
      Array.from({ length: MAX_LAYERS + 4 }, (_, i) => ({ n: `l${i}`, rows })),
      PAL,
    )
    const reparsed = parseDoc(serializeDoc(many))
    expect(reparsed.ok).toBe(true)
    if (reparsed.ok) expect(reparsed.value.frames[0]!.layers).toHaveLength(MAX_LAYERS + 4)
  })
})
