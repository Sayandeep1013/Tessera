/**
 * Everything Paste image says. See docs/specs/17-file-menu.md §9.6.
 *
 * Same split as `file-menu.ts`, `recent.ts` and `canvas-size.ts`, for the same
 * reason (HANDOFF §11): a sentence that only exists inside a `.tsx` has no CI
 * guard, because `npm test` runs in node and the browser probes need a dev
 * server. Wording is a decision — F-M3 is *only* a wording requirement — so it
 * lives where a test can hold it.
 *
 * Rule 7 in one line: a paste that quietly loses 196 colours is silently
 * discarding artwork. It cannot be prevented — 36 entries is the format — so
 * the least this can do is say so, with the number, in the same breath as the
 * result.
 */

import type { PasteResult } from '../artwork-core/paste-image'

/**
 * How long a notice stays before it dismisses itself.
 *
 * Long enough to read a two-clause sentence twice, short enough that it is not
 * furniture. It is also dismissable by click, because the one thing a status
 * line must never do is sit over the artwork it is describing.
 */
export const NOTICE_MS = 6000

/** F-M2. The ordinary mistake of pressing ⌘V with text on the clipboard. */
export const PASTE_NO_IMAGE = 'No image on the clipboard.'

/** F-M5. Firefox has no `navigator.clipboard.read()`; the file picker always works. */
export const PASTE_NO_CLIPBOARD =
  "This browser won't hand over the clipboard — choose a file instead."

/** A blob that arrived but is not an image this browser can decode. */
export const PASTE_UNREADABLE = 'That image could not be read.'

/**
 * The three ways getting an image can fail, and what each one says.
 *
 * The union lives here rather than in `clipboard.ts` so that the browser layer
 * imports the wording and not the other way round — this module has to stay
 * runnable in node, because it is the one a test can reach.
 */
export type PasteFailure = 'none' | 'unsupported' | 'unreadable'

export const PASTE_FAILURE: Record<PasteFailure, string> = {
  none: PASTE_NO_IMAGE,
  unsupported: PASTE_NO_CLIPBOARD,
  unreadable: PASTE_UNREADABLE,
}

const plural = (n: number) => (n === 1 ? '' : 's')

/**
 * What happened, in one line.
 *
 * Two clauses, in the order somebody reads them: where the image went, then
 * what it cost. The size clause names the source size only when it differs from
 * the placed size — "Pasted 20×10" is the whole truth when nothing was scaled,
 * and "Pasted 20×10 as 20×10" reads like a bug.
 */
export function pasteReport(r: PasteResult): string {
  const scaled = r.src.w !== r.at.w || r.src.h !== r.at.h
  const size = scaled
    ? `Pasted ${r.src.w}×${r.src.h} as ${r.at.w}×${r.at.h}.`
    : `Pasted ${r.src.w}×${r.src.h}.`

  if (r.colours === 0) return `${size} Every pixel was transparent, so nothing changed.`
  // Distinct from the case above: there was something to paste, and the layer
  // already held exactly it. Saying "pasted" and changing nothing would be the
  // kind of small lie that makes someone paste again to check.
  if (r.cells === 0) return `${size} Nothing changed — that image is already on this layer.`

  // F-M3, and the reason this function exists: name the loss with its number
  // rather than reporting a success and letting the palette explain itself.
  const colours =
    r.sourceColours > r.colours
      ? `Reduced from ${r.sourceColours} colours to ${r.colours}.`
      : `${r.colours} colour${plural(r.colours)}.`

  // The palette ran out mid-paste, so some colours are approximations of
  // approximations. That is a different fact from "reduced", and it gets its
  // own sentence rather than being folded into the count.
  const full = r.clipped ? ' The palette is full, so some colours were matched to ones already in it.' : ''

  return `${size} ${colours}${full}`
}
