/**
 * SVG exporter. See docs/specs/08-exporters.md §3.
 *
 * One `<rect>` per horizontal run, grouped by colour in palette-index order —
 * stable and diffable rather than in scan order, which is why this does not
 * reuse `lib/renderer/sprite-svg.ts` (that module also merges vertically, for
 * a favicon; this one deliberately does not, per §3).
 */

import { flattenFrame, horizontalRuns, type Run } from './geometry'
import { splitColor, type ExportResult } from './types'
import { ok, err, type Doc } from '../artwork-core/schema'

export type SvgOptions = { frame?: number; pixelSize?: number; optimize?: boolean }

/** §3: `optimize: false` — one rect per pixel, to prove the optimiser behaviour-neutral. */
function perPixelRuns(px: Uint8Array, w: number, h: number): Run[] {
  const runs: Run[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = px[y * w + x]!
      if (i !== 0) runs.push({ x, y, len: 1, i })
    }
  }
  return runs
}

export function exportSvg(doc: Doc, opts: SvgOptions = {}): ExportResult {
  const frame = opts.frame ?? 0
  const pixelSize = opts.pixelSize ?? 1
  const optimize = opts.optimize ?? true
  if (!doc.frames[frame]) return err(`frame ${frame} does not exist`)

  const flat = flattenFrame(doc, frame)
  const runs = optimize ? horizontalRuns(flat, doc.w, doc.h) : perPixelRuns(flat, doc.w, doc.h)

  const byIndex = new Map<number, Run[]>()
  for (const r of runs) {
    const bucket = byIndex.get(r.i)
    if (bucket) bucket.push(r)
    else byIndex.set(r.i, [r])
  }

  const rects: string[] = []
  for (const i of [...byIndex.keys()].sort((a, b) => a - b)) {
    const { fill, opacity } = splitColor(doc.palette[i]!.c)
    const opacityAttr = opacity !== undefined ? ` fill-opacity="${opacity}"` : ''
    for (const r of byIndex.get(i)!) {
      rects.push(`<rect x="${r.x}" y="${r.y}" width="${r.len}" height="1" fill="${fill}"${opacityAttr}/>`)
    }
  }

  const w = doc.w * pixelSize
  const h = doc.h * pixelSize
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.w} ${doc.h}" ` +
    `width="${w}" height="${h}" shape-rendering="crispEdges">${rects.join('')}</svg>`

  return ok({ filename: `${doc.name || 'artwork'}.svg`, mime: 'image/svg+xml', data: svg })
}
