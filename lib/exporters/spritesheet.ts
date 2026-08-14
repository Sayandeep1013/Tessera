/**
 * Sprite sheet exporter. See docs/specs/08-exporters.md §8 and §13.1.
 *
 * A sprite sheet is genuinely two files — a tiled PNG and a JSON atlas — and
 * `ExportOk` (§1) carries exactly one. Rather than bend the shared contract
 * for the one format that needs two, this file exports two pure functions
 * that share a layout computation: `exportSpriteSheet` (the PNG) and
 * `exportSpriteSheetAtlas` (the JSON manifest describing it). The popover
 * fires both downloads from one click — §13.1 records the decision.
 */

import { PNG } from 'pngjs/browser'
import { rasterizeFrame } from './geometry'
import { ok, err, type Doc } from '../artwork-core/schema'
import type { ExportResult } from './types'

export type SheetOptions = { columns?: number; padding?: number; spacing?: number }

export type SheetLayout = {
  columns: number
  rows: number
  cellW: number
  cellH: number
  padding: number
  spacing: number
  sheetW: number
  sheetH: number
  /** Top-left of each frame's cell, in sheet pixels, frame order. */
  cells: Array<{ x: number; y: number }>
}

/** The geometry both files describe — one computation, so the PNG's grid and
 *  the atlas's coordinates cannot drift apart. */
export function sheetLayout(doc: Doc, opts: SheetOptions = {}): SheetLayout {
  const count = doc.frames.length
  const columns = Math.max(1, Math.min(opts.columns ?? count, count))
  const rows = Math.ceil(count / columns)
  const padding = Math.max(0, opts.padding ?? 0)
  const spacing = Math.max(0, opts.spacing ?? 0)
  const cellW = doc.w
  const cellH = doc.h

  const cells: Array<{ x: number; y: number }> = []
  for (let i = 0; i < count; i++) {
    const col = i % columns
    const row = Math.floor(i / columns)
    cells.push({
      x: padding + col * (cellW + spacing),
      y: padding + row * (cellH + spacing),
    })
  }

  const sheetW = padding * 2 + columns * cellW + spacing * Math.max(0, columns - 1)
  const sheetH = padding * 2 + rows * cellH + spacing * Math.max(0, rows - 1)

  return { columns, rows, cellW, cellH, padding, spacing, sheetW, sheetH, cells }
}

export function exportSpriteSheet(doc: Doc, opts: SheetOptions = {}): ExportResult {
  if (doc.frames.length === 0) return err('document has no frames')
  const layout = sheetLayout(doc, opts)

  const png = new PNG({ width: layout.sheetW, height: layout.sheetH })
  for (let f = 0; f < doc.frames.length; f++) {
    const { w, h, data } = rasterizeFrame(doc, f)
    const { x: ox, y: oy } = layout.cells[f]!
    for (let y = 0; y < h; y++) {
      const srcRow = y * w * 4
      const dstRow = ((oy + y) * layout.sheetW + ox) * 4
      png.data.set(data.subarray(srcRow, srcRow + w * 4), dstRow)
    }
  }

  const bytes = PNG.sync.write(png)
  return ok({
    filename: `${doc.name || 'artwork'}.sheet.png`,
    mime: 'image/png',
    data: new Uint8Array(bytes),
  })
}

export function exportSpriteSheetAtlas(doc: Doc, opts: SheetOptions = {}): ExportResult {
  if (doc.frames.length === 0) return err('document has no frames')
  const layout = sheetLayout(doc, opts)

  const atlas = {
    w: doc.w,
    h: doc.h,
    frames: doc.frames.map((frame, i) => ({
      x: layout.cells[i]!.x,
      y: layout.cells[i]!.y,
      w: doc.w,
      h: doc.h,
      ms: frame.ms,
    })),
  }

  return ok({
    filename: `${doc.name || 'artwork'}.sheet.json`,
    mime: 'application/json',
    data: JSON.stringify(atlas, null, 2) + '\n',
  })
}
