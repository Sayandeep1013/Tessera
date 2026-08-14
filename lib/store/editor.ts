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
import { clampFrame } from '../artwork-core/frames'
import type { Viewport } from '../renderer/canvas'
import type { BrushShape } from '../editor/brush'
import type { DitherMode } from '../editor/dither'
import { CODE_DEFAULT_W, clampCodeWidth } from '../editor/code-panel'
import { clampTab, type FormatTabId } from '../editor/export-menu'

/** Spec 16 §1. Auto follows the zoom, as the renderer always has. */
export type GridMode = 'auto' | 'on' | 'off'
/** Spec 16 §3. Which axes a painted cell is mirrored across. */
export type Symmetry = 'off' | 'h' | 'v' | 'both'
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
  /** Which frame is shown and edited. UI state, like `layer` — not undoable. */
  setFrame: (i: number) => void
  /**
   * The one writer. See docs/specs/07-code-panel.md §9.4 for `coalesce`.
   *
   * `coalesce` merges this command into the top of the history stack instead of
   * pushing a new step, when the top is a `replace_doc` with the same label.
   * Ten keystrokes in the code panel are one undo step, and undoing goes back
   * to where the typing started rather than to the ninth keystroke.
   *
   * Rule 4 is untouched: this changes *what happens to history*, not *who
   * writes the document* — the same distinction `agentDepth` draws. **When** to
   * coalesce is not decided here; the caller passes the flag, so the policy
   * stays in `lib/editor/code-panel.ts` where a node test can reach it.
   */
  commit: (cmd: EditorCommand | null, coalesce?: boolean) => void
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
      // Frame 0, layer 0, not the previous indices: another document's indices
      // mean nothing.
      set({ doc, frame: 0, layer: 0, past: [], future: [] })
      scheduleSave()
    },

    setLayer: (i) => {
      const { doc, frame } = get()
      set({ layer: clampLayer(doc, frame, i) })
    },

    // 10-animation.md §0.1: the active layer keeps its own index across a frame
    // change when that index still exists in the new frame, and clamps to the
    // last one when it does not — clampLayer already does exactly this, given
    // the NEW frame rather than the old one.
    setFrame: (i) => {
      const { doc, layer } = get()
      const f = clampFrame(doc, i)
      set({ frame: f, layer: clampLayer(doc, f, layer) })
    },

    commit: (cmd, coalesce = false) => {
      if (!cmd) return // an empty stroke must not consume an undo step
      const { doc, past, frame, layer, agentDepth } = get()
      if (!doc) return
      const next = applyCommand(doc, cmd)
      // One clamp on every write path. Deleting the top layer, undoing an add,
      // deleting or reordering a frame, replacing the document from an agent
      // session — each of them can leave the active index past the end, and
      // enumerating them is how one gets missed. Frame first, since a clamped
      // layer index depends on which frame it is being clamped into.
      const nextFrame = clampFrame(next, frame)
      const nextLayer = clampLayer(next, nextFrame, layer)

      // Still the only writer — an agent session changes what happens to history,
      // not who writes the document.
      if (agentDepth > 0) {
        set({ doc: next, frame: nextFrame, layer: nextLayer })
        scheduleSave()
        return
      }

      // Merge into the step already on top, keeping ITS `before`. Keeping the
      // new command's `before` would undo to the previous keystroke instead of
      // to where the burst of typing started, which is a coalesce that saves
      // nothing.
      const top = past[past.length - 1]
      if (coalesce && top && top.type === 'replace_doc' && cmd.type === 'replace_doc' &&
          top.label === cmd.label) {
        set({
          doc: next,
          frame: nextFrame,
          layer: nextLayer,
          past: [...past.slice(0, -1), { ...cmd, before: top.before }],
          future: [],
        })
        scheduleSave()
        return
      }

      const trimmed = past.length >= HISTORY_CAP ? past.slice(past.length - HISTORY_CAP + 1) : past
      set({ doc: next, frame: nextFrame, layer: nextLayer, past: [...trimmed, cmd], future: [] })
      scheduleSave()
    },

    undo: () => {
      const { doc, past, future, frame, layer } = get()
      if (!doc || past.length === 0) return
      const cmd = past[past.length - 1]!
      const next = applyCommand(doc, invertCommand(cmd))
      const nextFrame = clampFrame(next, frame)
      set({
        doc: next,
        frame: nextFrame,
        layer: clampLayer(next, nextFrame, layer),
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
      const nextFrame = clampFrame(next, frame)
      set({
        doc: next,
        frame: nextFrame,
        layer: clampLayer(next, nextFrame, layer),
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
  /**
   * Auto means "show it where it helps" — the renderer already suppresses the
   * grid below GRID_MIN_SCALE, so Auto is a NAME for behaviour that has always
   * been there rather than a new rule. On overrides that and draws it at every
   * zoom. See docs/specs/16-settings.md §1.
   */
  gridMode: GridMode
  /** A checkerboard under transparent pixels. Off by default — spec 16 §2. */
  transparencyGrid: boolean
  /**
   * Mirrors painted cells as you draw. View state, not document state: a
   * document does not remember it was drawn symmetrically. Spec 16 §3.
   */
  symmetry: Symmetry
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
  settingsOpen: boolean
  /** Whether the animation timeline strip is on screen. Same shape as `layersOpen`. */
  timelineOpen: boolean
  /**
   * Onion skinning — previous/next frame drawn tinted beneath the current one.
   * Spec 10 §4: off by default, per-session rather than persisted, and the
   * renderer disables it during playback regardless of this flag.
   */
  onionSkin: boolean
  /** Ping-pong toggle for playback — spec 10 §3's `⟲`. Lives here rather than
   *  in the playback store because it is a setting, not scheduling state. */
  pingPong: boolean
  /**
   * Whether the code panel is on screen, and how wide it is.
   *
   * The panel is a centred modal, not a split (spec 07 §9.11 / 08 §14) — the
   * width still lives here rather than inside the panel because it is
   * persisted to localStorage across opens, the same as before the modal
   * change; only the layout that consumes it moved.
   */
  codeOpen: boolean
  codeWidth: number
  /** Which format tab is showing — `'code'` is the only editable one. Clamped
   *  back to `'code'` whenever the document's frame count makes the current
   *  tab unreachable (08 §14.1). */
  codeTab: FormatTabId
  /**
   * The document cell the code panel's caret is inside, outlined on the canvas.
   * Spec 07 §4 — panel → canvas, the half of click-to-locate that makes the
   * link feel real rather than claimed. Null whenever the caret is not in a
   * pixel row, which is most of the file. Degraded but not removed by the
   * modal change — 08 §14.3.
   */
  codeCell: { x: number; y: number } | null
  /**
   * One line of status, shown over the canvas. Null when there is nothing to
   * say. See docs/specs/17-file-menu.md §9.6.
   *
   * This used to be local state in `app/page.tsx`, reachable only by the
   * corrupt-draft notice it was written for. Paste image is its second caller —
   * F-M2, F-M3 and F-M5 are all "never go silent" requirements and a blocking
   * `window.alert` after a *successful* paste is not an acceptable way to meet
   * them. Lifting it here rather than adding a second mechanism keeps one
   * channel for "the app has something to tell you".
   *
   * `seq` exists because two identical messages in a row are a real case —
   * pressing ⌘V twice with text on the clipboard — and a string that does not
   * change cannot restart a dismissal timer.
   *
   * `sticky` stays until it is dismissed. The corrupt-draft notice this channel
   * was born as had no timer at all, and quietly giving it one would have
   * weakened a rule-7 surface as a side effect of a paste feature: "your last
   * drawing is still saved" is not a message to take away from someone after
   * six seconds. Transient is the default because most messages are; permanent
   * is available because some are about lost work.
   */
  notice: { text: string; seq: number; sticky: boolean } | null

  setTool: (t: Tool) => void
  setColorIndex: (i: number) => void
  setBrushSize: (n: number) => void
  setBrushShape: (s: BrushShape) => void
  setViewport: (vp: Viewport) => void
  setCursor: (c: { x: number; y: number } | null) => void
  toggleGrid: () => void
  setGridMode: (m: GridMode) => void
  setTransparencyGrid: (on: boolean) => void
  setSymmetry: (s: Symmetry) => void
  setPanning: (p: boolean) => void
  setDither: (d: DitherMode) => void
  setSelection: (s: { x: number; y: number; w: number; h: number } | null) => void
  setLayersOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setTimelineOpen: (open: boolean) => void
  setOnionSkin: (on: boolean) => void
  setPingPong: (on: boolean) => void
  setCodeOpen: (open: boolean) => void
  setCodeWidth: (w: number) => void
  setCodeTab: (tab: FormatTabId) => void
  setCodeCell: (c: { x: number; y: number } | null) => void
  /** `null` dismisses. Any string replaces whatever was there. */
  setNotice: (text: string | null, sticky?: boolean) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: 'brush',
  prevTool: 'brush',
  colorIndex: 1,
  brushSize: 1,
  brushShape: 'square',
  viewport: { scale: 16, offsetX: 0, offsetY: 0 },
  cursor: null,
  gridMode: 'auto',
  transparencyGrid: false,
  symmetry: 'off',
  panning: false,
  dither: 'solid',
  selection: null,
  layersOpen: false,
  settingsOpen: false,
  timelineOpen: false,
  onionSkin: false,
  pingPong: false,
  codeOpen: false,
  codeWidth: CODE_DEFAULT_W,
  codeTab: 'code',
  codeCell: null,
  notice: null,

  setTool: (t) => set({ tool: t, prevTool: get().tool }),
  setColorIndex: (i) => set({ colorIndex: i }),
  setBrushSize: (n) => set({ brushSize: Math.max(1, Math.min(8, n)) }),
  setBrushShape: (s) => set({ brushShape: s }),
  setViewport: (vp) => set({ viewport: vp }),
  setCursor: (c) => set({ cursor: c }),
  /**
   * The G key. Two states, not three: a keyboard toggle that cycles through
   * three is a toggle you have to watch to use. Auto counts as on, so one press
   * from the default turns it off.
   */
  toggleGrid: () => set({ gridMode: get().gridMode === 'off' ? 'auto' : 'off' }),
  setGridMode: (m) => set({ gridMode: m }),
  setTransparencyGrid: (on) => set({ transparencyGrid: on }),
  setSymmetry: (s) => set({ symmetry: s }),
  setPanning: (p) => set({ panning: p }),
  setDither: (d) => set({ dither: d }),
  setSelection: (sel) => set({ selection: sel }),
  setLayersOpen: (open) => set({ layersOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setTimelineOpen: (open) => set({ timelineOpen: open }),
  setOnionSkin: (on) => set({ onionSkin: on }),
  setPingPong: (on) => set({ pingPong: on }),
  // Opening always starts on the Code tab — the document itself, and the one
  // tab that's always reachable regardless of frame count. Closing leaves
  // `codeTab` alone; there is nothing left mounted to show it.
  setCodeOpen: (open) => set({ codeOpen: open, ...(open ? { codeTab: 'code' as FormatTabId } : {}) }),
  setCodeWidth: (w) =>
    set({
      codeWidth: clampCodeWidth(w, typeof window === 'undefined' ? Infinity : window.innerWidth),
    }),
  setCodeTab: (tab) => set({ codeTab: tab }),
  setCodeCell: (c) => set({ codeCell: c }),
  setNotice: (text, sticky = false) =>
    set({ notice: text === null ? null : { text, sticky, seq: (get().notice?.seq ?? 0) + 1 } }),
}))
