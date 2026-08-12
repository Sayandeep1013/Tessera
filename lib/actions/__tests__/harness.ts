/**
 * A shared ActionCtx backed by a real document, so actions are exercised for
 * real rather than against stubs.
 *
 * Extracted from registry.test.ts when the layer actions arrived: two copies of
 * this would drift, and a harness whose active-layer behaviour differs from the
 * store's is a harness that proves nothing about layers.
 */

import { applyCommand, type EditorCommand } from '../../artwork-core/commands'
import { clampLayer } from '../../artwork-core/layers'
import { loadStarter } from '../../artwork-core/create'
import type { Doc } from '../../artwork-core/schema'
import type { ActionCtx, EditorSnapshot } from '../types'

export function makeCtx(over: Partial<ActionCtx> = {}, start?: Doc) {
  let doc: Doc = start ?? loadStarter('face')
  let layer = 0
  // Deterministic, so a test can assert the id a fork took. The app injects
  // nanoid() (lib/store/ctx.ts).
  let ids = 0
  const committed: EditorCommand[] = []
  const editor: EditorSnapshot = {
    tool: 'brush',
    colorIndex: 1,
    brushSize: 1,
    brushShape: 'square',
    viewport: { scale: 16, offsetX: 0, offsetY: 0 },
    showGrid: true,
  }

  const ctx: ActionCtx = {
    doc: () => doc,
    frame: () => 0,
    layer: () => layer,
    setLayer: (i) => {
      layer = clampLayer(doc, 0, i)
    },
    commit: (cmd) => {
      committed.push(cmd)
      doc = applyCommand(doc, cmd)
      // The store clamps on every write path; so must this, or a test would pass
      // here and fail in the app.
      layer = clampLayer(doc, 0, layer)
    },
    editor: {
      setTool: (t) => (editor.tool = t as never),
      setColorIndex: (i) => (editor.colorIndex = i),
      setBrushSize: (n) => (editor.brushSize = n),
      setBrushShape: (s) => (editor.brushShape = s),
      setViewport: (vp) => (editor.viewport = vp),
      toggleGrid: (on) => (editor.showGrid = on ?? !editor.showGrid),
      state: () => ({ ...editor }),
    },
    newId: () => `new-id-${++ids}`,
    undo: () => {},
    redo: () => {},
    historyDepth: () => ({ undo: committed.length, redo: 0 }),
    confirmed: false,
    budget: null,
    ...over,
  }

  return { ctx, committed, getDoc: () => doc, getLayer: () => layer, editor }
}
