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
import type { Viewport } from '../renderer/canvas'
import type { BrushShape } from '../editor/brush'
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
  past: EditorCommand[]
  future: EditorCommand[]
  saveStatus: SaveStatus
  saveError: string | null

  setDoc: (doc: Doc) => void
  commit: (cmd: EditorCommand | null) => void
  undo: () => void
  redo: () => void
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
    past: [],
    future: [],
    saveStatus: 'idle',
    saveError: null,

    setDoc: (doc) => {
      set({ doc, past: [], future: [] })
      scheduleSave()
    },

    commit: (cmd) => {
      if (!cmd) return // an empty stroke must not consume an undo step
      const { doc, past } = get()
      if (!doc) return
      const next = applyCommand(doc, cmd)
      const trimmed = past.length >= HISTORY_CAP ? past.slice(past.length - HISTORY_CAP + 1) : past
      set({ doc: next, past: [...trimmed, cmd], future: [] })
      scheduleSave()
    },

    undo: () => {
      const { doc, past, future } = get()
      if (!doc || past.length === 0) return
      const cmd = past[past.length - 1]!
      const next = applyCommand(doc, invertCommand(cmd))
      set({ doc: next, past: past.slice(0, -1), future: [cmd, ...future] })
      scheduleSave()
    },

    redo: () => {
      const { doc, past, future } = get()
      if (!doc || future.length === 0) return
      const cmd = future[0]!
      set({ doc: applyCommand(doc, cmd), past: [...past, cmd], future: future.slice(1) })
      scheduleSave()
    },

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

  setTool: (t: Tool) => void
  setColorIndex: (i: number) => void
  setBrushSize: (n: number) => void
  setBrushShape: (s: BrushShape) => void
  setViewport: (vp: Viewport) => void
  setCursor: (c: { x: number; y: number } | null) => void
  toggleGrid: () => void
  setPanning: (p: boolean) => void
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

  setTool: (t) => set({ tool: t, prevTool: get().tool }),
  setColorIndex: (i) => set({ colorIndex: i }),
  setBrushSize: (n) => set({ brushSize: Math.max(1, Math.min(8, n)) }),
  setBrushShape: (s) => set({ brushShape: s }),
  setViewport: (vp) => set({ viewport: vp }),
  setCursor: (c) => set({ cursor: c }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  setPanning: (p) => set({ panning: p }),
}))
