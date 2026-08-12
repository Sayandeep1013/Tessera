import { describe, expect, it } from 'vitest'
import { PASTE_LABEL, pasteImageCommand } from '../paste-image'
import { applyCommand, invertCommand } from '../commands'
import { parseDoc, serializeDoc } from '../codec'
import { createDoc, DEFAULT_PALETTE } from '../create'
import { MAX_PALETTE, type Doc, type PaletteEntry } from '../schema'
import type { Rgba } from '../fit-image'
import { docLayers } from './helpers'

function image(w: number, h: number, at: (x: number, y: number) => [number, number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = at(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { w, h, data }
}

const solid = (w: number, h: number, c: [number, number, number, number]) => image(w, h, () => c)

const doc32 = () => createDoc({ id: 'p', w: 32, h: 32, now: '2026-08-12T00:00:00.000Z' })
const px = (d: Doc, layer = 0) => Array.from(d.frames[0]!.layers[layer]!.px)

describe('pasteImageCommand — one command, one undo', () => {
  it('is a plain paint when no colour had to be added', () => {
    // The default palette's own ink, so every pixel reuses an existing entry.
    const src = solid(32, 32, [0x1a, 0x1c, 0x2c, 255])
    const { cmd, result } = pasteImageCommand(doc32(), 0, 0, src)
    expect(cmd?.type).toBe('paint')
    expect(result.added).toBe(0)
    expect(result.colours).toBe(1)
  })

  it('is a batch that adds the colours before it uses them', () => {
    const { cmd } = pasteImageCommand(doc32(), 0, 0, solid(32, 32, [0xd0, 0x10, 0x90, 255]))
    expect(cmd?.type).toBe('batch')
    if (cmd?.type !== 'batch') throw new Error('unreachable')
    expect(cmd.cmds.map((c) => c.type)).toEqual(['palette_add', 'paint'])
  })

  it('labels itself so the undo entry says what it was', () => {
    const { cmd } = pasteImageCommand(doc32(), 0, 0, solid(4, 4, [1, 2, 3, 255]))
    expect(cmd?.label).toBe(PASTE_LABEL)
  })

  /**
   * The bug this repo already shipped once, in `invertCommand('ai_edit')`
   * (14-layers.md §0.2): the palette entry came back off but the pixels
   * referencing it stayed, and the next load failed to parse. Paste is the
   * second command that adds colours and pixels together, so it gets the same
   * test — serialise the undone document and parse it back, which is the only
   * check that actually catches it.
   */
  it('undoes byte-exactly, palette included, and the result still parses', () => {
    const before = doc32()
    const json = serializeDoc(before)
    const { cmd } = pasteImageCommand(before, 0, 0, solid(1000, 500, [0xd0, 0x10, 0x90, 255]))
    expect(cmd).not.toBeNull()

    const after = applyCommand(before, cmd!)
    expect(after.palette.length).toBeGreaterThan(before.palette.length)

    const undone = applyCommand(after, invertCommand(cmd!))
    expect(undone.palette).toEqual(before.palette)
    expect(px(undone)).toEqual(px(before))

    const reparsed = parseDoc(serializeDoc(undone))
    expect(reparsed.ok).toBe(true)
    // meta.updatedAt moves with any command, so compare everything else.
    expect(serializeDoc(undone).replace(/"updatedAt":.*/, ''))
      .toBe(json.replace(/"updatedAt":.*/, ''))
  })

  it('redoes to exactly what it produced the first time', () => {
    const before = doc32()
    const { cmd } = pasteImageCommand(before, 0, 0, solid(64, 32, [0x20, 0xc0, 0x40, 255]))
    const after = applyCommand(before, cmd!)
    const again = applyCommand(applyCommand(after, invertCommand(cmd!)), cmd!)
    expect(px(again)).toEqual(px(after))
    expect(again.palette).toEqual(after.palette)
  })
})

describe('pasteImageCommand — what it writes and what it leaves alone', () => {
  it('composites: a transparent source pixel leaves the drawing underneath (§9.4)', () => {
    const doc = docLayers([{ n: 'base', rows: ['22', '22'] }], [
      { c: 'transparent' }, { c: '#000000' }, { c: '#ffffff' },
    ] as PaletteEntry[])
    // Top-left opaque, the rest transparent.
    const src = image(2, 2, (x, y) => (x === 0 && y === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0]))
    const { cmd, result } = pasteImageCommand(doc, 0, 0, src)
    const after = applyCommand(doc, cmd!)
    expect(px(after)[0]).not.toBe(2) // overwritten
    expect(px(after).slice(1)).toEqual([2, 2, 2]) // untouched
    expect(result.cells).toBe(1)
  })

  it('lands on the active layer, not on layer 0', () => {
    const doc = docLayers(
      [{ n: 'base', rows: ['..', '..'] }, { n: 'top', rows: ['..', '..'] }],
      [{ c: 'transparent' }, { c: '#000000' }] as PaletteEntry[],
    )
    const { cmd } = pasteImageCommand(doc, 0, 1, solid(2, 2, [0, 0, 0, 255]))
    const after = applyCommand(doc, cmd!)
    expect(px(after, 0)).toEqual([0, 0, 0, 0])
    expect(px(after, 1)).toEqual([1, 1, 1, 1])
  })

  it('never resizes the document — §2', () => {
    const before = doc32()
    const { cmd, result } = pasteImageCommand(before, 0, 0, solid(1000, 500, [7, 7, 7, 255]))
    const after = applyCommand(before, cmd!)
    expect([after.w, after.h]).toEqual([32, 32])
    expect([result.at.w, result.at.h]).toEqual([32, 16])
  })

  it('does nothing at all for a wholly transparent image', () => {
    const { cmd, result } = pasteImageCommand(doc32(), 0, 0, solid(8, 8, [9, 9, 9, 0]))
    expect(cmd).toBeNull()
    expect(result.cells).toBe(0)
    expect(result.colours).toBe(0)
    expect(result.added).toBe(0)
  })

  it('does nothing when the paste matches what is already there', () => {
    const first = pasteImageCommand(doc32(), 0, 0, solid(32, 32, [0xd0, 0x10, 0x90, 255]))
    const after = applyCommand(doc32(), first.cmd!)
    const second = pasteImageCommand(after, 0, 0, solid(32, 32, [0xd0, 0x10, 0x90, 255]))
    expect(second.cmd).toBeNull()
    expect(second.result.added).toBe(0)
  })

  it('is total on a layer that is not there', () => {
    expect(pasteImageCommand(doc32(), 0, 9, solid(4, 4, [1, 1, 1, 255])).cmd).toBeNull()
    expect(pasteImageCommand(doc32(), 7, 0, solid(4, 4, [1, 1, 1, 255])).cmd).toBeNull()
  })
})

describe('pasteImageCommand — the palette is the hard constraint', () => {
  it('never takes the document past 36 entries', () => {
    const before = doc32()
    const src = image(200, 200, (x, y) => [(x * 7) % 256, (y * 11) % 256, ((x + y) * 13) % 256, 255])
    const after = applyCommand(before, pasteImageCommand(before, 0, 0, src).cmd!)
    expect(after.palette.length).toBeLessThanOrEqual(MAX_PALETTE)
    expect(parseDoc(serializeDoc(after)).ok).toBe(true)
  })

  it('says when it had to snap to colours already in the palette', () => {
    const full: PaletteEntry[] = [
      { c: 'transparent' },
      ...Array.from({ length: MAX_PALETTE - 1 }, (_, i) => ({
        c: `#${((i * 0x0a1f3d) & 0xffffff).toString(16).padStart(6, '0')}`,
      })),
    ]
    const doc = createDoc({ id: 'q', w: 16, h: 16, palette: full })
    const src = image(64, 64, (x, y) => [(x * 3) % 256, (y * 5) % 256, ((x * y) * 7) % 256, 255])
    const { result } = pasteImageCommand(doc, 0, 0, src)
    expect(result.clipped).toBe(true)
    expect(result.added).toBe(0)
  })

  it('reuses before adding, so a near-miss of an existing colour costs no slot', () => {
    const before = createDoc({ id: 'r', w: 4, h: 4, palette: DEFAULT_PALETTE })
    // Four levels off the palette's ink in each channel.
    const { result } = pasteImageCommand(before, 0, 0, solid(4, 4, [0x1e, 0x20, 0x30, 255]))
    expect(result.added).toBe(0)
    expect(result.colours).toBe(1)
  })

  it('every index it writes resolves to a real palette entry', () => {
    const before = doc32()
    const src = image(97, 61, (x, y) => [(x * 17) % 256, (y * 29) % 256, ((x ^ y) * 3) % 256, 255])
    const after = applyCommand(before, pasteImageCommand(before, 0, 0, src).cmd!)
    for (const i of after.frames[0]!.layers[0]!.px) expect(i).toBeLessThan(after.palette.length)
  })
})

describe('pasteImageCommand — what it reports', () => {
  it('carries the source size and the placed size', () => {
    const { result } = pasteImageCommand(doc32(), 0, 0, solid(1000, 500, [1, 2, 3, 255]))
    expect(result.src).toEqual({ w: 1000, h: 500 })
    expect(result.at).toMatchObject({ w: 32, h: 16, mode: 'reduce' })
  })

  it('reports a real reduction rather than pretending nothing was lost (F-M3)', () => {
    const src = image(120, 120, (x, y) => [(x * 2) % 256, (y * 2) % 256, ((x + y) * 2) % 256, 255])
    const { result } = pasteImageCommand(doc32(), 0, 0, src)
    expect(result.sourceColours).toBeGreaterThan(result.colours)
    expect(result.colours).toBeLessThanOrEqual(MAX_PALETTE - 1)
  })

  it('is deterministic — the same image twice gives the same command', () => {
    const src = image(53, 31, (x, y) => [(x * 9) % 256, (y * 19) % 256, ((x * y) % 251), 255])
    const a = pasteImageCommand(doc32(), 0, 0, src)
    const b = pasteImageCommand(doc32(), 0, 0, src)
    expect(JSON.stringify(a.cmd)).toBe(JSON.stringify(b.cmd))
    expect(a.result).toEqual(b.result)
  })
})
