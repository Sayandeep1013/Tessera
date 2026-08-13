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
import type { ExportResult } from './types'
import { ok, err, type Doc } from '../artwork-core/schema'

export type CssOptions = { frame?: number; className?: string; pixelSize?: number }

/** §4: above this many painted pixels, a warning — the file still exports. */
export const CSS_WARN_PIXELS = 4096
/** §4: above this many, the export refuses rather than shipping something that hangs a tab. */
export const CSS_ERROR_PIXELS = 16384

export function exportCss(doc: Doc, opts: CssOptions = {}): ExportResult {
  const frame = opts.frame ?? 0
  const className = opts.className || 'pixel-art'
  const pixelSize = opts.pixelSize ?? 8
  if (!doc.frames[frame]) return err(`frame ${frame} does not exist`)

  const flat = flattenFrame(doc, frame)
  const used = new Set<number>()
  let count = 0
  for (const i of flat) {
    if (i === 0) continue
    count++
    used.add(i)
  }

  if (count > CSS_ERROR_PIXELS) {
    return err(
      `${count} painted pixels is too many for box-shadow CSS (limit ${CSS_ERROR_PIXELS}) — export SVG instead.`,
    )
  }

  const indices = [...used].sort((a, b) => a - b)
  const vars = indices.map((i) => `  --c${i}: ${doc.palette[i]!.c};`)

  const shadows: string[] = []
  for (let y = 0; y < doc.h; y++) {
    for (let x = 0; x < doc.w; x++) {
      const i = flat[y * doc.w + x]!
      if (i === 0) continue
      // token-exempt: --p / --c are custom properties in the FILE THIS EXPORTS,
      // not this app's own design tokens.
      shadows.push(`calc(var(--p) * ${x}) calc(var(--p) * ${y}) 0 0 var(--c${i})`)
    }
  }

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
