/**
 * The selection type's pure geometry. See docs/specs/20-selector.md §2, §4, §8.
 */

import { describe, expect, it } from 'vitest'
import {
  inSelection, isSubsetOf, movePreviewCells, selectionCells, selectionClearCells,
  selectionFromPoints, selectionFromRect, selectionOutline, selectionPaintCells,
  subtractSelection, translateSelection, unionSelection,
} from '../selection'

describe('selectionFromRect', () => {
  it('marks every cell in the box — a rectangle is a fully-filled mask', () => {
    const sel = selectionFromRect(2, 3, 2, 2)
    expect(sel).toEqual({ x: 2, y: 3, w: 2, h: 2, mask: new Uint8Array([1, 1, 1, 1]) })
  })

  it('a non-positive size is an empty selection', () => {
    expect(selectionFromRect(5, 5, 0, 3).w).toBe(0)
    expect(selectionFromRect(5, 5, 3, 0).h).toBe(0)
  })
})

describe('selectionFromPoints', () => {
  it('bbox is the tight bounds of the point list', () => {
    const sel = selectionFromPoints([[2, 5], [4, 5], [3, 7]])
    expect(sel.x).toBe(2)
    expect(sel.y).toBe(5)
    expect(sel.w).toBe(3) // 2..4
    expect(sel.h).toBe(3) // 5..7
  })

  it('the mask marks exactly the given points, nothing else in the bbox', () => {
    const sel = selectionFromPoints([[0, 0], [1, 0], [0, 1]]) // an L, not a filled 2x2
    expect(Array.from(sel.mask)).toEqual([1, 1, 1, 0])
  })

  it('an empty point list is an empty selection', () => {
    expect(selectionFromPoints([]).w).toBe(0)
  })
})

describe('inSelection', () => {
  const lShape = selectionFromPoints([[0, 0], [1, 0], [0, 1]])

  it('hits a selected cell', () => {
    expect(inSelection(lShape, 1, 0)).toBe(true)
  })

  it('misses a cell inside the bbox but not the mask', () => {
    expect(inSelection(lShape, 1, 1)).toBe(false)
  })

  it('misses anything outside the bbox entirely', () => {
    expect(inSelection(lShape, -1, 0)).toBe(false)
    expect(inSelection(lShape, 5, 5)).toBe(false)
  })
})

describe('selectionCells', () => {
  it('enumerates selected cells in absolute document coordinates', () => {
    const sel = selectionFromPoints([[3, 4], [4, 4]])
    const cells = selectionCells(sel).map((c) => c.join(','))
    expect(cells.sort()).toEqual(['3,4', '4,4'])
  })
})

describe('unionSelection / subtractSelection / isSubsetOf', () => {
  it('union combines two disjoint selections into one tight bbox', () => {
    const a = selectionFromPoints([[0, 0], [1, 0]])
    const b = selectionFromPoints([[3, 0]])
    const u = unionSelection(a, b)
    expect(u).toEqual({ x: 0, y: 0, w: 4, h: 1, mask: new Uint8Array([1, 1, 0, 1]) })
  })

  it('union with an empty selection returns the other one unchanged', () => {
    const a = selectionFromPoints([[0, 0]])
    const empty = selectionFromPoints([])
    expect(unionSelection(a, empty)).toEqual(a)
    expect(unionSelection(empty, a)).toEqual(a)
  })

  it('subtract removes exactly the overlap and re-tightens the bbox', () => {
    const a = selectionFromRect(0, 0, 4, 1) // ####
    const b = selectionFromPoints([[3, 0]]) // remove the last cell
    const s = subtractSelection(a, b)
    expect(s).toEqual({ x: 0, y: 0, w: 3, h: 1, mask: new Uint8Array([1, 1, 1]) })
  })

  it('subtracting everything empties the selection (w === 0), not a degenerate object', () => {
    const a = selectionFromPoints([[0, 0], [1, 0]])
    const s = subtractSelection(a, a)
    expect(s.w).toBe(0)
  })

  it('subtract can shrink the bbox from either end, not just trim the far side', () => {
    const a = selectionFromRect(0, 0, 3, 1) // ###
    const s = subtractSelection(a, selectionFromPoints([[0, 0]])) // remove the first cell
    expect(s).toEqual({ x: 1, y: 0, w: 2, h: 1, mask: new Uint8Array([1, 1]) })
  })

  it('isSubsetOf is true for a fully-covered blob and false otherwise', () => {
    const whole = selectionFromRect(0, 0, 3, 3)
    const blob = selectionFromPoints([[1, 1], [1, 2]])
    expect(isSubsetOf(blob, whole)).toBe(true)
    expect(isSubsetOf(whole, blob)).toBe(false)
  })
})

describe('translateSelection', () => {
  it('shifts the origin, keeps shape and mask identical', () => {
    const sel = selectionFromPoints([[0, 0], [1, 0]])
    const moved = translateSelection(sel, 5, -2)
    expect(moved.x).toBe(5)
    expect(moved.y).toBe(-2)
    expect(moved.w).toBe(sel.w)
    expect(moved.mask).toBe(sel.mask) // same mask, no copy needed
  })
})

describe('movePreviewCells — live-drag preview cell math', () => {
  it('clears every source cell and stamps every lifted cell at its offset', () => {
    const sel = selectionFromPoints([[0, 0], [1, 0], [0, 1]]) // an L
    const lifted: Array<[number, number, number]> = [[0, 0, 5], [1, 0, 6], [0, 1, 7]]
    const { cells, values } = movePreviewCells(sel, lifted, 1, 0)

    // (1,0) is BOTH a source (cleared) and a destination (stamped) — the
    // stamped value must win, since that is the correct result of a rigid
    // translate: the shape ends up one cell to the right.
    expect(values.get('0,0')).toBe(0) // source only, vacated
    expect(values.get('1,0')).toBe(5) // source AND destination — stamp wins
    expect(values.get('2,0')).toBe(6) // destination only
    expect(values.get('0,1')).toBe(0) // source only, vacated
    expect(values.get('1,1')).toBe(7) // destination only
    expect(cells).toHaveLength(5)
  })
})

describe('selectionPaintCells — discrete nudge cell math', () => {
  it('never touches a cell outside the mask, even one inside the bbox', () => {
    // Two disjoint 1-cell blobs unioned: bbox spans x=0..3, but only x=0 and
    // x=3 are actually selected. x=2 holds unrelated content that must
    // survive completely untouched — the literal "no square hole" property.
    const sel = unionSelection(selectionFromPoints([[0, 0]]), selectionFromPoints([[3, 0]]))
    const px = new Uint8Array([9, 0, 7, 0]) // x2 = 7, unrelated painted content
    const cells = selectionPaintCells(px, 4, 1, sel, 1, 0)

    expect(cells.some(([x, y]) => x === 2 && y === 0)).toBe(false)
    const at = (x: number, y: number) => cells.find((c) => c[0] === x && c[1] === y)
    expect(at(0, 0)).toEqual([0, 0, 9, 0]) // vacated
    expect(at(1, 0)).toEqual([1, 0, 0, 9]) // stamped with the source's value
    // x=3's destination (x=4) is off-canvas and dropped; x=3 itself still
    // clears since it is a valid, in-bounds source.
    expect(at(3, 0)).toEqual([3, 0, 0, 0])
    expect(cells).toHaveLength(3)
  })

  it('drops a destination that falls off the canvas, matching today\'s move', () => {
    const sel = selectionFromRect(0, 0, 2, 2)
    const px = new Uint8Array([5, 6, 7, 8]) // row-major: (0,0)=5 (1,0)=6 (0,1)=7 (1,1)=8
    const cells = selectionPaintCells(px, 2, 2, sel, 1, 0)
    const at = (x: number, y: number) => cells.find((c) => c[0] === x && c[1] === y)

    expect(at(0, 0)).toEqual([0, 0, 5, 0])
    expect(at(1, 0)).toEqual([1, 0, 6, 5]) // cleared then re-stamped by (0,0)'s move
    expect(at(0, 1)).toEqual([0, 1, 7, 0])
    expect(at(1, 1)).toEqual([1, 1, 8, 7]) // cleared then re-stamped by (0,1)'s move
    expect(cells).toHaveLength(4) // (2,0) and (2,1) are off-canvas, dropped
  })

  it('a selection already sitting off-canvas has nothing to lift, and does not throw', () => {
    const sel = selectionFromPoints([[-1, 0]])
    const px = new Uint8Array([1, 2])
    expect(selectionPaintCells(px, 2, 1, sel, 1, 0)).toEqual([])
  })
})

describe('selectionClearCells', () => {
  it('only touches the masked cells, not the whole bbox', () => {
    const sel = unionSelection(selectionFromPoints([[0, 0]]), selectionFromPoints([[3, 0]]))
    const px = new Uint8Array([9, 0, 7, 4])
    const cells = selectionClearCells(px, 4, sel)
    expect(cells.map((c) => c.join(',')).sort()).toEqual(['0,0,9,0', '3,0,4,0'])
  })
})

describe('selectionOutline — the mask-boundary trace', () => {
  it('a filled rectangle reduces to exactly the 4-sided outline (the regression check)', () => {
    const sel = selectionFromRect(2, 3, 4, 5)
    const runs = selectionOutline(sel)
    expect(runs).toHaveLength(4)
    expect(runs).toEqual(expect.arrayContaining([
      { side: 'top', at: 3, a: 2, b: 6 },
      { side: 'bottom', at: 8, a: 2, b: 6 },
      { side: 'left', at: 2, a: 3, b: 8 },
      { side: 'right', at: 6, a: 3, b: 8 },
    ]))
  })

  it('a 1x1 selection is its own 4-sided outline', () => {
    const sel = selectionFromRect(0, 0, 1, 1)
    expect(selectionOutline(sel)).toEqual(expect.arrayContaining([
      { side: 'top', at: 0, a: 0, b: 1 },
      { side: 'bottom', at: 1, a: 0, b: 1 },
      { side: 'left', at: 0, a: 0, b: 1 },
      { side: 'right', at: 1, a: 0, b: 1 },
    ]))
  })

  it('traces an irregular (non-rectangular) blob correctly', () => {
    // XX
    // X.
    const sel = selectionFromPoints([[0, 0], [1, 0], [0, 1]])
    const runs = selectionOutline(sel)
    expect(runs).toHaveLength(6)
    expect(runs).toEqual(expect.arrayContaining([
      { side: 'top', at: 0, a: 0, b: 2 },
      { side: 'right', at: 2, a: 0, b: 1 },
      { side: 'bottom', at: 1, a: 1, b: 2 },
      { side: 'right', at: 1, a: 1, b: 2 },
      { side: 'bottom', at: 2, a: 0, b: 1 },
      { side: 'left', at: 0, a: 0, b: 2 },
    ]))
  })

  it('two disjoint blobs each get their own boundary — no run bridges the gap', () => {
    const sel = unionSelection(selectionFromRect(0, 0, 2, 2), selectionFromPoints([[4, 0], [4, 1]]))
    const runs = selectionOutline(sel)
    // A run that bridged the gap between x=2 and x=4 would have to span more
    // than either blob's own width (2, or 1) along its axis.
    for (const r of runs) {
      if (r.side === 'top' || r.side === 'bottom') expect(r.b - r.a).toBeLessThanOrEqual(2)
    }
    // Both blobs' own outlines are present: the left one is a plain 2x2
    // rectangle (4 runs) and the right one a 1x2 rectangle (4 runs) — 8 total.
    expect(runs).toHaveLength(8)
  })
})
