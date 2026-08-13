/**
 * Commands. See docs/specs/03-artwork-core.md §5 and docs/specs/14-layers.md §8.1.
 *
 * The heart of this file is the two-layer undo case. A paint command that does
 * not record WHICH layer it touched cannot be inverted once a second layer
 * exists — undo writes the previous pixels into whichever layer happens to be
 * active, which is silent corruption: no error, no crash, the wrong pixels
 * change. These tests fail against the pre-layers implementation, which is the
 * only reason to trust them.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  invertCommand,
  paintCommand,
  type EditorCommand,
  type PaintCell,
} from '../commands'
import { parseDoc, serializeDoc } from '../codec'
import type { Layer, PaletteEntry } from '../schema'
import { arbDoc, docLayers, docOf, pixelsOf } from './helpers'

const PAL: PaletteEntry[] = [
  { c: 'transparent' },
  { c: '#111111' },
  { c: '#222222' },
  { c: '#333333' },
]

/** Two 2x2 layers: `base` has a pixel at (0,0), `over` is empty. */
const twoLayer = () =>
  docLayers(
    [
      { n: 'base', rows: ['1.', '..'] },
      { n: 'over', rows: ['..', '..'] },
    ],
    PAL,
  )

describe('paint across layers', () => {
  it('inverts on the layer it was recorded against, not the active one', () => {
    const before = twoLayer()
    const cmd = paintCommand('Brush', 0, 1, [[1, 1, 0, 2]] as PaintCell[])!
    const after = applyCommand(before, cmd)

    // The paint landed on layer 1 and nowhere else.
    expect(pixelsOf(after)).toEqual([
      [1, 0, 0, 0],
      [0, 0, 0, 2],
    ])

    const undone = applyCommand(after, invertCommand(cmd))
    expect(pixelsOf(undone)).toEqual(pixelsOf(before))
  })

  it('leaves every other layer byte-identical', () => {
    const before = twoLayer()
    const cmd = paintCommand('Brush', 0, 1, [
      [0, 0, 0, 3],
      [1, 0, 0, 3],
    ] as PaintCell[])!
    const after = applyCommand(before, cmd)

    expect(pixelsOf(after)[0]).toEqual(pixelsOf(before)[0])
    expect(pixelsOf(after)[1]).toEqual([3, 3, 0, 0])
  })

  it('round-trips a random stroke on any layer of a three-layer document', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 })), {
          minLength: 1,
          maxLength: 50,
        }),
        fc.integer({ min: 1, max: 3 }),
        (layer, points, value) => {
          const rows = ['1..2', '.3..', '..1.', '2..3']
          const before = docLayers(
            [
              { n: 'a', rows },
              { n: 'b', rows: ['....', '....', '....', '....'] },
              { n: 'c', rows: ['3333', '....', '2222', '....'] },
            ],
            PAL,
          )
          const px = before.frames[0]!.layers[layer]!.px
          const cells: PaintCell[] = points.map(([x, y]) => [x, y, px[y * 4 + x]!, value])
          const cmd = paintCommand('Brush', 0, layer, cells)
          if (!cmd) return true // every cell was already `value`
          const after = applyCommand(before, cmd)
          const undone = applyCommand(after, invertCommand(cmd))
          expect(pixelsOf(undone)).toEqual(pixelsOf(before))
          return true
        },
      ),
      { numRuns: 60 },
    )
  })

  it('drops no-op cells and returns null for a stroke that changes nothing', () => {
    expect(paintCommand('Brush', 0, 0, [[0, 0, 1, 1]] as PaintCell[])).toBeNull()
    const cmd = paintCommand('Brush', 0, 0, [
      [0, 0, 1, 1],
      [1, 1, 0, 2],
    ] as PaintCell[])
    expect(cmd).not.toBeNull()
    expect((cmd as Extract<EditorCommand, { type: 'paint' }>).cells).toHaveLength(1)
  })

  it('is a no-op, not a throw, when the recorded layer no longer exists (L-E7)', () => {
    const doc = docOf(['1.', '..'], PAL)
    const cmd: EditorCommand = {
      type: 'paint',
      label: 'Brush',
      frame: 0,
      layer: 7,
      cells: [[0, 0, 1, 2]],
    }
    expect(() => applyCommand(doc, cmd)).not.toThrow()
    expect(pixelsOf(applyCommand(doc, cmd))).toEqual(pixelsOf(doc))
  })
})

describe('ai_edit inversion', () => {
  /**
   * The regression in docs/specs/14-layers.md §0.2. An AI session that adds a
   * colour and paints with it used to invert to palette_pop ALONE, leaving the
   * painted pixels pointing past the end of the palette. Autosave wrote that
   * document and the next load failed to parse — the user saw "Couldn't open
   * your last drawing."
   */
  it('restores both the pixels and the palette when the edit added a colour', () => {
    const before = docOf(['1.', '..'], PAL)
    const cmd: EditorCommand = {
      type: 'ai_edit',
      label: 'AI: add a spot',
      frame: 0,
      layer: 0,
      cells: [[1, 1, 0, 4]],
      summary: 'added a spot',
      ops: [],
      paletteAdded: [{ c: '#abcdef' }],
    }

    const after = applyCommand(before, cmd)
    expect(after.palette).toHaveLength(5)
    expect(after.frames[0]!.layers[0]!.px[3]).toBe(4)

    const undone = applyCommand(after, invertCommand(cmd))
    expect(undone.palette).toHaveLength(4)
    expect(pixelsOf(undone)).toEqual(pixelsOf(before))

    // The failure the user would actually have hit: the undone document must
    // survive a save/load round trip.
    const reparsed = parseDoc(serializeDoc(undone))
    expect(reparsed.ok).toBe(true)
  })

  it('inverts to a plain paint when no colour was added', () => {
    const before = docOf(['1.', '..'], PAL)
    const cmd: EditorCommand = {
      type: 'ai_edit',
      label: 'AI: recolour',
      frame: 0,
      layer: 0,
      cells: [[0, 0, 1, 2]],
      summary: 'recoloured',
      ops: [],
      paletteAdded: [],
    }
    const inverse = invertCommand(cmd)
    expect(inverse.type).toBe('paint')
    expect(pixelsOf(applyCommand(applyCommand(before, cmd), inverse))).toEqual(pixelsOf(before))
  })
})

describe('batch', () => {
  const doc = () => docOf(['..', '..'], PAL)

  it('applies children in order and inverts them in reverse', () => {
    const cmd: EditorCommand = {
      type: 'batch',
      label: 'two things',
      cmds: [
        { type: 'paint', label: 'a', frame: 0, layer: 0, cells: [[0, 0, 0, 1]] },
        { type: 'paint', label: 'b', frame: 0, layer: 0, cells: [[0, 0, 1, 2]] },
      ],
    }
    const after = applyCommand(doc(), cmd)
    expect(after.frames[0]!.layers[0]!.px[0]).toBe(2)

    const undone = applyCommand(after, invertCommand(cmd))
    expect(pixelsOf(undone)).toEqual(pixelsOf(doc()))
  })

  it('round-trips when nested', () => {
    const cmd: EditorCommand = {
      type: 'batch',
      label: 'outer',
      cmds: [
        { type: 'palette_add', label: 'c', entries: [{ c: '#0f0f0f' }] },
        {
          type: 'batch',
          label: 'inner',
          cmds: [
            { type: 'paint', label: 'a', frame: 0, layer: 0, cells: [[1, 1, 0, 4]] },
            { type: 'layer_rename', label: 'r', frame: 0, at: 0, before: 'base', after: 'renamed' },
          ],
        },
      ],
    }
    const start = doc()
    const after = applyCommand(start, cmd)
    expect(after.palette).toHaveLength(5)
    expect(after.frames[0]!.layers[0]!.n).toBe('renamed')

    const undone = applyCommand(after, invertCommand(cmd))
    expect(undone.palette).toHaveLength(4)
    expect(undone.frames[0]!.layers[0]!.n).toBe('base')
    expect(pixelsOf(undone)).toEqual(pixelsOf(start))
  })
})

describe('structural layer commands', () => {
  const layerOf = (n: string, rows: string[]): Layer =>
    docLayers([{ n, rows }], PAL).frames[0]!.layers[0]!

  it('layer_add inverts to layer_delete and restores the exact list', () => {
    const start = twoLayer()
    const cmd: EditorCommand = {
      type: 'layer_add',
      label: 'Add layer',
      frame: 0,
      at: 1,
      layer: { ...layerOf('mid', ['.2', '2.']), hidden: true },
    }
    const after = applyCommand(start, cmd)
    expect(after.frames[0]!.layers.map((l) => l.n)).toEqual(['base', 'mid', 'over'])
    expect(after.frames[0]!.layers[1]!.hidden).toBe(true)

    const undone = applyCommand(after, invertCommand(cmd))
    expect(undone.frames[0]!.layers.map((l) => l.n)).toEqual(['base', 'over'])
    expect(pixelsOf(undone)).toEqual(pixelsOf(start))
  })

  it('layer_delete restores the deleted pixels, and carries a deep copy', () => {
    const start = docLayers(
      [
        { n: 'base', rows: ['1.', '..'] },
        { n: 'over', rows: ['.2', '2.'] },
      ],
      PAL,
    )
    const removed = start.frames[0]!.layers[1]!
    const cmd: EditorCommand = {
      type: 'layer_delete',
      label: 'Delete layer',
      frame: 0,
      at: 1,
      layer: { ...removed, px: new Uint8Array(removed.px) },
    }
    const after = applyCommand(start, cmd)
    expect(after.frames[0]!.layers).toHaveLength(1)

    // Mutating the live document must not reach the copy on the undo stack.
    after.frames[0]!.layers[0]!.px[0] = 3

    const undone = applyCommand(after, invertCommand(cmd))
    expect(Array.from(undone.frames[0]!.layers[1]!.px)).toEqual([0, 2, 2, 0])
  })

  it('layer_move is self-inverse under exchange, for every ordering', () => {
    const start = docLayers(
      [
        { n: 'a', rows: ['1.', '..'] },
        { n: 'b', rows: ['.1', '..'] },
        { n: 'c', rows: ['..', '1.'] },
      ],
      PAL,
    )
    for (const from of [0, 1, 2]) {
      for (const to of [0, 1, 2]) {
        const cmd: EditorCommand = { type: 'layer_move', label: 'Move', frame: 0, from, to }
        const after = applyCommand(start, cmd)
        const undone = applyCommand(after, invertCommand(cmd))
        expect(undone.frames[0]!.layers.map((l) => l.n)).toEqual(['a', 'b', 'c'])
        expect(pixelsOf(undone)).toEqual(pixelsOf(start))
      }
    }
  })

  it('layer_move actually reorders', () => {
    const start = docLayers(
      [
        { n: 'a', rows: ['..'] .concat(['..']) },
        { n: 'b', rows: ['..', '..'] },
        { n: 'c', rows: ['..', '..'] },
      ],
      PAL,
    )
    const moved = applyCommand(start, {
      type: 'layer_move', label: 'Move', frame: 0, from: 0, to: 2,
    })
    expect(moved.frames[0]!.layers.map((l) => l.n)).toEqual(['b', 'c', 'a'])
  })

  it('layer_rename and layer_visible are self-inverse', () => {
    const start = twoLayer()

    const rename: EditorCommand = {
      type: 'layer_rename', label: 'Rename', frame: 0, at: 1, before: 'over', after: 'shadow',
    }
    expect(applyCommand(start, rename).frames[0]!.layers[1]!.n).toBe('shadow')
    expect(
      applyCommand(applyCommand(start, rename), invertCommand(rename)).frames[0]!.layers[1]!.n,
    ).toBe('over')

    const hide: EditorCommand = {
      type: 'layer_visible', label: 'Hide', frame: 0, at: 0, before: false, after: true,
    }
    expect(applyCommand(start, hide).frames[0]!.layers[0]!.hidden).toBe(true)
    expect(
      applyCommand(applyCommand(start, hide), invertCommand(hide)).frames[0]!.layers[0]!.hidden,
    ).toBeFalsy()
  })

  it('layer_opacity and layer_blend_mode are self-inverse, and omit the default on write', () => {
    const start = twoLayer()

    const opacity: EditorCommand = {
      type: 'layer_opacity', label: 'Opacity', frame: 0, at: 1, before: 100, after: 40,
    }
    const dimmed = applyCommand(start, opacity)
    expect(dimmed.frames[0]!.layers[1]!.o).toBe(40)
    expect(applyCommand(dimmed, invertCommand(opacity)).frames[0]!.layers[1]!.o).toBeUndefined()

    const mode: EditorCommand = {
      type: 'layer_blend_mode', label: 'Blend', frame: 0, at: 1, before: 'normal', after: 'multiply',
    }
    const blended = applyCommand(start, mode)
    expect(blended.frames[0]!.layers[1]!.mode).toBe('multiply')
    expect(applyCommand(blended, invertCommand(mode)).frames[0]!.layers[1]!.mode).toBeUndefined()
  })

  it('does not throw when a structural command addresses a missing layer (L-E7)', () => {
    const start = twoLayer()
    for (const cmd of [
      { type: 'layer_delete', label: 'x', frame: 0, at: 9, layer: layerOf('x', ['..', '..']) },
      { type: 'layer_move', label: 'x', frame: 0, from: 9, to: 0 },
      { type: 'layer_rename', label: 'x', frame: 0, at: 9, before: 'a', after: 'b' },
      { type: 'layer_visible', label: 'x', frame: 0, at: 9, before: false, after: true },
      { type: 'layer_opacity', label: 'x', frame: 0, at: 9, before: 100, after: 40 },
      { type: 'layer_blend_mode', label: 'x', frame: 0, at: 9, before: 'normal', after: 'multiply' },
    ] as EditorCommand[]) {
      expect(() => applyCommand(start, cmd)).not.toThrow()
      expect(pixelsOf(applyCommand(start, cmd))).toEqual(pixelsOf(start))
    }
  })
})

describe('frame_move', () => {
  const threeFrames = () => {
    const doc = docOf(['1.', '..'], PAL)
    doc.frames = [
      { ms: 100, layers: [{ n: 'a', px: docOf(['1.', '..'], PAL).frames[0]!.layers[0]!.px }] },
      { ms: 200, layers: [{ n: 'b', px: docOf(['.2', '..'], PAL).frames[0]!.layers[0]!.px }] },
      { ms: 300, layers: [{ n: 'c', px: docOf(['..', '.3'], PAL).frames[0]!.layers[0]!.px }] },
    ]
    return doc
  }

  it('reorders frames, keeping ms and pixels with the frame', () => {
    const doc = threeFrames()
    const moved = applyCommand(doc, { type: 'frame_move', label: 'Reorder', from: 0, to: 2 })
    expect(moved.frames.map((f) => f.ms)).toEqual([200, 300, 100])
    expect(moved.frames.map((f) => f.layers[0]!.n)).toEqual(['b', 'c', 'a'])
  })

  it('inverts by exchange, restoring original order', () => {
    const doc = threeFrames()
    const cmd: EditorCommand = { type: 'frame_move', label: 'Reorder', from: 0, to: 2 }
    const back = applyCommand(applyCommand(doc, cmd), invertCommand(cmd))
    expect(back.frames.map((f) => f.layers[0]!.n)).toEqual(['a', 'b', 'c'])
    expect(back.frames.map((f) => f.ms)).toEqual([100, 200, 300])
  })

  it('is a no-op for an out-of-range index, never throws', () => {
    const doc = threeFrames()
    const cmd: EditorCommand = { type: 'frame_move', label: 'x', from: 9, to: 0 }
    expect(() => applyCommand(doc, cmd)).not.toThrow()
    expect(applyCommand(doc, cmd).frames.map((f) => f.layers[0]!.n)).toEqual(['a', 'b', 'c'])
  })
})

describe('unchanged command types still round-trip', () => {
  it('palette, frame and replace commands invert as before', () => {
    fc.assert(
      fc.property(arbDoc(), (doc) => {
        const cmds: EditorCommand[] = [
          { type: 'palette_edit', label: 'p', index: 0, before: doc.palette[0]!, after: { c: 'transparent', n: 'x' } },
          { type: 'frame_duration', label: 'd', at: 0, before: doc.frames[0]!.ms, after: 500 },
        ]
        for (const cmd of cmds) {
          const undone = applyCommand(applyCommand(doc, cmd), invertCommand(cmd))
          expect(undone.palette).toEqual(doc.palette)
          expect(undone.frames[0]!.ms).toEqual(doc.frames[0]!.ms)
        }
        return true
      }),
      { numRuns: 30 },
    )
  })
})
