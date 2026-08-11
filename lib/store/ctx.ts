'use client'

/**
 * The bridge from stores to the action registry. See docs/specs/12-agent-actions.md §2.
 *
 * One definition per capability, used by both the toolbar and the agent. That is
 * the whole point of the registry: a UI bug is an agent bug, and shipping an
 * action gives the agent the capability for free. Two bridges would quietly undo
 * it, so this is the only one — the agent runner wraps this context rather than
 * building its own.
 */

import { runAction } from '../actions/registry'
import type { ActionCtx, ActionResult } from '../actions/types'
import { useDocStore, useEditorStore } from './editor'

export function buildCtx(overrides: Partial<ActionCtx> = {}): ActionCtx {
  return {
    doc: () => useDocStore.getState().doc,
    frame: () => useDocStore.getState().frame,
    commit: (cmd) => useDocStore.getState().commit(cmd),
    editor: {
      setTool: (t) => useEditorStore.getState().setTool(t),
      setColorIndex: (i) => useEditorStore.getState().setColorIndex(i),
      setBrushSize: (n) => useEditorStore.getState().setBrushSize(n),
      setBrushShape: (s) => useEditorStore.getState().setBrushShape(s),
      setViewport: (vp) => useEditorStore.getState().setViewport(vp),
      toggleGrid: (on) => {
        const e = useEditorStore.getState()
        if (on === undefined || on !== e.showGrid) e.toggleGrid()
      },
      state: () => {
        const e = useEditorStore.getState()
        return {
          tool: e.tool,
          colorIndex: e.colorIndex,
          brushSize: e.brushSize,
          brushShape: e.brushShape,
          viewport: e.viewport,
          showGrid: e.showGrid,
        }
      },
    },
    undo: () => useDocStore.getState().undo(),
    redo: () => useDocStore.getState().redo(),
    historyDepth: () => {
      const d = useDocStore.getState()
      return { undo: d.past.length, redo: d.future.length }
    },
    // A human clicking a button IS the confirmation, and no budget applies to
    // someone spending their own effort. Both differ for the agent, which
    // overrides them.
    confirmed: true,
    budget: null,
    ...overrides,
  }
}

/**
 * Run an action from the UI. Never throws — the registry turns every failure into
 * a typed result, and a toolbar button has nowhere useful to throw to.
 */
export function runUi(name: string, args: unknown = {}): ActionResult {
  return runAction(name, args, buildCtx())
}
