import { describe, expect, it } from 'vitest'
import { flattenFrame, horizontalRuns } from '../geometry'
import { loadStarter } from '../../artwork-core/create'
import { docFrom, docFromLayers } from './helpers'

describe('horizontalRuns', () => {
  it('merges horizontally and skips transparent', () => {
    const doc = docFrom(['.11.'], ['transparent', '#ffffff'])
    expect(horizontalRuns(doc.frames[0]!.layers[0]!.px, 4, 1)).toEqual([
      { x: 1, y: 0, len: 2, i: 1 },
    ])
  })

  it('does not merge vertically — one run per row, unlike sprite-svg', () => {
    const doc = docFrom(['11', '11'], ['transparent', '#ffffff'])
    expect(horizontalRuns(doc.frames[0]!.layers[0]!.px, 2, 2)).toEqual([
      { x: 0, y: 0, len: 2, i: 1 },
      { x: 0, y: 1, len: 2, i: 1 },
    ])
  })

  it('does not merge across a colour change', () => {
    const doc = docFrom(['12'], ['transparent', '#ffffff', '#000000'])
    expect(horizontalRuns(doc.frames[0]!.layers[0]!.px, 2, 1)).toHaveLength(2)
  })

  it('is empty for an all-transparent image', () => {
    expect(horizontalRuns(new Uint8Array(16), 4, 4)).toEqual([])
  })
})

describe('flattenFrame', () => {
  it('single layer round-trips unchanged', () => {
    const doc = docFrom(['1.', '.1'], ['transparent', '#ffffff'])
    expect(Array.from(flattenFrame(doc, 0))).toEqual([1, 0, 0, 1])
  })

  it('the top layer wins where both paint the same cell', () => {
    const doc = docFromLayers(
      [{ rows: ['1'] }, { rows: ['2'] }],
      ['transparent', '#ffffff', '#000000'],
    )
    // layers[1] ("2") is on top per compositeAt — see lib/artwork-core/layers.ts
    expect(Array.from(flattenFrame(doc, 0))).toEqual([2])
  })

  it('falls through a transparent cell in the top layer to the one below', () => {
    const doc = docFromLayers(
      [{ rows: ['1'] }, { rows: ['.'] }],
      ['transparent', '#ffffff'],
    )
    expect(Array.from(flattenFrame(doc, 0))).toEqual([1])
  })

  it('skips a hidden layer entirely', () => {
    const doc = docFromLayers(
      [{ rows: ['1'] }, { rows: ['2'], hidden: true }],
      ['transparent', '#ffffff', '#000000'],
    )
    expect(Array.from(flattenFrame(doc, 0))).toEqual([1])
  })

  it('is all zero for an all-transparent document', () => {
    const doc = docFrom(['..', '..'], ['transparent'])
    expect(Array.from(flattenFrame(doc, 0))).toEqual([0, 0, 0, 0])
  })

  it('matches spriteRects coverage on the face fixture', () => {
    const doc = loadStarter('face')
    const flat = flattenFrame(doc, 0)
    let painted = 0
    for (const i of flat) if (i !== 0) painted++
    let sourcePainted = 0
    for (const i of doc.frames[0]!.layers[0]!.px) if (i !== 0) sourcePainted++
    expect(painted).toBe(sourcePainted)
  })
})
