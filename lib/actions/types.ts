/**
 * Action types. See docs/specs/12-agent-actions.md §2.
 *
 * One definition per capability, used by BOTH the toolbar and the agent. That is
 * the point: a UI bug is an agent bug, and shipping a new action gives the agent
 * the capability for free.
 */

import type { z } from 'zod'
import type { Doc } from '../artwork-core/schema'
import type { EditorCommand } from '../artwork-core/commands'
import type { Viewport } from '../renderer/canvas'
import type { BrushShape } from '../editor/brush'

export type ActionKind =
  /** reads state, never mutates — free to call */
  | 'query'
  /** changes UI state; applies immediately, not undoable */
  | 'view'
  /** changes the document; routed through commit() */
  | 'mutate'
  /** destroys work; always requires confirmation */
  | 'destructive'

export type ActionResult = { ok: true; data?: unknown } | { ok: false; error: string }

export const ok = (data?: unknown): ActionResult => ({ ok: true, data })
export const fail = (error: string): ActionResult => ({ ok: false, error })

export type Tool =
  | 'select' | 'brush' | 'eraser' | 'fill'
  | 'rect' | 'marquee' | 'eyedropper' | 'gradient'

export type EditorSnapshot = {
  tool: Tool
  colorIndex: number
  brushSize: number
  brushShape: BrushShape
  viewport: Viewport
  showGrid: boolean
}

/**
 * Cumulative budget for one agent session. `null` when an action is invoked from
 * the UI — a human clicking has no budget.
 */
export type ActionBudget = {
  pixelsLeft: () => number
  colorsLeft: () => number
  /** Returns false if the spend would exceed the budget; nothing is spent. */
  spendPixels: (n: number) => boolean
  spendColor: () => boolean
}

export type ActionCtx = {
  doc: () => Doc | null
  frame: () => number
  /** The layer edits land on. Alongside frame(), because it indexes the document. */
  layer: () => number
  setLayer: (i: number) => void
  commit: (cmd: EditorCommand) => void
  editor: {
    setTool: (t: Tool) => void
    setColorIndex: (i: number) => void
    setBrushSize: (n: number) => void
    setBrushShape: (s: BrushShape) => void
    setViewport: (vp: Viewport) => void
    toggleGrid: (on?: boolean) => void
    state: () => EditorSnapshot
  }
  /**
   * A fresh document id.
   *
   * Injected rather than generated in the catalogue for the same reason
   * `createDoc` takes one: an action that mints its own id is untestable, and
   * artwork-core stays pure. `new_document` is the only caller today — it forks
   * to a new draft so the previous drawing survives in IndexedDB rather than
   * being autosaved over. See docs/specs/17-file-menu.md §7.11.
   */
  newId: () => string
  undo: () => void
  redo: () => void
  historyDepth: () => { undo: number; redo: number }
  /** True only when the user has explicitly approved this specific call. */
  confirmed: boolean
  budget: ActionBudget | null
}

export type Action<I = unknown> = {
  name: string
  /**
   * This IS the prompt the model reads. Write it as guidance, including when NOT
   * to use the action. There is no separate capability list to go stale.
   */
  description: string
  input: z.ZodType<I>
  kind: ActionKind
  run: (input: I, ctx: ActionCtx) => ActionResult
}

/** Helper so each catalogue entry keeps its input type without a cast at the call site. */
export function defineAction<I>(a: Action<I>): Action<I> {
  return a
}
