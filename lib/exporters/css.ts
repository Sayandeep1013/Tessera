/**
 * CSS exporter — the `box-shadow` technique. See docs/specs/08-exporters.md §4.
 *
 * One shadow per pixel, not per run: `box-shadow` has no width. `--p` is the
 * size of one artwork pixel in real CSS px, set directly rather than staying
 * at 1px behind a `transform: scale(...)` — the spec's illustrative snippet
 * does the latter, but the two produce the same picture with one fewer moving
 * part, and there is nothing else in this codebase that would need `--p` to
 * stay a hairline. Palette entries actually used become custom properties, so
 * recolouring the export is a one-line change.
 */

import { flattenFrame } from './geometry'
import { formatPct, frameWindows, hardCutEpsilon } from './timeline'
import type { ExportResult } from './types'
import { ok, err, type Doc } from '../artwork-core/schema'

export type CssOptions = {
  frame?: number
  className?: string
  pixelSize?: number
  /** Phase 5 (§13.4): one `@keyframes` cycling `box-shadow` across every
   *  frame. Ignores `frame` — the whole document animates, not one picture
   *  from it. */
  animated?: boolean
}

/** §4: above this many painted pixels, a warning — the file still exports.
 *  For an animated export this counts every frame's pixels together (§13.4):
 *  all of them ship in the one stylesheet at once, even though only one
 *  frame is ever visible, so that is the number that actually has to parse. */
export const CSS_WARN_PIXELS = 4096
/** §4: above this many, the export refuses rather than shipping something that hangs a tab. */
export const CSS_ERROR_PIXELS = 16384

function paintedIndices(flat: Uint8Array): { count: number; used: Set<number> } {
  const used = new Set<number>()
  let count = 0
  for (const i of flat) {
    if (i === 0) continue
    count++
    used.add(i)
  }
  return { count, used }
}

function shadowList(flat: Uint8Array, w: number, h: number): string[] {
  const shadows: string[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = flat[y * w + x]!
      if (i === 0) continue
      // token-exempt: --p / --c are custom properties in the FILE THIS EXPORTS,
      // not this app's own design tokens.
      shadows.push(`calc(var(--p) * ${x}) calc(var(--p) * ${y}) 0 0 var(--c${i})`)
    }
  }
  return shadows
}

function boxShadowValue(shadows: string[]): string {
  return shadows.length ? shadows.join(', ') : 'none'
}

export function exportCss(doc: Doc, opts: CssOptions = {}): ExportResult {
  const className = opts.className || 'pixel-art'
  const pixelSize = opts.pixelSize ?? 8

  if (opts.animated) {
    if (doc.frames.length === 0) return err('document has no frames')
    const flats = doc.frames.map((_, i) => flattenFrame(doc, i))
    const used = new Set<number>()
    let totalCount = 0
    for (const flat of flats) {
      const p = paintedIndices(flat)
      totalCount += p.count
      for (const i of p.used) used.add(i)
    }

    if (totalCount > CSS_ERROR_PIXELS) {
      return err(
        `${totalCount} painted pixels across every frame is too many for box-shadow CSS ` +
        `(limit ${CSS_ERROR_PIXELS}) — export SVG instead, or an animated PNG.`,
      )
    }

    const indices = [...used].sort((a, b) => a - b)
    const vars = indices.map((i) => `  --c${i}: ${doc.palette[i]!.c};`)
    const totalMs = doc.frames.reduce((sum, f) => sum + f.ms, 0)
    const windows = frameWindows(doc.frames)

    // §13.4: two keyframes per frame — hold from its own `start`, hard-cut
    // (`hardCutEpsilon`) to the next frame's value just before `end`. The
    // first frame's `start` is always 0% and the last frame's `end` is
    // always 100%, so those need no special-casing; only the last frame
    // needs an explicit 100% stop, since nothing after it would otherwise
    // hold the value past its own `end - eps` point.
    const stops: string[] = []
    doc.frames.forEach((_, i) => {
      const { start, end } = windows[i]!
      const value = boxShadowValue(shadowList(flats[i]!, doc.w, doc.h))
      const eps = hardCutEpsilon(end - start)
      stops.push(`${formatPct(start)}% { box-shadow: ${value}; }`)
      stops.push(`${formatPct(Math.min(100, end - eps))}% { box-shadow: ${value}; }`)
      if (i === doc.frames.length - 1) stops.push(`100% { box-shadow: ${value}; }`)
    })

    const css = [
      `.${className} {`,
      `  --p: ${pixelSize}px;`,
      ...vars,
      // token-exempt: --p is this exported file's own property, not this app's.
      `  width: var(--p);`,
      `  height: var(--p);`,
      `  animation: ${className}-frames ${totalMs}ms linear infinite;`,
      `}`,
      '',
      `@keyframes ${className}-frames {`,
      ...stops.map((s) => `  ${s}`),
      `}`,
      '',
    ].join('\n')

    const warning = totalCount > CSS_WARN_PIXELS
      ? `${totalCount} shadows across ${doc.frames.length} frames — large enough that this stylesheet may render slowly.`
      : undefined

    return ok({ filename: `${doc.name || 'artwork'}.css`, mime: 'text/css', data: css, warning })
  }

  const frame = opts.frame ?? 0
  if (!doc.frames[frame]) return err(`frame ${frame} does not exist`)

  const flat = flattenFrame(doc, frame)
  const { count, used } = paintedIndices(flat)

  if (count > CSS_ERROR_PIXELS) {
    return err(
      `${count} painted pixels is too many for box-shadow CSS (limit ${CSS_ERROR_PIXELS}) — export SVG instead.`,
    )
  }

  const indices = [...used].sort((a, b) => a - b)
  const vars = indices.map((i) => `  --c${i}: ${doc.palette[i]!.c};`)
  const shadows = shadowList(flat, doc.w, doc.h)

  const css = [
    `.${className} {`,
    `  --p: ${pixelSize}px;`,
    ...vars,
    // token-exempt: same as above — --p is this exported file's own property.
    `  width: var(--p);`,
    `  height: var(--p);`,
    shadows.length ? `  box-shadow:\n    ${shadows.join(',\n    ')};` : `  box-shadow: none;`,
    `}`,
    '',
  ].join('\n')

  const warning = count > CSS_WARN_PIXELS
    ? `${count} shadows — large enough that this stylesheet may render slowly.`
    : undefined

  return ok({ filename: `${doc.name || 'artwork'}.css`, mime: 'text/css', data: css, warning })
}
