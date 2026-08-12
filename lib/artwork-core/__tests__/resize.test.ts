import { describe, expect, it } from 'vitest'
import { pixelsLostOnResize, resizeDoc, resizeOffset } from '../resize'
import { createDoc } from '../create'
import { parseDoc, serializeDoc } from '../codec'
import { applyCommand, invertCommand } from '../commands'
import type { Doc } from '../schema'

function docWith(w: number, h: number, paint: Array<[number, number, number]>): Doc {
  const d = createDoc({ id: 'test', w, h })
  const px = d.frames[0]!.layers[0]!.px
  for (const [x, y, v] of paint) px[y * w + x] = v
  return d
}

const at = (d: Doc, x: number, y: number, layer = 0, frame = 0) =>
  d.frames[frame]!.layers[layer]!.px[y * d.w + x]

describe('resizeOffset', () => {
  it('centres an even difference exactly', () => {
    expect(resizeOffset(16, 32)).toBe(8)
    expect(resizeOffset(32, 16)).toBe(-8)
  })

  it('biases an odd difference to the top-left, both directions', () => {
    expect(resizeOffset(16, 17)).toBe(0)
    expect(resizeOffset(17, 16)).toBe(0)
  })

  /**
   * The property the bias exists for. Rounding instead of flooring makes grow
   * and shrink disagree by one, so a grow/shrink cycle walks the artwork across
   * the canvas a pixel at a time.
   */
  it('grow then shrink returns to the same offset, at every size pair', () => {
    const bad: Array<[number, number]> = []
    for (let a = 1; a <= 40; a++) {
      for (let b = 1; b <= 40; b++) {
        if (resizeOffset(a, b) + resizeOffset(b, a) !== 0) bad.push([a, b])
      }
    }
    expect(bad).toEqual([])
  })
})

describe('resizeDoc', () => {
  it('keeps a centred dot centred when growing', () => {
    const d = docWith(16, 16, [[8, 8, 1]])
    const r = resizeDoc(d, 32, 32)
    expect(r.w).toBe(32)
    expect(at(r, 16, 16)).toBe(1)
  })

  it('keeps a centred dot centred when shrinking', () => {
    const d = docWith(32, 32, [[16, 16, 1]])
    const r = resizeDoc(d, 16, 16)
    expect(at(r, 8, 8)).toBe(1)
  })

  it('pads with transparent rather than with anything else', () => {
    const d = docWith(2, 2, [[0, 0, 3], [1, 1, 3]])
    const r = resizeDoc(d, 4, 4)
    // The old 2x2 lands at offset 1,1.
    expect(at(r, 1, 1)).toBe(3)
    expect(at(r, 2, 2)).toBe(3)
    expect(at(r, 0, 0)).toBe(0)
    expect(at(r, 3, 3)).toBe(0)
  })

  it('crops what falls outside instead of wrapping it', () => {
    const d = docWith(4, 4, [[0, 0, 5], [3, 3, 5], [2, 2, 6]])
    const r = resizeDoc(d, 2, 2)
    // offset -1,-1: only the pixel at 2,2 survives, landing at 1,1.
    expect(at(r, 1, 1)).toBe(6)
    expect(r.frames[0]!.layers[0]!.px.filter((v) => v !== 0)).toHaveLength(1)
  })

  it('handles a non-square resize on both axes at once', () => {
    const d = docWith(8, 8, [[4, 4, 2]])
    const r = resizeDoc(d, 16, 4)
    expect(r.w).toBe(16)
    expect(r.h).toBe(4)
    expect(at(r, 8, 2)).toBe(2)
  })

  it('resizes every layer of every frame, not just the first', () => {
    const d = createDoc({ id: 'multi', w: 4, h: 4 })
    d.frames[0]!.layers.push({ n: 'second', px: new Uint8Array(16) })
    d.frames.push({ ms: 100, layers: [
      { n: 'a', px: new Uint8Array(16) },
      { n: 'b', px: new Uint8Array(16) },
    ] })
    d.frames[0]!.layers[1]!.px[5] = 7
    d.frames[1]!.layers[1]!.px[5] = 9

    const r = resizeDoc(d, 8, 8)
    for (const f of r.frames) {
      for (const l of f.layers) expect(l.px.length).toBe(64)
    }
    // 4x4 index 5 is (1,1); offset is +2,+2, so it lands at (3,3).
    expect(at(r, 3, 3, 1, 0)).toBe(7)
    expect(at(r, 3, 3, 1, 1)).toBe(9)
  })

  it('never mutates the document it was given', () => {
    const d = docWith(4, 4, [[1, 1, 4]])
    const before = serializeDoc(d)
    resizeDoc(d, 16, 16)
    expect(serializeDoc(d)).toBe(before)
  })

  it('produces a document that still parses', () => {
    const d = docWith(16, 16, [[3, 3, 2]])
    const r = parseDoc(serializeDoc(resizeDoc(d, 24, 9)))
    expect(r.ok).toBe(true)
  })

  it('a resize to the same size changes nothing', () => {
    const d = docWith(8, 8, [[2, 5, 1]])
    expect(serializeDoc(resizeDoc(d, 8, 8))).toBe(serializeDoc(d))
  })
})

describe('undo across a destructive crop', () => {
  /**
   * The reason the command stores whole documents rather than a cell list: a
   * crop can destroy thousands of pixels, and "undo brings it back" is only
   * true if undo has the bytes. Verified through serialise/reparse rather than
   * by object identity, so a shared buffer cannot make it pass.
   */
  it('restores every cropped pixel exactly', () => {
    const d = docWith(8, 8, [
      [0, 0, 1], [7, 0, 2], [0, 7, 3], [7, 7, 4], [4, 4, 5],
    ])
    const before = serializeDoc(d)

    const cmd = {
      type: 'resize' as const,
      label: 'Resize',
      before: d,
      after: resizeDoc(d, 2, 2),
    }
    const shrunk = applyCommand(d, cmd)
    expect(shrunk.w).toBe(2)
    // The corners are gone.
    expect(shrunk.frames[0]!.layers[0]!.px.filter((v) => v !== 0).length).toBeLessThan(5)

    const restored = applyCommand(shrunk, invertCommand(cmd))
    expect(serializeDoc(restored)).toBe(before)
  })
})

describe('pixelsLostOnResize', () => {
  it('is zero when growing', () => {
    const d = docWith(4, 4, [[0, 0, 1], [3, 3, 1]])
    expect(pixelsLostOnResize(d, 16, 16)).toBe(0)
  })

  it('is zero when the size does not change', () => {
    const d = docWith(4, 4, [[0, 0, 1]])
    expect(pixelsLostOnResize(d, 4, 4)).toBe(0)
  })

  it('counts only painted pixels that fall outside', () => {
    // 4x4 -> 2x2, offset -1,-1. The surviving window is source x,y in 1..2.
    const d = docWith(4, 4, [[0, 0, 1], [3, 3, 1], [1, 1, 1], [2, 2, 1]])
    expect(pixelsLostOnResize(d, 2, 2)).toBe(2)
  })

  it('ignores transparent pixels that fall outside', () => {
    const d = docWith(4, 4, [[1, 1, 1]])
    expect(pixelsLostOnResize(d, 2, 2)).toBe(0)
  })

  it('counts a position once even when several layers lose one there', () => {
    const d = createDoc({ id: 'l', w: 4, h: 4 })
    d.frames[0]!.layers.push({ n: 'two', px: new Uint8Array(16) })
    d.frames[0]!.layers[0]!.px[0] = 1 // (0,0)
    d.frames[0]!.layers[1]!.px[0] = 2 // same spot, other layer
    expect(pixelsLostOnResize(d, 2, 2)).toBe(1)
  })

  it('agrees with what the resize actually destroys', () => {
    const d = docWith(6, 6, [
      [0, 0, 1], [5, 5, 1], [2, 2, 1], [3, 3, 1], [0, 5, 1],
    ])
    const painted = (doc: Doc) =>
      doc.frames[0]!.layers[0]!.px.filter((v) => v !== 0).length
    const lost = painted(d) - painted(resizeDoc(d, 4, 4))
    expect(pixelsLostOnResize(d, 4, 4)).toBe(lost)
  })
})
