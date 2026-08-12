'use client'

/**
 * Editor state. See docs/specs/05-editor.md §1.
 *
 * Split deliberately: a single store would make every pointer move re-render the
 * top bar. `useDocStore` exposes exactly ONE mutator — commit(cmd). Nothing else
 * writes the document. That invariant is what makes undo trustworthy.
 */

import { create } from 'zustand'
import type { Doc } from '../artwork-core/schema'
import { applyCommand, invertCommand, type EditorCommand } from '../artwork-core/commands'
import { clampLayer } from '../artwork-core/layers'
import type { Viewport } from '../renderer/canvas'
import type { BrushShape } from '../editor/brush'
import type { DitherMode } from '../editor/dither'
import { saveDraft } from '../persist/idb'

export type Tool =
  | 'select'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'rect'
  | 'marquee'
  | 'eyedropper'
  | 'gradient'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const HISTORY_CAP = 100
const AUTOSAVE_MS = 500

// ─────────────────────────────────────────────────────────────────────────────
// Document + history
// ─────────────────────────────────────────────────────────────────────────────

type DocState = {
  doc: Doc | null
  frame: number
  /**
   * The layer edits land on. Lives here rather than in useEditorStore because it
   * indexes into the document and its valid range is a property of the document
   * — which lets one guard in commit() cover every path that can invalidate it,
   * including undo, redo and the agent session.
   */
  layer: number
  past: EditorCommand[]
  future: EditorCommand[]
  saveStatus: SaveStatus
  saveError: string | null

  /**
   * Nesting depth of open agent sessions. While non-zero, commit() applies to the
   * live document but does NOT push history — the user watches the work land, and
   * the session collapses to one command at the end. Kept as a depth rather than a
   * boolean so an inner session cannot close an outer one's interception.
   */
  agentDepth: number

  setDoc: (doc: Doc) => void
  setLayer: (i: number) => void
  commit: (cmd: EditorCommand | null) => void
  undo: () => void
  redo: () => void
  beginAgentSession: () => void
  endAgentSession: () => void
  flushSave: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useDocStore = create<DocState>((set, get) => {
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    set({ saveStatus: 'saving' })
    saveTimer = setTimeout(() => void get().flushSave(), AUTOSAVE_MS)
  }

  return {
    doc: null,
    frame: 0,
    layer: 0,
    past: [],
    future: [],
    agentDepth: 0,
    saveStatus: 'idle',
    saveError: null,

    setDoc: (doc) => {
      // Layer 0, not the previous index: another document's indices mean nothing.
      set({ doc, layer: 0, past: [], future: [] })
      scheduleSave()
    },

    setLayer: (i) => {
      const { doc, frame } = get()
      set({ layer: clampLayer(doc, frame, i) })
    },

    commit: (cmd) => {
      if (!cmd) return // an empty stroke must not consume an undo step
      const { doc, past, frame, layer, agentDepth } = get()
      if (!doc) return
      const next = applyCommand(doc, cmd)
      // One clamp on every write path. Deleting the top layer, undoing an add,
      // replacing the document from an agent session — each of them can leave
      // the active index past the end, and enumerating them is how one gets
      // missed.
      const nextLayer = clampLayer(next, frame, layer)

      // Still the only writer — an agent session changes what happens to history,
      // not who writes the document.
      if (agentDepth > 0) {
        set({ doc: next, layer: nextLayer })
        scheduleSave()
        return
      }

      const trimmed = past.length >= HISTORY_CAP ? past.slice(past.length - HISTORY_CAP + 1) : past
      set({ doc: next, layer: nextLayer, past: [...trimmed, cmd], future: [] })
      scheduleSave()
    },

    undo: () => {
      const { doc, past, future, frame, layer } = get()
      if (!doc || past.length === 0) return
      const cmd = past[past.length - 1]!
      const next = applyCommand(doc, invertCommand(cmd))
      set({
        doc: next,
        layer: clampLayer(next, frame, layer),
        past: past.slice(0, -1),
        future: [cmd, ...future],
      })
      scheduleSave()
    },

    redo: () => {
      const { doc, past, future, frame, layer } = get()
      if (!doc || future.length === 0) return
      const cmd = future[0]!
      const next = applyCommand(doc, cmd)
      set({
        doc: next,
        layer: clampLayer(next, frame, layer),
        past: [...past, cmd],
        future: future.slice(1),
      })
      scheduleSave()
    },

    beginAgentSession: () => set({ agentDepth: get().agentDepth + 1 }),
    endAgentSession: () => set({ agentDepth: Math.max(0, get().agentDepth - 1) }),

    flushSave: async () => {
      const { doc } = get()
      if (!doc) return
      try {
        await saveDraft(doc)
        set({ saveStatus: 'saved', saveError: null })
      } catch (e) {
        // Never silently discard artwork — surface it and offer a download.
        set({ saveStatus: 'error', saveError: (e as Error).message })
      }
    },
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Editor UI state
// ─────────────────────────────────────────────────────────────────────────────

type EditorState = {
  tool: Tool
  prevTool: Tool
  colorIndex: number
  brushSize: number
  brushShape: BrushShape
  viewport: Viewport
  cursor: { x: number; y: number } | null
  showGrid: boolean
  panning: boolean
  dither: DitherMode
  /** Document-space rectangle, or null. Set by the marquee, moved by select. */
  selection: { x: number; y: number; w: number; h: number } | null
  /**
   * Whether the layer panel is on screen. UI state, so it lives here rather than
   * in the document store — but the button that toggles it is in the header and
   * the panel itself is in <main>, so it cannot be component-local.
   */
  layersOpen: boolean

  setTool: (t: Tool) => void
  setColorIndex: (i: number) => void
  setBrushSize: (n: number) => void
  setBrushShape: (s: BrushShape) => void
  setViewport: (vp: Viewport) => void
  setCursor: (c: { x: number; y: number } | null) => void
  toggleGrid: () => void
  setPanning: (p: boolean) => void
  setDither: (d: DitherMode) => void
  setSelection: (s: { x: number; y: number; w: number; h: number } | null) => void
  setLayersOpen: (open: boolean) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: 'brush',
  prevTool: 'brush',
  colorIndex: 1,
  brushSize: 1,
  brushShape: 'square',
  viewport: { scale: 16, offsetX: 0, offsetY: 0 },
  cursor: null,
  showGrid: true,
  panning: false,
  dither: 'solid',
  selection: null,
  layersOpen: false,

  setTool: (t) => set({ tool: t, prevTool: get().tool }),
  setColorIndex: (i) => set({ colorIndex: i }),
  setBrushSize: (n) => set({ brushSize: Math.max(1, Math.min(8, n)) }),
  setBrushShape: (s) => set({ brushShape: s }),
  setViewport: (vp) => set({ viewport: vp }),
  setCursor: (c) => set({ cursor: c }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  setPanning: (p) => set({ panning: p }),
  setDither: (d) => set({ dither: d }),
  setSelection: (sel) => set({ selection: sel }),
  setLayersOpen: (open) => set({ layersOpen: open }),
}))
