import { describe, expect, it } from 'vitest'
import { clearFrameCommand, paintedCellCount } from '../clear'
import { applyCommand, invertCommand } from '../commands'
import { docLayers, docOf, pixelsOf } from './helpers'
import { createDoc } from '../create'
import type { Doc } from '../schema'

const P = [{ c: 'transparent' }, { c: '#111111' }, { c: '#222222' }]

/** Two layers, each painting a different corner of a 4x4. */
const twoLayers = (): Doc =>
  docLayers(
    [
      { n: 'base', rows: ['1...', '....', '....', '....'] },
      { n: 'top', rows: ['....', '....', '....', '...2'] },
    ],
    P,
  )

describe('paintedCellCount', () => {
  it('counts nothing on a blank frame', () => {
    expect(paintedCellCount(createDoc({ id: 'a', w: 8, h: 8 }), 0)).toBe(0)
  })

  it('counts painted cells across every layer', () => {
    expect(paintedCellCount(twoLayers(), 0)).toBe(2)
  })

  /**
   * The same reading pixelsLostOnResize uses, and for the same reason: the
   * number is for a human deciding whether to press a red button, and they will
   * check it against what they can see. Two layers painting one spot is one spot.
   */
  it('counts a cell once however many layers paint it', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['11..', '....'] },
        { n: 'top', rows: ['1...', '....'] },
      ],
      P,
    )
    expect(paintedCellCount(doc, 0)).toBe(2)
  })

  it('counts hidden layers — hiding is a view state, not an exemption', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['....', '....'] },
        { n: 'top', rows: ['1...', '....'], hidden: true },
      ],
      P,
    )
    expect(paintedCellCount(doc, 0)).toBe(1)
  })

  it('is 0 for a frame that does not exist', () => {
    expect(paintedCellCount(twoLayers(), 3)).toBe(0)
  })
})

describe('clearFrameCommand', () => {
  it('is null on a blank frame, so a no-op cannot consume an undo step', () => {
    expect(clearFrameCommand(createDoc({ id: 'a', w: 4, h: 4 }), 0, 'Clear')).toBeNull()
    expect(clearFrameCommand(twoLayers(), 9, 'Clear')).toBeNull()
  })

  /** Spec §5: "Clear is one command and ⌘Z restores every layer." */
  it('is ONE command however many layers it touches', () => {
    const cmd = clearFrameCommand(twoLayers(), 0, 'Clear frame')!
    expect(cmd.type).toBe('batch')
    expect(cmd.type === 'batch' && cmd.cmds.length).toBe(2)
  })

  it('empties every layer of the frame', () => {
    const doc = twoLayers()
    const after = applyCommand(doc, clearFrameCommand(doc, 0, 'Clear frame')!)
    expect(pixelsOf(after)).toEqual([
      Array(16).fill(0),
      Array(16).fill(0),
    ])
  })

  it('keeps the size, the palette, the layer count and their names', () => {
    const doc = twoLayers()
    const after = applyCommand(doc, clearFrameCommand(doc, 0, 'Clear frame')!)
    expect([after.w, after.h]).toEqual([doc.w, doc.h])
    expect(after.palette).toEqual(doc.palette)
    expect(after.frames[0]!.layers.map((l) => l.n)).toEqual(['base', 'top'])
  })

  it('clears hidden layers too', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['1...', '....'] },
        { n: 'top', rows: ['..2.', '....'], hidden: true },
      ],
      P,
    )
    const after = applyCommand(doc, clearFrameCommand(doc, 0, 'Clear frame')!)
    expect(pixelsOf(after).flat().every((v) => v === 0)).toBe(true)
    expect(after.frames[0]!.layers[1]!.hidden).toBe(true)
  })

  it('undo restores every layer, byte for byte', () => {
    const doc = twoLayers()
    const cmd = clearFrameCommand(doc, 0, 'Clear frame')!
    const cleared = applyCommand(doc, cmd)
    const back = applyCommand(cleared, invertCommand(cmd))
    expect(pixelsOf(back)).toEqual(pixelsOf(doc))
  })

  it('leaves other frames alone', () => {
    const doc = docOf(['1.', '.1'], P)
    doc.frames.push({
      ms: 100,
      layers: [{ n: 'base', px: Uint8Array.from([2, 2, 2, 2]) }],
    })
    const after = applyCommand(doc, clearFrameCommand(doc, 0, 'Clear frame')!)
    expect(Array.from(after.frames[0]!.layers[0]!.px)).toEqual([0, 0, 0, 0])
    expect(Array.from(after.frames[1]!.layers[0]!.px)).toEqual([2, 2, 2, 2])
  })

  it('does not mutate the document it was given', () => {
    const doc = twoLayers()
    const before = pixelsOf(doc)
    applyCommand(doc, clearFrameCommand(doc, 0, 'Clear frame')!)
    expect(pixelsOf(doc)).toEqual(before)
  })

  /**
   * A layer that is already blank contributes no child command — paintCommand
   * drops cells that did not change. Worth pinning: it is the reason the batch
   * length is "layers with paint on them", not "layers".
   */
  it('skips layers that are already empty', () => {
    const doc = docLayers(
      [
        { n: 'base', rows: ['1...', '....'] },
        { n: 'empty', rows: ['....', '....'] },
      ],
      P,
    )
    const cmd = clearFrameCommand(doc, 0, 'Clear frame')!
    expect(cmd.type === 'batch' && cmd.cmds.length).toBe(1)
  })
})
