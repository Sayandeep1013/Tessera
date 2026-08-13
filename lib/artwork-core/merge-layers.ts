/**
 * Merge down and flatten. See docs/specs/14-layers.md §12.5.
 *
 * No new command types: both are pure functions returning a `batch` built out
 * of commands that already exist (`layer_visible`, `palette_add`, `paint`,
 * `layer_delete`) — the same shape `pasteImageCommand` uses for "paint plus
 * maybe new colours, as one undo step," extended with the layer bookkeeping
 * merge/flatten need. `applyCommand`/`invertCommand` do not change.
 */

import { compositeStack } from './blend'
import { cloneLayer, paintCommand, type EditorCommand, type PaintCell } from './commands'
import { quantise } from './quantise'
import type { Doc, Layer } from './schema'

export type MergeResult = {
  /** How many layers this operation removed. 0 means nothing happened. */
  layersConsumed: number
  /** New palette entries this operation appended. */
  added: number
  /** Distinct palette indices the merged result uses, not counting transparent. */
  colours: number
  /** True when the palette ran out of room and some colours were approximated. */
  clipped: boolean
  /** Hidden layers that were revealed so their content is not silently lost. */
  revealedHidden: number
}

const ZERO: MergeResult = { layersConsumed: 0, added: 0, colours: 0, clipped: false, revealedHidden: 0 }

/** Layers that get deleted and were hidden are revealed first — the same
 *  reason L-E8 reveals a layer before painting on it: the pixels are really
 *  there, and folding them into a merged result without showing they were
 *  there first is the silent-loss shape rule 7 exists to prevent. The
 *  surviving (target) layer's own visibility is never touched — merging INTO
 *  a hidden layer is a legitimate way to keep staging it. */
function revealCommands(label: string, frame: number, layers: readonly Layer[], indices: number[]): EditorCommand[] {
  const cmds: EditorCommand[] = []
  for (const i of indices) {
    if (layers[i]?.hidden) {
      cmds.push({ type: 'layer_visible', label, frame, at: i, before: true, after: false })
    }
  }
  return cmds
}

/** As `layers`, but with the given indices' `hidden` cleared — what the
 *  document will look like immediately after `revealCommands` applies, which
 *  is the state the composite must be computed against. */
function asRevealed(layers: readonly Layer[], indices: number[]): Layer[] {
  const revealed = new Set(indices)
  return layers.map((l, i) => (revealed.has(i) && l.hidden ? { ...l, hidden: false } : l))
}

function buildCells(current: Uint8Array, next: Uint8Array, w: number): PaintCell[] {
  const cells: PaintCell[] = []
  for (let p = 0; p < next.length; p++) {
    const after = next[p]!
    const before = current[p]!
    if (before !== after) cells.push([p % w, Math.floor(p / w), before, after])
  }
  return cells
}

/**
 * Combine layer `at` into layer `at - 1`, then remove layer `at`. `cmd` is
 * null when `at` is 0 — there is nothing below the bottom layer; the panel
 * disables the button in that state rather than calling this.
 */
export function mergeDownCommand(
  doc: Doc,
  frame: number,
  at: number,
): { cmd: EditorCommand | null; result: MergeResult } {
  const layers = doc.frames[frame]?.layers
  const targetAt = at - 1
  if (!layers || at <= 0 || !layers[at] || !layers[targetAt]) return { cmd: null, result: ZERO }

  const label = 'Merge down'
  const reveals = revealCommands(label, frame, layers, [at])
  const forComposite = asRevealed(layers, [at])
  const rgba = compositeStack(doc, [forComposite[targetAt]!, forComposite[at]!])
  const q = quantise(rgba, doc.palette)

  const target = layers[targetAt]!
  const cells = buildCells(target.px, q.indices, doc.w)
  const paint = paintCommand(label, frame, targetAt, cells)
  const del: EditorCommand = { type: 'layer_delete', label, frame, at, layer: cloneLayer(layers[at]!) }

  const cmds: EditorCommand[] = [...reveals]
  if (q.added.length) cmds.push({ type: 'palette_add', label, entries: q.added })
  if (paint) cmds.push(paint)
  cmds.push(del)

  const result: MergeResult = {
    layersConsumed: 1,
    added: q.added.length,
    colours: q.colours,
    clipped: q.clipped,
    revealedHidden: reveals.length,
  }
  return { cmd: cmds.length === 1 ? cmds[0]! : { type: 'batch', label, cmds }, result }
}

/**
 * Combine every layer in the frame into layer 0, removing the rest. `cmd` is
 * null when the frame already has one layer.
 */
export function flattenCommand(doc: Doc, frame: number): { cmd: EditorCommand | null; result: MergeResult } {
  const layers = doc.frames[frame]?.layers
  if (!layers || layers.length <= 1) return { cmd: null, result: ZERO }

  const label = 'Flatten'
  const upperIndices = layers.map((_, i) => i).slice(1)
  const reveals = revealCommands(label, frame, layers, upperIndices)
  const forComposite = asRevealed(layers, upperIndices)
  const rgba = compositeStack(doc, forComposite)
  const q = quantise(rgba, doc.palette)

  const bottom = layers[0]!
  const cells = buildCells(bottom.px, q.indices, doc.w)
  const paint = paintCommand(label, frame, 0, cells)
  // Top index first: each layer_delete's `at` stays valid without needing to
  // account for earlier deletes shifting later indices, since deleting from
  // above never moves anything below it. See 14-layers.md §12.5.
  const deletes: EditorCommand[] = []
  for (let i = layers.length - 1; i >= 1; i--) {
    deletes.push({ type: 'layer_delete', label, frame, at: i, layer: cloneLayer(layers[i]!) })
  }

  const cmds: EditorCommand[] = [...reveals]
  if (q.added.length) cmds.push({ type: 'palette_add', label, entries: q.added })
  if (paint) cmds.push(paint)
  cmds.push(...deletes)

  const result: MergeResult = {
    layersConsumed: layers.length - 1,
    added: q.added.length,
    colours: q.colours,
    clipped: q.clipped,
    revealedHidden: reveals.length,
  }
  return { cmd: cmds.length === 1 ? cmds[0]! : { type: 'batch', label, cmds }, result }
}
