import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs/browser'
import { exportSpriteSheet, exportSpriteSheetAtlas, sheetLayout } from '../spritesheet'
import { createDoc } from '../../artwork-core/create'
import { docFrom } from './helpers'
import type { Doc } from '../../artwork-core/schema'

function decode(data: string | Uint8Array) {
  return PNG.sync.read(Buffer.from(data as Uint8Array))
}

/** Three 1×1 frames: red, green, blue. */
function threeFrameDoc(): Doc {
  const base = docFrom(['1'], ['transparent', '#ff0000'])
  return {
    ...base,
    palette: [{ c: 'transparent' }, { c: '#ff0000' }, { c: '#00ff00' }, { c: '#0000ff' }],
    frames: [
      { ms: 100, layers: [{ n: 'L0', px: new Uint8Array([1]) }] },
      { ms: 200, layers: [{ n: 'L0', px: new Uint8Array([2]) }] },
      { ms: 300, layers: [{ n: 'L0', px: new Uint8Array([3]) }] },
    ],
  }
}

describe('sheetLayout', () => {
  it('defaults to one row, one column per frame', () => {
    const layout = sheetLayout(threeFrameDoc())
    expect(layout.columns).toBe(3)
    expect(layout.rows).toBe(1)
    expect(layout.cells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])
    expect([layout.sheetW, layout.sheetH]).toEqual([3, 1])
  })

  it('wraps to a second row once columns is smaller than the frame count', () => {
    const layout = sheetLayout(threeFrameDoc(), { columns: 2 })
    expect(layout.rows).toBe(2)
    expect(layout.cells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])
    expect([layout.sheetW, layout.sheetH]).toEqual([2, 2])
  })

  it('padding insets the edge, spacing separates cells — both default to 0', () => {
    const layout = sheetLayout(threeFrameDoc(), { padding: 2, spacing: 1 })
    expect(layout.cells).toEqual([{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 6, y: 2 }])
    // 3 cells of width 1 + 2 gaps of 1 + 2*padding of 2
    expect(layout.sheetW).toBe(2 * 2 + 3 * 1 + 2 * 1)
  })

  it('a columns count above the frame count is clamped down to it', () => {
    expect(sheetLayout(threeFrameDoc(), { columns: 99 }).columns).toBe(3)
  })
})

describe('exportSpriteSheet (PNG)', () => {
  it('tiles each frame into its own cell, left to right', () => {
    const r = exportSpriteSheet(threeFrameDoc())
    if (!r.ok) throw new Error(r.error)
    const png = decode(r.value.data)
    expect([png.width, png.height]).toEqual([3, 1])
    expect([...png.data.subarray(0, 4)]).toEqual([255, 0, 0, 255])
    expect([...png.data.subarray(4, 8)]).toEqual([0, 255, 0, 255])
    expect([...png.data.subarray(8, 12)]).toEqual([0, 0, 255, 255])
  })

  it('filename ends .sheet.png', () => {
    const r = exportSpriteSheet(threeFrameDoc())
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename).toBe('test.sheet.png')
  })

  it('rejects a document with no frames', () => {
    const doc = { ...threeFrameDoc(), frames: [] }
    expect(exportSpriteSheet(doc).ok).toBe(false)
  })

  it('a single-frame document still produces a 1-cell sheet', () => {
    const doc = createDoc({ id: 't', name: 'solo' })
    const r = exportSpriteSheet(doc)
    if (!r.ok) throw new Error(r.error)
    const png = decode(r.value.data)
    expect([png.width, png.height]).toEqual([doc.w, doc.h])
  })
})

describe('exportSpriteSheetAtlas (JSON)', () => {
  it('describes every frame at the same coordinates the PNG placed it at', () => {
    const doc = threeFrameDoc()
    const r = exportSpriteSheetAtlas(doc)
    if (!r.ok) throw new Error(r.error)
    const atlas = JSON.parse(r.value.data as string)
    expect(atlas).toEqual({
      w: 1,
      h: 1,
      frames: [
        { x: 0, y: 0, w: 1, h: 1, ms: 100 },
        { x: 1, y: 0, w: 1, h: 1, ms: 200 },
        { x: 2, y: 0, w: 1, h: 1, ms: 300 },
      ],
    })
  })

  it('filename ends .sheet.json', () => {
    const r = exportSpriteSheetAtlas(threeFrameDoc())
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename).toBe('test.sheet.json')
  })

  it('agrees with the PNG on columns/rows for a wrapped layout', () => {
    const doc = threeFrameDoc()
    const r = exportSpriteSheetAtlas(doc, { columns: 2 })
    if (!r.ok) throw new Error(r.error)
    const atlas = JSON.parse(r.value.data as string) as { frames: Array<{ x: number; y: number }> }
    expect(atlas.frames.map((f) => [f.x, f.y])).toEqual([[0, 0], [1, 0], [0, 1]])
  })
})
