/**
 * Merge down and flatten. See docs/specs/14-layers.md §12.5 and §12.9.
 */

import { describe, expect, it } from 'vitest'
import { applyCommand, invertCommand } from '../commands'
import { flattenCommand, mergeDownCommand } from '../merge-layers'
import { serializeDoc, parseDoc } from '../codec'
import type { PaletteEntry } from '../schema'
import { docLayers, pixelsOf } from './helpers'

const PAL: PaletteEntry[] = [
  { c: 'transparent' },
  { c: '#000000' },
  { c: '#ffffff' },
]

describe('mergeDownCommand', () => {
  it('returns null at the bottom of the stack', () => {
    const doc = docLayers([{ n: 'base', rows: ['1.', '..'] }], PAL)
    expect(mergeDownCommand(doc, 0, 0).cmd).toBeNull()
  })

  it('two normal/opaque layers merge to the same pixels compositeAt already predicted', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['1.', '..'] },
        { n: 'over', rows: ['.2', '..'] },
      ],
      PAL,
    )
    const { cmd } = mergeDownCommand(doc, 0, 1)
    expect(cmd).not.toBeNull()
    const after = applyCommand(doc, cmd!)
    expect(after.frames[0]!.layers.length).toBe(1)
    // (0,0) was only on the bottom layer, (1,0) only on the top — both survive.
    expect(Array.from(after.frames[0]!.layers[0]!.px)).toEqual([1, 2, 0, 0])
  })

  it('a non-default opacity adds a new colour when nothing existing is close enough', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['1'] },
        { n: 'over', rows: ['2'], o: 50 },
      ],
      PAL,
    )
    const { cmd, result } = mergeDownCommand(doc, 0, 1)
    expect(cmd).not.toBeNull()
    const after = applyCommand(doc, cmd!)
    expect(after.palette.length).toBeGreaterThan(doc.palette.length)
    expect(result.added).toBeGreaterThan(0)
  })

  it('round-trips byte for byte through apply, invert, apply', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['1.', '..'] },
        { n: 'over', rows: ['.2', '2.'], o: 60, mode: 'multiply' },
      ],
      PAL,
    )
    const { cmd } = mergeDownCommand(doc, 0, 1)
    const after = applyCommand(doc, cmd!)
    const undone = applyCommand(after, invertCommand(cmd!))
    // Every mutation stamps meta.updatedAt, so it is excluded from this
    // comparison deliberately, matching paste-image.test.ts's own round trip.
    const strip = (s: string) => s.replace(/"updatedAt":.*/, '')
    expect(strip(serializeDoc(undone))).toBe(strip(serializeDoc(doc)))
  })

  it('reveals a hidden layer being merged rather than silently discarding it', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['1'] },
        { n: 'over', rows: ['2'], hidden: true },
      ],
      PAL,
    )
    const { cmd, result } = mergeDownCommand(doc, 0, 1)
    expect(result.revealedHidden).toBe(1)
    const after = applyCommand(doc, cmd!)
    // The hidden layer's pixel made it into the merged result, not lost.
    expect(after.frames[0]!.layers[0]!.px[0]).toBe(2)
  })
})

describe('flattenCommand', () => {
  it('returns null on a single-layer frame', () => {
    const doc = docLayers([{ n: 'base', rows: ['1'] }], PAL)
    expect(flattenCommand(doc, 0).cmd).toBeNull()
  })

  it('collapses three layers into one, consuming two', () => {
    const doc = docLayers(
      [
        { n: 'a', rows: ['1..'] },
        { n: 'b', rows: ['.2.'] },
        { n: 'c', rows: ['..1'] },
      ],
      PAL,
    )
    const { cmd, result } = flattenCommand(doc, 0)
    expect(cmd).not.toBeNull()
    expect(result.layersConsumed).toBe(2)
    const after = applyCommand(doc, cmd!)
    expect(after.frames[0]!.layers.length).toBe(1)
    expect(Array.from(after.frames[0]!.layers[0]!.px)).toEqual([1, 2, 1])
  })

  it('round-trips byte for byte through apply, invert, apply, including the palette', () => {
    const doc = docLayers(
      [
        { n: 'a', rows: ['1.'] },
        { n: 'b', rows: ['.2'], mode: 'screen' },
        { n: 'c', rows: ['1.'], o: 30 },
      ],
      PAL,
    )
    const { cmd } = flattenCommand(doc, 0)
    const after = applyCommand(doc, cmd!)
    const undone = applyCommand(after, invertCommand(cmd!))
    const strip = (s: string) => s.replace(/"updatedAt":.*/, '')
    expect(strip(serializeDoc(undone))).toBe(strip(serializeDoc(doc)))
    // And the reconstructed document must still be a valid, parseable one.
    expect(parseDoc(serializeDoc(undone)).ok).toBe(true)
  })

  it('every layer position is restored on undo, not just the pixels', () => {
    const doc = docLayers(
      [
        { n: 'a', rows: ['1.'] },
        { n: 'b', rows: ['.2'] },
        { n: 'c', rows: ['1.'] },
      ],
      PAL,
    )
    const { cmd } = flattenCommand(doc, 0)
    const after = applyCommand(doc, cmd!)
    const undone = applyCommand(after, invertCommand(cmd!))
    expect(undone.frames[0]!.layers.map((l) => l.n)).toEqual(['a', 'b', 'c'])
    expect(pixelsOf(undone)).toEqual(pixelsOf(doc))
  })
})
