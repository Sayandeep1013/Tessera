/**
 * Change a document's dimensions, keeping the art centred.
 *
 * See docs/specs/16-settings.md §4. Pure, like everything else in artwork-core:
 * returns a new document and never touches the one passed in.
 *
 * The whole operation is one offset applied to every layer of every frame.
 * `w` and `h` live on the DOCUMENT, not the frame, so a document whose frames
 * disagreed about their size would not be representable — a partial resize is
 * not a degraded state, it is a corrupt one. Hence one pass that rebuilds the
 * entire frames array, and no early return that could leave half of it done.
 */

import type { Doc, Frame, Layer } from './schema'

/**
 * Where the old canvas lands inside the new one.
 *
 * Centred, with an odd difference biased so that growing and shrinking are
 * exact inverses. That requires an ODD function — `f(d) === -f(-d)` — and
 * `Math.trunc` is one where `Math.floor` is not: floor(0.5) is 0 but
 * floor(-0.5) is -1, so 16 -> 17 -> 16 would move the artwork a pixel every
 * round trip. The exhaustive test over every size pair 1..40 caught exactly
 * that, which is what it was written for.
 *
 * Truncation biases toward zero, so an odd growth puts the spare pixel
 * bottom-right. Arbitrary, but deterministic and therefore testable, which is
 * the property that matters.
 *
 * `| 0` rather than `Math.trunc`, and not for speed: trunc(-0.5) returns -0,
 * and -0 is not 0 under Object.is, so `resizeOffset(17, 16)` compared unequal
 * to zero in a test that was right to complain. A bitwise truncate returns +0.
 * Canvas dimensions are far inside the 32-bit range this relies on.
 */
export const resizeOffset = (from: number, to: number): number => ((to - from) / 2) | 0

function resizeLayer(layer: Layer, fromW: number, fromH: number, toW: number, toH: number): Layer {
  const px = new Uint8Array(toW * toH) // zero-filled: new area is transparent
  const dx = resizeOffset(fromW, toW)
  const dy = resizeOffset(fromH, toH)

  // Iterate the SOURCE and skip what falls outside, rather than iterating the
  // destination and guarding reads. Same result, but a crop then costs the size
  // of the old canvas instead of the new one, and the bounds test reads as
  // "does this pixel survive" — which is the actual question.
  for (let y = 0; y < fromH; y++) {
    const ty = y + dy
    if (ty < 0 || ty >= toH) continue
    for (let x = 0; x < fromW; x++) {
      const tx = x + dx
      if (tx < 0 || tx >= toW) continue
      px[ty * toW + tx] = layer.px[y * fromW + x]!
    }
  }

  return { ...layer, px }
}

/** A new document at `w` x `h`, with every layer of every frame recentred. */
export function resizeDoc(doc: Doc, w: number, h: number): Doc {
  const frames: Frame[] = doc.frames.map((f) => ({
    ms: f.ms,
    layers: f.layers.map((l) => resizeLayer(l, doc.w, doc.h, w, h)),
  }))
  return { ...doc, w, h, frames }
}

/**
 * How many painted pixels a resize would destroy.
 *
 * Answered BEFORE the resize happens, so the button can say so — spec 16 S-E2.
 * Rule 7 is about never silently discarding artwork, and a crop is the one
 * operation here that discards it on purpose; the least it can do is say how
 * much. Counts a pixel once even when several layers lose one at that spot,
 * because the number is for a human deciding whether to proceed, not for a
 * progress bar.
 */
export function pixelsLostOnResize(doc: Doc, w: number, h: number): number {
  const dx = resizeOffset(doc.w, w)
  const dy = resizeOffset(doc.h, h)
  if (dx >= 0 && dy >= 0 && w >= doc.w && h >= doc.h) return 0 // pure growth

  const lost = new Set<number>()
  for (const frame of doc.frames) {
    for (const layer of frame.layers) {
      for (let y = 0; y < doc.h; y++) {
        const ty = y + dy
        for (let x = 0; x < doc.w; x++) {
          if (layer.px[y * doc.w + x] === 0) continue // transparent loses nothing
          const tx = x + dx
          if (tx < 0 || tx >= w || ty < 0 || ty >= h) lost.add(y * doc.w + x)
        }
      }
    }
  }
  return lost.size
}
