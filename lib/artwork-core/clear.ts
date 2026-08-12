/**
 * Empty every layer of one frame. See docs/specs/17-file-menu.md §2 and §7.4.
 *
 * Clear is the File menu's destructive item, and the whole reason it is allowed
 * to be destructive is that it is *undoable*: it keeps the document, its size,
 * its palette and its layer structure, and changes nothing but pixels. So it is
 * expressed as paint commands — the one command type that carries both the
 * previous and the new value per cell — rather than as a `replace_doc`, which
 * would work and would put the entire document on the undo stack to say "these
 * 143 pixels went to transparent".
 *
 * One `batch` wrapping one `paint` per layer, not one paint per layer pushed
 * separately: `commit` is called once, so Ctrl+Z is one press however many
 * layers the frame has.
 *
 * Pure, like the rest of artwork-core: builds a command and touches nothing.
 */

import { paintCommand, type EditorCommand, type PaintCell } from './commands'
import { TRANSPARENT_INDEX, type Doc } from './schema'

/**
 * How many cells of this frame are painted, counting a cell once however many
 * layers paint it.
 *
 * Deliberately the same reading `pixelsLostOnResize` uses (see its header): the
 * number is for a human deciding whether to press a red button, and "143
 * pixels" meaning "143 places on the canvas" is what they will check it
 * against by looking. A three-layer document that paints the same cell three
 * times has covered one spot, not three.
 */
export function paintedCellCount(doc: Doc, frame: number): number {
  const layers = doc.frames[frame]?.layers
  if (!layers) return 0

  const painted = new Set<number>()
  for (const layer of layers) {
    for (let p = 0; p < layer.px.length; p++) {
      if (layer.px[p] !== TRANSPARENT_INDEX) painted.add(p)
    }
  }
  return painted.size
}

/**
 * One command that blanks every layer of `frame`, or null when there is nothing
 * to blank.
 *
 * Null rather than an empty batch, for the same reason `paintCommand` returns
 * null for an empty stroke: a no-op must never consume an undo step. The menu
 * uses the same fact to disable the item before it is ever pressed (§7.4), so
 * this branch should be unreachable from the UI — it is here because the
 * function is also correct on its own.
 *
 * Hidden layers are cleared too. Hiding a layer is a view state, not a promise
 * that it is exempt; leaving it painted would mean "Clear" left artwork behind
 * that reappears the moment the eye is clicked, which is the surprise rule 7
 * exists to prevent.
 */
export function clearFrameCommand(doc: Doc, frame: number, label: string): EditorCommand | null {
  const layers = doc.frames[frame]?.layers
  if (!layers) return null

  const cmds: EditorCommand[] = []
  for (let i = 0; i < layers.length; i++) {
    const px = layers[i]!.px
    const cells: PaintCell[] = []
    for (let p = 0; p < px.length; p++) {
      if (px[p] !== TRANSPARENT_INDEX) {
        cells.push([p % doc.w, Math.floor(p / doc.w), px[p]!, TRANSPARENT_INDEX])
      }
    }
    const cmd = paintCommand(label, frame, i, cells)
    if (cmd) cmds.push(cmd)
  }

  if (!cmds.length) return null
  return { type: 'batch', label, cmds }
}
