/**
 * Shared plumbing for every exporter. See docs/specs/08-exporters.md §1 and §12.1.
 *
 * The only module one exporter may depend on that another also needs — rule
 * 08§1.2 forbids an exporter importing another exporter, so anything shared
 * lives here instead. Both functions are pure: no store, no DOM, no network.
 */

import { compositeAt } from '../artwork-core/layers'
import type { Doc } from '../artwork-core/schema'

export type Run = { x: number; y: number; len: number; i: number }

/**
 * One run per maximal horizontal stretch of the same non-transparent palette
 * index. Skips index 0 — there is nothing to draw there, and every exporter
 * that calls this wants exactly the cells worth drawing.
 */
export function horizontalRuns(px: Uint8Array, w: number, h: number): Run[] {
  const runs: Run[] = []
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      const i = px[y * w + x]!
      if (i === 0) {
        x++
        continue
      }
      let len = 1
      while (x + len < w && px[y * w + x + len] === i) len++
      runs.push({ x, y, len, i })
      x += len
    }
  }
  return runs
}

/**
 * What every exporter but JSON actually draws: the palette index visible at
 * each cell, flattened from the frame's layer stack to one value per pixel.
 *
 * §12.1: this is `compositeAt` ([14-layers §3](../../docs/specs/14-layers.md)),
 * the same topmost-non-transparent-wins rule the eyedropper samples by — not a
 * true alpha blend across overlapping semi-transparent layers, which layers
 * phase 1 has no opacity field to make necessary yet.
 */
export function flattenFrame(doc: Doc, frame: number): Uint8Array {
  const out = new Uint8Array(doc.w * doc.h)
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      out[y * doc.w + x] = compositeAt(doc, frame, x, y)
    }
  }
  return out
}
