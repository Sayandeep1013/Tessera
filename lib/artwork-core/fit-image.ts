/**
 * Where a pasted image lands on the canvas, and how it is resampled to get
 * there. See docs/specs/17-file-menu.md §9.2.
 *
 * Pure, like the rest of artwork-core: RGBA in, RGBA out, no canvas, no DOM, no
 * import but the schema's own types. The browser decodes the blob
 * (`lib/editor/clipboard.ts`); everything that decides anything is here, where
 * `npm test` can reach it without a dev server.
 *
 * **The document is never resized to suit the image.** §2 is right about that
 * and it is the whole reason this module exists: the canvas is the artist's
 * decision, and something on the clipboard has no standing to overrule it.
 */

import { resizeOffset } from './resize'

/** Decoded pixels, in the one layout every browser image API produces. */
export type Rgba = {
  w: number
  h: number
  /** Row-major RGBA, length w*h*4, straight (not premultiplied) alpha. */
  data: Uint8ClampedArray
}

/**
 * Where the image ends up on the canvas, and by how much it was scaled.
 *
 * `scale` is reported rather than recomputed by the caller, because §9.6's
 * message quotes the placed size and the two must agree.
 */
export type Placement = {
  /** Top-left of the placed image, in document coordinates. May not be < 0. */
  x: number
  y: number
  /** The placed size. Always >= 1 in each axis. */
  w: number
  h: number
  /** How the source was resampled to get there. */
  mode: 'reduce' | 'enlarge' | 'exact'
}

/**
 * Fit `src` inside `dst`, preserving aspect, centred.
 *
 * Enlargement is by a WHOLE NUMBER or not at all — §9.2. A 13×13 image in a
 * 32×32 canvas is drawn at 2×, not at 2.46×, because a fractional
 * nearest-neighbour enlargement gives some source rows three destination rows
 * and their neighbours two. That unevenness is the single most recognisable way
 * a pasted image announces that software mangled it, and unlike a reduction it
 * is entirely avoidable: nothing forces us to fill the canvas.
 *
 * Reduction has no such choice. The image does not fit, so it is scaled by the
 * exact ratio and box-averaged.
 *
 * Centred with `resizeOffset`, the odd-function truncation A1 wrote for canvas
 * resize — reused rather than rewritten so a spare odd pixel lands the same way
 * in both features.
 */
export function fitRect(srcW: number, srcH: number, dstW: number, dstH: number): Placement {
  // A zero-sized source is not representable; callers reject it before here, and
  // clamping rather than throwing keeps this total like everything else in core.
  const sw = Math.max(1, Math.floor(srcW))
  const sh = Math.max(1, Math.floor(srcH))

  const ratio = Math.min(dstW / sw, dstH / sh)

  let w: number
  let h: number
  let mode: Placement['mode']

  if (ratio < 1) {
    // Reduce. Round rather than floor: a 1000×500 into 32×32 is 32×16 exactly,
    // but 999×500 would floor to 32×15 and lose a row to arithmetic rather than
    // to the fit. Clamped to at least 1 so a very wide image keeps a line.
    w = Math.max(1, Math.min(dstW, Math.round(sw * ratio)))
    h = Math.max(1, Math.min(dstH, Math.round(sh * ratio)))
    mode = 'reduce'
  } else {
    const k = Math.floor(ratio)
    w = sw * k
    h = sh * k
    mode = k === 1 ? 'exact' : 'enlarge'
  }

  return { x: resizeOffset(w, dstW), y: resizeOffset(h, dstH), w, h, mode }
}

/**
 * Resample `src` to exactly `outW` × `outH`.
 *
 * Reducing box-averages; enlarging (and 1:1) takes nearest neighbour. §9.2 is
 * the reasoning; in short, averaging a 31:1 reduction is the difference between
 * a small version of the picture and a sample of noise, and averaging an
 * enlargement invents colours the source does not contain and blurs edges that
 * pixel art draws on purpose.
 *
 * **The average is premultiplied.** Weighting RGB by alpha is what stops the
 * transparent side of an edge — often black, always arbitrary — from bleeding
 * its colour into the visible side. That halo is the standard artefact of every
 * naïve image resizer and it is one multiply to avoid. Where the alpha sum is
 * zero the cell is transparent and its colour is never asked about.
 */
export function resample(src: Rgba, outW: number, outH: number): Rgba {
  const out = new Uint8ClampedArray(outW * outH * 4)

  if (outW >= src.w && outH >= src.h) {
    // Nearest neighbour. Integer by construction when it comes through
    // fitRect, but written for the general case so it is correct on its own.
    for (let y = 0; y < outH; y++) {
      const sy = Math.min(src.h - 1, Math.floor((y * src.h) / outH))
      for (let x = 0; x < outW; x++) {
        const sx = Math.min(src.w - 1, Math.floor((x * src.w) / outW))
        const s = (sy * src.w + sx) * 4
        const d = (y * outW + x) * 4
        out[d] = src.data[s]!
        out[d + 1] = src.data[s + 1]!
        out[d + 2] = src.data[s + 2]!
        out[d + 3] = src.data[s + 3]!
      }
    }
    return { w: outW, h: outH, data: out }
  }

  // Box average. Half-open source ranges per destination cell, so every source
  // pixel is counted exactly once across the whole image — no seams, no pixel
  // contributing to two cells or to none.
  for (let y = 0; y < outH; y++) {
    const y0 = Math.floor((y * src.h) / outH)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.h) / outH))
    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor((x * src.w) / outW)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.w) / outW))

      let ar = 0
      let ag = 0
      let ab = 0
      let aa = 0
      let n = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const s = (sy * src.w + sx) * 4
          const a = src.data[s + 3]!
          ar += src.data[s]! * a
          ag += src.data[s + 1]! * a
          ab += src.data[s + 2]! * a
          aa += a
          n++
        }
      }

      const d = (y * outW + x) * 4
      if (aa === 0) continue // fully transparent: leave 0,0,0,0
      out[d] = Math.round(ar / aa)
      out[d + 1] = Math.round(ag / aa)
      out[d + 2] = Math.round(ab / aa)
      out[d + 3] = Math.round(aa / n)
    }
  }

  return { w: outW, h: outH, data: out }
}

/**
 * The whole fit: resample the source and place it on a `dstW` × `dstH` field.
 *
 * Everything outside the placed rectangle is left fully transparent, which
 * `paste-image.ts` then declines to write at all (§9.4) — so a paste composites
 * over the drawing rather than punching a rectangular hole in it.
 */
export function fitImage(src: Rgba, dstW: number, dstH: number): { rgba: Rgba; at: Placement } {
  const at = fitRect(src.w, src.h, dstW, dstH)
  const scaled = resample(src, at.w, at.h)
  const data = new Uint8ClampedArray(dstW * dstH * 4)

  for (let y = 0; y < at.h; y++) {
    const ty = y + at.y
    if (ty < 0 || ty >= dstH) continue
    for (let x = 0; x < at.w; x++) {
      const tx = x + at.x
      if (tx < 0 || tx >= dstW) continue
      const s = (y * at.w + x) * 4
      const d = (ty * dstW + tx) * 4
      data[d] = scaled.data[s]!
      data[d + 1] = scaled.data[s + 1]!
      data[d + 2] = scaled.data[s + 2]!
      data[d + 3] = scaled.data[s + 3]!
    }
  }

  return { rgba: { w: dstW, h: dstH, data }, at }
}
