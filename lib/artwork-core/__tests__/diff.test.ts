/** Diff across layers. See docs/specs/14-layers.md §8.3. */

import { describe, expect, it } from 'vitest'
import { changedLayers, diff, isEmpty, sameLayerShape } from '../diff'
import { cloneDoc } from '../codec'
import type { Doc, PaletteEntry } from '../schema'
import { docLayers } from './helpers'

const PAL: PaletteEntry[] = [{ c: 'transparent' }, { c: '#111111' }, { c: '#222222' }]

const base = (): Doc =>
  docLayers(
    [
      { n: 'base', rows: ['1.', '..'] },
      { n: 'over', rows: ['..', '.2'] },
    ],
    PAL,
  )

/** Set one pixel on one layer of a clone. */
function poke(doc: Doc, layer: number, p: number, value: number): Doc {
  const next = cloneDoc(doc)
  next.frames[0]!.layers[layer]!.px[p] = value
  return next
}

describe('diff(layer)', () => {
  it('reports only the requested layer', () => {
    const after = poke(base(), 1, 0, 2)
    expect(isEmpty(diff(base(), after, 0, 0))).toBe(true)
    expect(diff(base(), after, 0, 1).added).toEqual([[0, 0, 2]])
  })

  it('defaults to layer 0, matching every pre-layers call site', () => {
    const after = poke(base(), 0, 1, 1)
    expect(diff(base(), after).added).toEqual([[1, 0, 1]])
  })

  it('classifies added, changed and removed within the layer', () => {
    let after = poke(base(), 0, 0, 2) // 1 -> 2, changed
    after = poke(after, 0, 3, 1) // 0 -> 1, added
    const d = diff(base(), after, 0, 0)
    expect(d.changed).toEqual([[0, 0, 1, 2]])
    expect(d.added).toEqual([[1, 1, 1]])
    expect(d.removed).toEqual([])

    const cleared = poke(base(), 0, 0, 0)
    expect(diff(base(), cleared, 0, 0).removed).toEqual([[0, 0, 1]])
  })

  it('throws RangeError for a layer missing from either document (L-E6)', () => {
    expect(() => diff(base(), base(), 0, 5)).toThrow(RangeError)
    expect(() => diff(base(), base(), 3, 0)).toThrow(RangeError)
  })

  it('still throws on mismatched dimensions', () => {
    const wide = docLayers([{ n: 'base', rows: ['1..', '...'] }], PAL)
    expect(() => diff(base(), wide, 0, 0)).toThrow(RangeError)
  })
})

describe('changedLayers', () => {
  it('returns [] when nothing moved', () => {
    expect(changedLayers(base(), cloneDoc(base()), 0)).toEqual([])
  })

  it('returns the single layer that changed', () => {
    expect(changedLayers(base(), poke(base(), 1, 0, 2), 0)).toEqual([1])
  })

  it('returns both when two layers changed', () => {
    const after = poke(poke(base(), 0, 1, 2), 1, 0, 2)
    expect(changedLayers(base(), after, 0)).toEqual([0, 1])
  })

  it('counts a layer that exists in only one document', () => {
    const after = cloneDoc(base())
    after.frames[0]!.layers.push({ n: 'third', px: new Uint8Array(4) })
    expect(changedLayers(base(), after, 0)).toEqual([2])
  })
})

describe('sameLayerShape', () => {
  it('is true when only pixels differ', () => {
    expect(sameLayerShape(base(), poke(base(), 0, 1, 2))).toBe(true)
  })

  it('is false for a different count, name, or hidden flag', () => {
    const added = cloneDoc(base())
    added.frames[0]!.layers.push({ n: 'third', px: new Uint8Array(4) })
    expect(sameLayerShape(base(), added)).toBe(false)

    const renamed = cloneDoc(base())
    renamed.frames[0]!.layers[1]!.n = 'shadow'
    expect(sameLayerShape(base(), renamed)).toBe(false)

    const hidden = cloneDoc(base())
    hidden.frames[0]!.layers[0]!.hidden = true
    expect(sameLayerShape(base(), hidden)).toBe(false)
  })

  it('treats undefined and false hidden as the same', () => {
    const explicit = cloneDoc(base())
    explicit.frames[0]!.layers[0]!.hidden = false
    expect(sameLayerShape(base(), explicit)).toBe(true)
  })

  it('is false when the frame count differs', () => {
    const twoFrames = cloneDoc(base())
    twoFrames.frames.push(cloneDoc(base()).frames[0]!)
    expect(sameLayerShape(base(), twoFrames)).toBe(false)
  })
})
