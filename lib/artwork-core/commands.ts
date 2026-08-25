/**
 * The undo/redo command system. See docs/specs/03-artwork-core.md §5 and
 * docs/specs/14-layers.md §2.
 *
 * Every mutation — brush stroke, palette edit, AI accept, code-panel edit — goes
 * through exactly one command. `paint` and `ai_edit` store BOTH the previous and
 * new value per pixel, so inversion is a pure swap with no re-derivation. That is
 * what makes "one Cmd-Z reverses the whole AI edit" fall out for free.
 *
 * `layer` is REQUIRED on the pixel commands, not optional-with-a-default. A
 * command that does not know which layer it touched cannot be inverted once a
 * second layer exists — undo would write the previous pixels into whichever
 * layer happened to be active. Making the field required means the compiler
 * names every construction site instead of one of them silently painting layer
 * 0 forever. Nothing persists commands (undo history is memory-only, see
 * lib/persist/idb.ts), so there is no old shape to stay compatible with.
 */

import { cloneDoc } from './codec'
import type { Op } from './ops'
import type { BlendMode, Doc, Frame, Layer, PaletteEntry } from './schema'

/** [x, y, before, after] */
export type PaintCell = [number, number, number, number]

export type EditorCommand =
  | { type: 'paint'; label: string; frame: number; layer: number; cells: PaintCell[] }
  | {
      type: 'ai_edit'
      label: string
      frame: number
      layer: number
      cells: PaintCell[]
      summary: string
      ops: Op[]
      /** colours appended by this edit, in order */
      paletteAdded: PaletteEntry[]
    }
  /** Applies children in order; inverts them in reverse order. */
  | { type: 'batch'; label: string; cmds: EditorCommand[] }
  | { type: 'palette_add'; label: string; entries: PaletteEntry[] }
  /** Inverse of palette_add: removes `count` entries from the end. */
  | { type: 'palette_pop'; label: string; entries: PaletteEntry[] }
  | { type: 'palette_edit'; label: string; index: number; before: PaletteEntry; after: PaletteEntry }
  | { type: 'layer_add'; label: string; frame: number; at: number; layer: Layer }
  | { type: 'layer_delete'; label: string; frame: number; at: number; layer: Layer }
  | { type: 'layer_move'; label: string; frame: number; from: number; to: number }
  | { type: 'layer_rename'; label: string; frame: number; at: number; before: string; after: string }
  | { type: 'layer_visible'; label: string; frame: number; at: number; before: boolean; after: boolean }
  | { type: 'layer_opacity'; label: string; frame: number; at: number; before: number; after: number }
  | { type: 'layer_blend_mode'; label: string; frame: number; at: number; before: BlendMode; after: BlendMode }
  | { type: 'frame_add'; label: string; at: number; frame: Frame }
  | { type: 'frame_delete'; label: string; at: number; frame: Frame }
  | { type: 'frame_duration'; label: string; at: number; before: number; after: number }
  | { type: 'frame_move'; label: string; from: number; to: number }
  /**
   * The document's name. Its own command rather than a `replace_doc`, because
   * cloning every pixel to record a changed string makes the undo stack
   * expensive for no reason — and rule 4 has no carve-out for metadata, so a
   * rename is a mutation like any other. See docs/specs/17-file-menu.md §8.1.
   */
  | { type: 'doc_rename'; label: string; before: string; after: string }
  | { type: 'replace_doc'; label: string; before: Doc; after: Doc }
  | { type: 'resize'; label: string; before: Doc; after: Doc }

export const cloneFrame = (f: Frame): Frame => ({
  ms: f.ms,
  layers: f.layers.map((l) => ({ ...l, px: new Uint8Array(l.px) })),
})

export const cloneLayer = (l: Layer): Layer => ({ ...l, px: new Uint8Array(l.px) })

const stamp = (d: Doc): Doc => {
  d.meta = { ...d.meta, updatedAt: new Date().toISOString() }
  return d
}

export function applyCommand(doc: Doc, cmd: EditorCommand): Doc {
  switch (cmd.type) {
    case 'paint': {
      const next = cloneDoc(doc)
      // L-E7: a command addressing a layer that is not there does nothing rather
      // than throwing. Throwing inside undo() takes the editor down and loses the
      // session; a no-op loses nothing. It should be unreachable — undo is a
      // stack, so a layer_delete is always undone before the paint beneath it.
      const px = next.frames[cmd.frame]?.layers[cmd.layer]?.px
      if (!px) return next
      for (const [x, y, , after] of cmd.cells) px[y * next.w + x] = after
      return stamp(next)
    }

    case 'ai_edit': {
      const next = cloneDoc(doc)

      /**
       * Colours first — the cells may reference indices this edit created.
       *
       * APPENDING IS IDEMPOTENT, and it has to be. An agent session applies its
       * work to the live document as it goes, then collapses into ONE ai_edit
       * which the store commits over that already-mutated document
       * (lib/store/agent.ts, finaliseToHistory). Setting a pixel to the value it
       * already holds is a no-op; pushing a palette entry that is already there is
       * NOT, so every session that added a colour appended it twice.
       *
       * Measured 24 Aug 2026 by eval scenario G2: a butterfly drawn with four
       * colours ended with a palette of eight — 1-4 and 5-8 byte-identical. Worse
       * than cosmetic: invertCommand pops `paletteAdded.length` entries, so undo
       * removed four of the eight and left the document carrying four orphans.
       *
       * Re-applying is therefore a no-op when the palette already ends with
       * exactly this run. After an undo those entries are gone, the tail no longer
       * matches, and redo appends them properly.
       */
      const added = cmd.paletteAdded
      const tail = next.palette.slice(next.palette.length - added.length)
      const alreadyApplied =
        added.length > 0 &&
        tail.length === added.length &&
        tail.every((e, i) => e.c === added[i]!.c && e.n === added[i]!.n)
      if (!alreadyApplied) {
        for (const entry of added) next.palette.push({ ...entry })
      }
      const px = next.frames[cmd.frame]?.layers[cmd.layer]?.px
      if (!px) return stamp(next)
      for (const [x, y, , after] of cmd.cells) px[y * next.w + x] = after
      return stamp(next)
    }

    case 'batch': {
      let out = doc
      for (const child of cmd.cmds) out = applyCommand(out, child)
      return out
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

    case 'layer_add': {
      const next = cloneDoc(doc)
      const layers = next.frames[cmd.frame]?.layers
      if (!layers || cmd.at < 0 || cmd.at > layers.length) return next
      layers.splice(cmd.at, 0, cloneLayer(cmd.layer))
      return stamp(next)
    }

    case 'layer_delete': {
      const next = cloneDoc(doc)
      const layers = next.frames[cmd.frame]?.layers
      // min(1) is a format invariant — the last layer is not deletable.
      if (!layers || !layers[cmd.at] || layers.length <= 1) return next
      layers.splice(cmd.at, 1)
      return stamp(next)
    }

    case 'layer_move': {
      const next = cloneDoc(doc)
      const layers = next.frames[cmd.frame]?.layers
      if (!layers || !layers[cmd.from] || cmd.to < 0 || cmd.to >= layers.length) return next
      const [moved] = layers.splice(cmd.from, 1)
      layers.splice(cmd.to, 0, moved!)
      return stamp(next)
    }

    case 'layer_rename': {
      const next = cloneDoc(doc)
      const layer = next.frames[cmd.frame]?.layers[cmd.at]
      if (!layer) return next
      layer.n = cmd.after
      return stamp(next)
    }

    case 'layer_visible': {
      const next = cloneDoc(doc)
      const layer = next.frames[cmd.frame]?.layers[cmd.at]
      if (!layer) return next
      // `hidden` is omitted rather than false when visible — serializeDoc drops
      // it either way, but the runtime shape should not drift from the file.
      if (cmd.after) layer.hidden = true
      else delete layer.hidden
      return stamp(next)
    }

    case 'layer_opacity': {
      const next = cloneDoc(doc)
      const layer = next.frames[cmd.frame]?.layers[cmd.at]
      if (!layer) return next
      // Omitted rather than 100 when opaque, matching `hidden`'s own rule —
      // the runtime shape should not drift from what the file would write.
      if (cmd.after === 100) delete layer.o
      else layer.o = cmd.after
      return stamp(next)
    }

    case 'layer_blend_mode': {
      const next = cloneDoc(doc)
      const layer = next.frames[cmd.frame]?.layers[cmd.at]
      if (!layer) return next
      if (cmd.after === 'normal') delete layer.mode
      else layer.mode = cmd.after
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

    case 'frame_move': {
      const next = cloneDoc(doc)
      if (!next.frames[cmd.from] || cmd.to < 0 || cmd.to >= next.frames.length) return next
      const [moved] = next.frames.splice(cmd.from, 1)
      next.frames.splice(cmd.to, 0, moved!)
      return stamp(next)
    }

    case 'doc_rename': {
      const next = cloneDoc(doc)
      next.name = cmd.after
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

    case 'ai_edit': {
      // Undoing an AI edit is a paint back to the previous pixels, PLUS removing
      // any colours it appended — both, in that order.
      //
      // This used to return the palette_pop alone whenever paletteAdded was
      // non-empty, which is the common case for an agent session. The pixels
      // stayed, the palette entry they referenced went away, and the next load
      // failed to parse with palette_range. Recorded in docs/specs/14-layers.md
      // §0.2.
      const paint: EditorCommand = {
        type: 'paint',
        label: cmd.label,
        frame: cmd.frame,
        layer: cmd.layer,
        cells: swap(cmd.cells),
      }
      if (!cmd.paletteAdded.length) return paint
      return {
        type: 'batch',
        label: cmd.label,
        cmds: [paint, { type: 'palette_pop', label: cmd.label, entries: cmd.paletteAdded }],
      }
    }

    case 'batch':
      return { ...cmd, cmds: [...cmd.cmds].reverse().map(invertCommand) }

    case 'palette_add':
      return { type: 'palette_pop', label: cmd.label, entries: cmd.entries }

    case 'palette_pop':
      return { type: 'palette_add', label: cmd.label, entries: cmd.entries }

    case 'palette_edit':
      return { ...cmd, before: cmd.after, after: cmd.before }

    case 'layer_add':
      return { type: 'layer_delete', label: cmd.label, frame: cmd.frame, at: cmd.at, layer: cmd.layer }

    case 'layer_delete':
      return { type: 'layer_add', label: cmd.label, frame: cmd.frame, at: cmd.at, layer: cmd.layer }

    case 'layer_move':
      // Self-inverse under exchange: splice-out-then-splice-in is symmetric.
      return { ...cmd, from: cmd.to, to: cmd.from }

    // Not merged with layer_visible: sharing the branch widens before/after to
    // `string | boolean` and neither case type-checks.
    case 'layer_rename':
      return { ...cmd, before: cmd.after, after: cmd.before }

    case 'layer_visible':
      return { ...cmd, before: cmd.after, after: cmd.before }

    // Self-inverse under exchange, like layer_visible. Not merged with it:
    // sharing a branch widens before/after across unrelated value types and
    // neither case type-checks.
    case 'layer_opacity':
      return { ...cmd, before: cmd.after, after: cmd.before }

    case 'layer_blend_mode':
      return { ...cmd, before: cmd.after, after: cmd.before }

    case 'frame_add':
      return { type: 'frame_delete', label: cmd.label, at: cmd.at, frame: cmd.frame }

    case 'frame_delete':
      return { type: 'frame_add', label: cmd.label, at: cmd.at, frame: cmd.frame }

    case 'frame_duration':
      return { ...cmd, before: cmd.after, after: cmd.before }

    case 'frame_move':
      // Self-inverse under exchange, like layer_move: splice-out-then-splice-in
      // is symmetric.
      return { ...cmd, from: cmd.to, to: cmd.from }

    // Self-inverse under exchange, like layer_rename and frame_duration. Not
    // merged with them: sharing a branch widens before/after across three
    // unrelated value types and none of them type-check.
    case 'doc_rename':
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
  layer: number,
  cells: Iterable<PaintCell>,
): EditorCommand | null {
  const real = [...cells].filter(([, , before, after]) => before !== after)
  return real.length ? { type: 'paint', label, frame, layer, cells: real } : null
}

/**
 * Merge two `paint` commands touching the same frame and layer, keeping each
 * touched cell's EARLIEST `before` and LATEST `after`. Used to coalesce a
 * held key's repeated nudges into one undo entry — see
 * docs/specs/20-selector.md §3.6. The caller (`useDocStore.commit`) is
 * responsible for checking frame/layer/label already match before calling
 * this; it does not re-check them.
 */
export function mergePaintCommands(
  top: EditorCommand & { type: 'paint' },
  next: EditorCommand & { type: 'paint' },
): EditorCommand {
  const map = new Map<string, PaintCell>()
  for (const c of top.cells) map.set(`${c[0]},${c[1]}`, c)
  for (const [x, y, before, after] of next.cells) {
    const key = `${x},${y}`
    const existing = map.get(key)
    map.set(key, [x, y, existing ? existing[2] : before, after])
  }
  return { ...next, cells: [...map.values()] }
}
