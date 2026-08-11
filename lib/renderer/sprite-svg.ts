/**
 * Render a document to SVG. See docs/specs/13-visual-identity.md.
 *
 * Pure and dependency-free, so it runs in a React component, in a build script,
 * and in a test without three implementations. Horizontal runs are merged, which
 * matters for a favicon: the logo goes from 256 rects to 12.
 *
 * `shapeRendering="crispEdges"` is what keeps a pixel a pixel — without it the
 * browser antialiases rect boundaries and the mark blurs at small sizes.
 */

import type { Doc } from '../artwork-core/schema'

export type Rect = { x: number; y: number; w: number; h: number; fill: string }

/**
 * Merged runs of non-transparent cells, in draw order.
 *
 * Two passes: horizontal runs first, then rows stacked where a run repeats
 * directly below one of identical x, width and colour. The logo goes from 256
 * cells to 24 rects to 4 — which is the whole file for a favicon.
 */
export function spriteRects(doc: Doc, frame = 0): Rect[] {
  const rects: Rect[] = []
  const f = doc.frames[frame]
  if (!f) return rects

  for (const layer of f.layers) {
    if (layer.hidden) continue

    // `open` holds, per starting x, a rect still being extended downward.
    let open = new Map<number, Rect>()

    for (let y = 0; y < doc.h; y++) {
      const next = new Map<number, Rect>()
      let x = 0
      while (x < doc.w) {
        const i = layer.px[y * doc.w + x]!
        const colour = doc.palette[i]?.c
        if (i === 0 || !colour || colour === 'transparent') {
          x++
          continue
        }
        let run = 1
        while (x + run < doc.w && layer.px[y * doc.w + x + run] === i) run++

        const above = open.get(x)
        if (above && above.w === run && above.fill === colour) {
          above.h++
          next.set(x, above)
        } else {
          const rect = { x, y, w: run, h: 1, fill: colour }
          rects.push(rect)
          next.set(x, rect)
        }
        x += run
      }
      open = next
    }
  }
  return rects
}

/** A complete standalone SVG document — used for the favicon. */
export function spriteToSvg(doc: Doc, frame = 0): string {
  const body = spriteRects(doc, frame)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`)
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.w} ${doc.h}" ` +
    `shape-rendering="crispEdges">${body}</svg>`
  )
}
