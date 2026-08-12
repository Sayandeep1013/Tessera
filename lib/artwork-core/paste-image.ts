/**
 * An image on the clipboard, as one undoable command.
 * See docs/specs/17-file-menu.md §9.1 and §9.4.
 *
 * Fit, quantise, and then decide what to write. Pure: it takes decoded RGBA and
 * returns a command, so the whole feature is testable in node and the browser's
 * only job is to produce the bytes (`lib/editor/clipboard.ts`).
 *
 * **One command, so it is one undo.** A plain `paint` when nothing was added to
 * the palette, `batch[palette_add, paint]` when something was. That ordering
 * matters on the way back out: `invertCommand('batch')` reverses its children,
 * so undo repaints the old pixels *and then* pops the palette — which is
 * exactly the sequencing `invertCommand('ai_edit')` got wrong once, shipping
 * documents whose pixels referenced a palette entry that undo had removed
 * (docs/specs/14-layers.md §0.2). The bug is worth remembering here because
 * this is the second command in the repo that adds colours and pixels together.
 */

import { paintCommand, type EditorCommand, type PaintCell } from './commands'
import { fitImage, type Placement, type Rgba } from './fit-image'
import { quantise } from './quantise'
import { TRANSPARENT_INDEX, type Doc } from './schema'

export const PASTE_LABEL = 'Paste image'

/** Everything the message in §9.6 needs, and nothing the caller has to re-derive. */
export type PasteResult = {
  /** The source image's own size, for "Pasted 1000×500 as 32×16". */
  src: { w: number; h: number }
  /** Where it landed and how it got there. */
  at: Placement
  /** Distinct opaque colours before quantising. */
  sourceColours: number
  /** Distinct palette indices used after it. */
  colours: number
  /** How many entries this paste appended to the palette. */
  added: number
  /** True when the palette had no room and colours were snapped to fit. */
  clipped: boolean
  /** Cells this paste actually writes. Zero means nothing on screen changes. */
  cells: number
}

/**
 * Build the command for pasting `src` onto the active layer.
 *
 * `cmd` is null when the paste would change nothing — a wholly transparent
 * image, or one that happens to match what is already there. Null rather than
 * an empty command, for the same reason `paintCommand` returns null for an
 * empty stroke: a no-op must never consume an undo step. The result is still
 * returned, because the caller still has to say what happened.
 *
 * **Transparent cells are skipped, not written** (§9.4). The quantiser maps a
 * transparent source pixel to index 0 as §2 requires, and this is where that
 * index stops being a value and becomes an absence: a logo with a transparent
 * background composites over the drawing instead of punching a rectangular hole
 * in it, and a paste never destroys artwork it does not visibly cover. The
 * consequence, stated because it will otherwise be discovered: a paste cannot
 * erase. That is what the eraser and Clear are for.
 */
export function pasteImageCommand(
  doc: Doc,
  frame: number,
  layer: number,
  src: Rgba,
  /**
   * The size the user actually copied, when it is not the size of the pixels
   * handed in. `lib/editor/clipboard.ts` bounds its decode at 1024 on the long
   * edge, so a 6000×4000 photo arrives here already reduced — and a message
   * reading "Pasted 1024×683" would be quoting our own plumbing back at
   * somebody who copied a six-megapixel image. Defaults to `src`, which is
   * correct for every caller that did not scale anything.
   */
  sourceSize: { w: number; h: number } = src,
): { cmd: EditorCommand | null; result: PasteResult } {
  const { rgba, at } = fitImage(src, doc.w, doc.h)
  const q = quantise(rgba, doc.palette)

  const base: PasteResult = {
    src: { w: sourceSize.w, h: sourceSize.h },
    at,
    sourceColours: q.sourceColours,
    colours: q.colours,
    added: q.added.length,
    clipped: q.clipped,
    cells: 0,
  }

  const px = doc.frames[frame]?.layers[layer]?.px
  // A layer that is not there writes nothing, exactly as applyCommand('paint')
  // would. Unreachable from the UI, where the active index is clamped on every
  // write path — but the function is also correct on its own.
  if (!px) return { cmd: null, result: base }

  const cells: PaintCell[] = []
  for (let p = 0; p < q.indices.length; p++) {
    const after = q.indices[p]!
    if (after === TRANSPARENT_INDEX) continue
    const before = px[p]!
    if (before === after) continue
    cells.push([p % doc.w, Math.floor(p / doc.w), before, after])
  }

  const paint = paintCommand(PASTE_LABEL, frame, layer, cells)
  const result = { ...base, cells: cells.length }
  // No command means nothing was appended either, so the report must not claim
  // otherwise. (It cannot actually happen — an appended entry's index is past
  // the end of the old palette, so no existing pixel can already hold it, so
  // there is always at least one changed cell. Kept honest rather than kept
  // clever.)
  if (!paint) return { cmd: null, result: { ...result, added: 0 } }

  if (!q.added.length) return { cmd: paint, result }
  return {
    cmd: {
      type: 'batch',
      label: PASTE_LABEL,
      // Colours first: the paint's cells reference indices this paste created.
      cmds: [{ type: 'palette_add', label: PASTE_LABEL, entries: q.added }, paint],
    },
    result,
  }
}
