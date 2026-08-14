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
import { rasterizeFrame } from './geometry'
import { ok, err, type Doc } from '../artwork-core/schema'
import type { ExportResult } from './types'

export type PngOptions = { scale?: 1 | 2 | 4 | 8 | 16; frame?: number }

export function exportPng(doc: Doc, opts: PngOptions = {}): ExportResult {
  const scale = opts.scale ?? 1
  const frame = opts.frame ?? 0
  if (!doc.frames[frame]) return err(`frame ${frame} does not exist`)

  const { w, h, data } = rasterizeFrame(doc, frame, scale)
  // `Buffer.alloc` zero-fills, i.e. rgba(0,0,0,0) — genuinely transparent
  // (rule 08§1.4) everywhere `rasterizeFrame` did not paint over it.
  const png = new PNG({ width: w, height: h })
  png.data.set(data)

  const bytes = PNG.sync.write(png)
  return ok({
    filename: `${doc.name || 'artwork'}@${scale}x.png`,
    mime: 'image/png',
    data: new Uint8Array(bytes),
  })
}
