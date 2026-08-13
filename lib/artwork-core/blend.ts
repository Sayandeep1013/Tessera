/**
 * Real per-pixel alpha compositing with blend modes, for merge/flatten only.
 * See docs/specs/14-layers.md §12.5.1.
 *
 * Pure — no DOM, no CanvasRenderingContext2D. The renderer gets this for free
 * from the browser's own `globalCompositeOperation`; artwork-core cannot call
 * into that, so the same CSS-Compositing-spec formula is reproduced here,
 * verified in tests against hand-computed values and cross-checked against the
 * real rendered canvas by tools/probe-merge.ts.
 *
 * This is deliberately NOT what `compositeAt` (lib/artwork-core/layers.ts)
 * does. `compositeAt` is the cheap topmost-non-transparent-index answer used
 * everywhere else (eyedropper, exporters, the AI grid) — see 14-layers.md
 * §12.4 for why those call sites stay on the approximation. Merge and flatten
 * are the one place the true blended colour has to be computed, because their
 * whole job is "collapse layers into fewer layers, keeping what it looked
 * like."
 */

import { layerAlpha, layerBlendMode } from './layers'
import { parseHex, type Rgb } from './quantise'
import type { BlendMode, Doc, Layer } from './schema'
import type { Rgba } from './fit-image'

type NonNormalBlend = Exclude<BlendMode, 'normal'>

/** `B(Cb, Cs)` for one channel, 0-255 in, 0-255 out. */
type ChannelBlend = (cb: number, cs: number) => number

const hardLight: ChannelBlend = (cb, cs) =>
  cs <= 127.5 ? (2 * cb * cs) / 255 : 255 - (2 * (255 - cb) * (255 - cs)) / 255

/** Per-channel blend functions. `normal` is handled separately (§12.5.1: it
 *  collapses the whole formula to plain alpha-over, not a per-channel B). */
const CHANNEL_BLEND: Record<NonNormalBlend, ChannelBlend> = {
  multiply: (cb, cs) => (cb * cs) / 255,
  screen: (cb, cs) => cb + cs - (cb * cs) / 255,
  // Overlay is hard-light with its arguments swapped — same definition the
  // CSS Compositing spec uses.
  overlay: (cb, cs) => hardLight(cs, cb),
  darken: (cb, cs) => Math.min(cb, cs),
  lighten: (cb, cs) => Math.max(cb, cs),
  difference: (cb, cs) => Math.abs(cb - cs),
  exclusion: (cb, cs) => cb + cs - (2 * cb * cs) / 255,
}

type Backdrop = { r: number; g: number; b: number; a: number }

/**
 * Composite one source pixel (colour + effective alpha) over a backdrop,
 * under a blend mode. Standard non-premultiplied "over," with the blend
 * function only mixed in where the backdrop already has something to blend
 * against — where it is still fully transparent, the source shows through
 * plain, which is what "nothing is there yet" has to mean.
 */
function over(backdrop: Backdrop, src: Rgb, srcAlpha: number, mode: BlendMode): Backdrop {
  if (srcAlpha <= 0) return backdrop
  const ab = backdrop.a
  const blend = mode === 'normal' ? null : CHANNEL_BLEND[mode]
  const mix = (cb: number, cs: number) => (blend ? (1 - ab) * cs + ab * blend(cb, cs) : cs)
  const csMixed = { r: mix(backdrop.r, src.r), g: mix(backdrop.g, src.g), b: mix(backdrop.b, src.b) }

  const ao = srcAlpha + ab * (1 - srcAlpha)
  if (ao <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const wSrc = srcAlpha / ao
  const wBack = 1 - wSrc
  return {
    r: wBack * backdrop.r + wSrc * csMixed.r,
    g: wBack * backdrop.g + wSrc * csMixed.g,
    b: wBack * backdrop.b + wSrc * csMixed.b,
    a: ao,
  }
}

/**
 * Walk `layers` bottom to top (array order — matches the renderer's own draw
 * loop) compositing every visible pixel with its layer's opacity and blend
 * mode. Returns straight (non-premultiplied) RGBA, one w*h buffer, matching
 * the shape `quantise()` already expects.
 */
export function compositeStack(doc: Doc, layers: readonly Layer[]): Rgba {
  const { w, h } = doc
  const data = new Uint8ClampedArray(w * h * 4)
  const paletteRgb: Array<Rgb & { a: number }> = doc.palette.map((p) => {
    const c = parseHex(p.c)
    return c ?? { r: 0, g: 0, b: 0, a: 0 }
  })

  for (let p = 0; p < w * h; p++) {
    let backdrop: Backdrop = { r: 0, g: 0, b: 0, a: 0 }
    for (const layer of layers) {
      if (layer.hidden) continue
      const idx = layer.px[p]!
      if (idx === 0) continue
      const entry = paletteRgb[idx]
      if (!entry) continue
      const srcAlpha = (entry.a / 255) * layerAlpha(layer)
      backdrop = over(backdrop, entry, srcAlpha, layerBlendMode(layer))
    }
    data[p * 4] = backdrop.r
    data[p * 4 + 1] = backdrop.g
    data[p * 4 + 2] = backdrop.b
    data[p * 4 + 3] = Math.round(backdrop.a * 255)
  }

  return { w, h, data }
}
