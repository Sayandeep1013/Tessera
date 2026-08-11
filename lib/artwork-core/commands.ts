/**
 * The undo/redo command system. See docs/specs/03-artwork-core.md §5.
 *
 * Every mutation — brush stroke, palette edit, AI accept, code-panel edit — goes
 * through exactly one command. `paint` and `ai_edit` store BOTH the previous and
 * new value per pixel, so inversion is a pure swap with no re-derivation. That is
 * what makes "one Cmd-Z reverses the whole AI edit" fall out for free.
 */

import { cloneDoc } from './codec'
import type { Op } from './ops'
import type { Doc, Frame, PaletteEntry } from './schema'

/** [x, y, before, after] */
export type PaintCell = [number, number, number, number]

export type EditorCommand =
  | { type: 'paint'; label: string; frame: number; cells: PaintCell[] }
  | {
      type: 'ai_edit'
      label: string
      frame: number
      cells: PaintCell[]
      summary: string
      ops: Op[]
      /** colours appended by this edit, in order */
      paletteAdded: PaletteEntry[]
    }
  | { type: 'palette_add'; label: string; entries: PaletteEntry[] }
  /** Inverse of palette_add: removes `count` entries from the end. */
  | { type: 'palette_pop'; label: string; entries: PaletteEntry[] }
  | { type: 'palette_edit'; label: string; index: number; before: PaletteEntry; after: PaletteEntry }
  | { type: 'frame_add'; label: string; at: number; frame: Frame }
  | { type: 'frame_delete'; label: string; at: number; frame: Frame }
  | { type: 'frame_duration'; label: string; at: number; before: number; after: number }
  | { type: 'replace_doc'; label: string; before: Doc; after: Doc }
  | { type: 'resize'; label: string; before: Doc; after: Doc }

const cloneFrame = (f: Frame): Frame => ({
  ms: f.ms,
  layers: f.layers.map((l) => ({ ...l, px: new Uint8Array(l.px) })),
})

const stamp = (d: Doc): Doc => {
  d.meta = { ...d.meta, updatedAt: new Date().toISOString() }
  return d
}

export function applyCommand(doc: Doc, cmd: EditorCommand): Doc {
  switch (cmd.type) {
    case 'paint': {
      const next = cloneDoc(doc)
      const px = next.frames[cmd.frame]!.layers[0]!.px
      for (const [x, y, , after] of cmd.cells) px[y * next.w + x] = after
      return stamp(next)
    }

    case 'ai_edit': {
      const next = cloneDoc(doc)
      // Colours first — the cells may reference indices this edit created.
      for (const entry of cmd.paletteAdded) next.palette.push({ ...entry })
      const px = next.frames[cmd.frame]!.layers[0]!.px
      for (const [x, y, , after] of cmd.cells) px[y * next.w + x] = after
      return stamp(next)
    }

    case 'palette_add': {
      const next = cloneDoc(doc)
      for (const e of cmd.entries) next.palette.push({ ...e })
      return stamp(next)
    }

    case 'palette_pop': {
      const next = cloneDoc(doc)
      next.palette.splice(next.palette.length - cmd.entries.length, cmd.entries.length)
      return stamp(next)
    }

    case 'palette_edit': {
      const next = cloneDoc(doc)
      next.palette[cmd.index] = { ...cmd.after }
      return stamp(next)
    }

    case 'frame_add': {
      const next = cloneDoc(doc)
      next.frames.splice(cmd.at, 0, cloneFrame(cmd.frame))
      return stamp(next)
    }

    case 'frame_delete': {
      const next = cloneDoc(doc)
      next.frames.splice(cmd.at, 1)
      return stamp(next)
    }

    case 'frame_duration': {
      const next = cloneDoc(doc)
      next.frames[cmd.at]!.ms = cmd.after
      return stamp(next)
    }

    case 'replace_doc':
    case 'resize':
      return cloneDoc(cmd.after)
  }
}

export function invertCommand(cmd: EditorCommand): EditorCommand {
  switch (cmd.type) {
    case 'paint':
      return { ...cmd, cells: swap(cmd.cells) }

    case 'ai_edit':
      // Undoing an AI edit is a paint back to the previous pixels, plus removing
      // any colours it appended. Redo re-applies the original ai_edit, so the
      // metadata is not lost from history.
      return cmd.paletteAdded.length
        ? { type: 'palette_pop', label: cmd.label, entries: cmd.paletteAdded }
        : { type: 'paint', label: cmd.label, frame: cmd.frame, cells: swap(cmd.cells) }

    case 'palette_add':
      return { type: 'palette_pop', label: cmd.label, entries: cmd.entries }

    case 'palette_pop':
      return { type: 'palette_add', label: cmd.label, entries: cmd.entries }

    case 'palette_edit':
      return { ...cmd, before: cmd.after, after: cmd.before }

    case 'frame_add':
      return { type: 'frame_delete', label: cmd.label, at: cmd.at, frame: cmd.frame }

    case 'frame_delete':
      return { type: 'frame_add', label: cmd.label, at: cmd.at, frame: cmd.frame }

    case 'frame_duration':
      return { ...cmd, before: cmd.after, after: cmd.before }

    case 'replace_doc':
    case 'resize':
      return { ...cmd, before: cmd.after, after: cmd.before }
  }
}

function swap(cells: PaintCell[]): PaintCell[] {
  return cells.map(([x, y, before, after]) => [x, y, after, before] as PaintCell)
}

/**
 * Build a paint command from a stroke buffer, dropping cells whose value did not
 * actually change. Returns null for an empty stroke — a no-op click must never
 * consume an undo step.
 */
export function paintCommand(
  label: string,
  frame: number,
  cells: Iterable<PaintCell>,
): EditorCommand | null {
  const real = [...cells].filter(([, , before, after]) => before !== after)
  return real.length ? { type: 'paint', label, frame, cells: real } : null
}

/**
 * An AI edit that both appends colours and paints is inverted in two steps, so
 * undo must apply the paint inverse as well. This returns the full inverse pair
 * in application order.
 */
export function invertAiEdit(cmd: Extract<EditorCommand, { type: 'ai_edit' }>): EditorCommand[] {
  const out: EditorCommand[] = [
    { type: 'paint', label: cmd.label, frame: cmd.frame, cells: swap(cmd.cells) },
  ]
  if (cmd.paletteAdded.length) {
    out.push({ type: 'palette_pop', label: cmd.label, entries: cmd.paletteAdded })
  }
  return out
}
