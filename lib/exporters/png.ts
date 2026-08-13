/**
 * PNG exporter. See docs/specs/08-exporters.md §2 and §12.4.
 *
 * Encodes with `pngjs/browser` rather than a `<canvas>` — a canvas is DOM and
 * cannot run in the Node test process, so it fails rule 1 (pure) and §11's
 * "golden test each" in the same stroke. `pngjs/browser` is a self-contained
 * build that runs unmodified in both, which is the "one PNG encoder, not two"
 * this section originally asked for.
 */

import { PNG } from 'pngjs/browser'
import { flattenFrame, horizontalRuns } from './geometry'
import { ok, err, type Doc } from '../artwork-core/schema'
import type { ExportResult } from './types'

export type PngOptions = { scale?: 1 | 2 | 4 | 8 | 16; frame?: number }

function colourToRgba(c: string): [number, number, number, number] {
  const r = parseInt(c.slice(1, 3), 16)
  const g = parseInt(c.slice(3, 5), 16)
  const b = parseInt(c.slice(5, 7), 16)
  const a = c.length === 9 ? parseInt(c.slice(7, 9), 16) : 255
  return [r, g, b, a]
}

export function exportPng(doc: Doc, opts: PngOptions = {}): ExportResult {
  const scale = opts.scale ?? 1
  const frame = opts.frame ?? 0
  if (!doc.frames[frame]) return err(`frame ${frame} does not exist`)

  const flat = flattenFrame(doc, frame)
  const w = doc.w * scale
  const h = doc.h * scale

  // `Buffer.alloc` zero-fills, i.e. rgba(0,0,0,0) — genuinely transparent
  // (rule 08§1.4) everywhere a run does not paint over it.
  const png = new PNG({ width: w, height: h })

  for (const r of horizontalRuns(flat, doc.w, doc.h)) {
    const [red, green, blue, alpha] = colourToRgba(doc.palette[r.i]!.c)
    for (let sy = 0; sy < scale; sy++) {
      const py = r.y * scale + sy
      const rowStart = (py * w + r.x * scale) * 4
      for (let sx = 0; sx < r.len * scale; sx++) {
        const i = rowStart + sx * 4
        png.data[i] = red
        png.data[i + 1] = green
        png.data[i + 2] = blue
        png.data[i + 3] = alpha
      }
    }
  }

  const bytes = PNG.sync.write(png)
  return ok({
    filename: `${doc.name || 'artwork'}@${scale}x.png`,
    mime: 'image/png',
    data: new Uint8Array(bytes),
  })
}
