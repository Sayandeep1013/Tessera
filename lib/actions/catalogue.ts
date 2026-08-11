/**
 * The action catalogue. See docs/specs/12-agent-actions.md §3.
 *
 * Names are the wire contract with the model — do not rename without regenerating
 * declarations. Descriptions are read by the model, so write them as guidance.
 */

import { z } from 'zod'
import { encodeRows } from '../artwork-core/codec'
import { applyOps, type Op } from '../artwork-core/ops'
import { diff } from '../artwork-core/diff'
import { paintCommand, type PaintCell } from '../artwork-core/commands'
import { createDoc } from '../artwork-core/create'
import { MAX_PALETTE, type Doc } from '../artwork-core/schema'
import { fitViewport, snapScale } from '../editor/viewport'
import { defineAction, fail, ok, type Action, type ActionCtx } from './types'

const TOOLS = [
  'select', 'brush', 'eraser', 'fill', 'rect', 'marquee', 'eyedropper', 'gradient',
] as const

// ─── helpers ─────────────────────────────────────────────────────────────────

function needDoc(ctx: ActionCtx): Doc | null {
  return ctx.doc()
}

const charFor = (i: number) => (i === 0 ? '.' : i <= 9 ? String(i) : String.fromCharCode(87 + i))

function legendOf(doc: Doc): string {
  const lines = doc.palette.map((e, i) => `${charFor(i)} = ${e.c}${e.n ? ` (${e.n})` : ''}`)
  return lines.join('\n')
}

/**
 * Apply a drawing op through the shared implementation, then commit the resulting
 * pixel delta as ONE paint command. Both the agent and the editor's own tools end
 * up in exactly the same place.
 */
function commitOp(op: Op, label: string, ctx: ActionCtx) {
  const doc = needDoc(ctx)
  if (!doc) return fail('no document is open')

  const applied = applyOps(doc, [op], ctx.frame())
  if (!applied.ok) return fail(applied.error.message)

  const d = diff(doc, applied.value, ctx.frame())
  const touched = d.added.length + d.changed.length + d.removed.length
  if (touched === 0) return ok({ changed: 0, note: 'that had no effect' })

  if (ctx.budget && !ctx.budget.spendPixels(touched)) {
    return fail(
      `that would change ${touched} pixels but only ${ctx.budget.pixelsLeft()} remain in this session`,
    )
  }

  const cells: PaintCell[] = []
  for (const [x, y, to] of d.added) cells.push([x, y, 0, to])
  for (const [x, y, from, to] of d.changed) cells.push([x, y, from, to])
  for (const [x, y, from] of d.removed) cells.push([x, y, from, 0])

  const cmd = paintCommand(label, ctx.frame(), cells)
  if (!cmd) return ok({ changed: 0 })
  ctx.commit(cmd)
  return ok({ changed: touched })
}

// ─── query ───────────────────────────────────────────────────────────────────

const getState = defineAction({
  name: 'get_state',
  description:
    'Read everything about the current canvas in one call: dimensions, the full palette, ' +
    'the selected tool and colour, brush settings, zoom, and how deep undo/redo go. ' +
    'Call this first. Prefer it over several smaller queries.',
  input: z.object({}),
  kind: 'query',
  run: (_i, ctx) => {
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    const e = ctx.editor.state()
    const h = ctx.historyDepth()
    return ok({
      width: doc.w,
      height: doc.h,
      frame: ctx.frame(),
      frames: doc.frames.length,
      palette: doc.palette.map((p, i) => ({ index: i, char: charFor(i), color: p.c, name: p.n })),
      paletteFull: doc.palette.length >= MAX_PALETTE,
      nextColorIndex: doc.palette.length < MAX_PALETTE ? doc.palette.length : null,
      tool: e.tool,
      colorIndex: e.colorIndex,
      brushSize: e.brushSize,
      brushShape: e.brushShape,
      zoom: e.viewport.scale,
      showGrid: e.showGrid,
      undoDepth: h.undo,
      redoDepth: h.redo,
    })
  },
})

const getGrid = defineAction({
  name: 'get_grid',
  description:
    'Read the artwork as a text grid: one character per pixel, one line per row, ' +
    'with a palette legend. x increases right from 0, y increases down from 0. ' +
    'Use this to find exact coordinates, and to check your work after editing.',
  input: z.object({}),
  kind: 'query',
  run: (_i, ctx) => {
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    const rows = encodeRows(doc.frames[ctx.frame()]!.layers[0]!.px, doc.w, doc.h)
    const pad = String(doc.h - 1).length
    return ok({
      width: doc.w,
      height: doc.h,
      grid: rows.map((r, i) => `${String(i).padStart(pad)} | ${r}`).join('\n'),
      legend: legendOf(doc),
    })
  },
})

const getRegion = defineAction({
  name: 'get_region',
  description:
    'Read part of the artwork as a text grid. Cheaper than get_grid on a large canvas ' +
    'when you only care about one area, for example just the face.',
  input: z.object({
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  }),
  kind: 'query',
  run: ({ x, y, w, h }, ctx) => {
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    if (x < 0 || y < 0 || x + w > doc.w || y + h > doc.h) {
      return fail(`region is outside the ${doc.w}x${doc.h} canvas`)
    }
    const px = doc.frames[ctx.frame()]!.layers[0]!.px
    const rows: string[] = []
    for (let ry = y; ry < y + h; ry++) {
      let row = ''
      for (let rx = x; rx < x + w; rx++) row += charFor(px[ry * doc.w + rx]!)
      rows.push(`${String(ry).padStart(3)} | ${row}`)
    }
    return ok({ origin: { x, y }, grid: rows.join('\n'), legend: legendOf(doc) })
  },
})

// ─── view ────────────────────────────────────────────────────────────────────

const selectTool = defineAction({
  name: 'select_tool',
  description:
    'Change the active tool. This is what the user sees selected in the toolbar. ' +
    'It does NOT draw anything by itself — use the drawing actions for that.',
  input: z.object({ tool: z.enum(TOOLS) }),
  kind: 'view',
  run: ({ tool }, ctx) => {
    ctx.editor.setTool(tool)
    return ok({ tool })
  },
})

const setColor = defineAction({
  name: 'set_color',
  description:
    'Set the active paint colour to a palette index. Indices come from get_state. ' +
    'If the colour you need is not in the palette, call add_palette_color first.',
  input: z.object({ index: z.number().int().min(0) }),
  kind: 'view',
  run: ({ index }, ctx) => {
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    if (index >= doc.palette.length) {
      return fail(`palette index ${index} does not exist; the palette has ${doc.palette.length} colours`)
    }
    ctx.editor.setColorIndex(index)
    return ok({ index, color: doc.palette[index]!.c })
  },
})

const setBrush = defineAction({
  name: 'set_brush',
  description: 'Change the brush size (1-8 pixels) and/or its shape. Affects later brush strokes.',
  input: z.object({
    size: z.number().int().min(1).max(8).optional(),
    shape: z.enum(['square', 'round']).optional(),
  }),
  kind: 'view',
  run: ({ size, shape }, ctx) => {
    if (size === undefined && shape === undefined) return fail('give a size, a shape, or both')
    if (size !== undefined) ctx.editor.setBrushSize(size)
    if (shape !== undefined) ctx.editor.setBrushShape(shape)
    const e = ctx.editor.state()
    return ok({ size: e.brushSize, shape: e.brushShape })
  },
})

const setZoom = defineAction({
  name: 'set_zoom',
  description:
    'Set the display zoom. This changes only what the user sees; it never alters the artwork. ' +
    'Snapped to the nearest supported step.',
  input: z.object({ scale: z.number().min(1).max(64) }),
  kind: 'view',
  run: ({ scale }, ctx) => {
    const vp = ctx.editor.state().viewport
    const next = snapScale(scale)
    ctx.editor.setViewport({ ...vp, scale: next })
    return ok({ zoom: next })
  },
})

const fitView = defineAction({
  name: 'fit_view',
  description: 'Centre the artwork and zoom so the whole canvas is visible.',
  input: z.object({}),
  kind: 'view',
  run: (_i, ctx) => {
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    const el = typeof document !== 'undefined' ? document.querySelector('canvas') : null
    if (!el) return fail('the canvas is not on screen')
    const r = el.getBoundingClientRect()
    const vp = fitViewport(doc, r.width, r.height)
    ctx.editor.setViewport(vp)
    return ok({ zoom: vp.scale })
  },
})

const toggleGrid = defineAction({
  name: 'toggle_grid',
  description: 'Show or hide the pixel grid overlay. Display only; the artwork is unaffected.',
  input: z.object({ on: z.boolean().optional() }),
  kind: 'view',
  run: ({ on }, ctx) => {
    ctx.editor.toggleGrid(on)
    return ok({ showGrid: ctx.editor.state().showGrid })
  },
})

// ─── mutate ──────────────────────────────────────────────────────────────────

const setPixels = defineAction({
  name: 'set_pixels',
  description:
    'Set individual pixels. Each entry is [x, y, paletteIndex]. Prefer draw_line or ' +
    'draw_rect when the shape has structure — two short lines make a better eyebrow ' +
    'than twelve loose pixels.',
  input: z.object({
    px: z.array(z.tuple([z.number().int(), z.number().int(), z.number().int().min(0)])).min(1),
  }),
  kind: 'mutate',
  run: ({ px }, ctx) => commitOp({ op: 'set_pixels', px }, 'AI: pixels', ctx),
})

const drawLine = defineAction({
  name: 'draw_line',
  description: 'Draw a straight line between two points, endpoints included.',
  input: z.object({
    x1: z.number().int(), y1: z.number().int(),
    x2: z.number().int(), y2: z.number().int(),
    i: z.number().int().min(0),
  }),
  kind: 'mutate',
  run: (a, ctx) => commitOp({ op: 'draw_line', ...a }, 'AI: line', ctx),
})

const drawRect = defineAction({
  name: 'draw_rect',
  description: 'Draw a rectangle. Set fill to false for an outline only.',
  input: z.object({
    x: z.number().int(), y: z.number().int(),
    w: z.number().int().min(1), h: z.number().int().min(1),
    i: z.number().int().min(0),
    fill: z.boolean(),
  }),
  kind: 'mutate',
  run: (a, ctx) => commitOp({ op: 'draw_rect', ...a }, 'AI: rectangle', ctx),
})

const floodFill = defineAction({
  name: 'flood_fill',
  description:
    'Flood fill from a point, replacing the connected area of the colour currently there. ' +
    'Connectivity is 4-way, so diagonals do not leak.',
  input: z.object({
    x: z.number().int(), y: z.number().int(), i: z.number().int().min(0),
  }),
  kind: 'mutate',
  run: (a, ctx) => commitOp({ op: 'flood_fill', ...a }, 'AI: fill', ctx),
})

const replaceColor = defineAction({
  name: 'replace_color',
  description:
    'Replace every pixel of one palette index with another, across the whole frame. ' +
    'The right way to recolour a garment or an outline — far cheaper than listing pixels.',
  input: z.object({ from: z.number().int().min(0), to: z.number().int().min(0) }),
  kind: 'mutate',
  run: (a, ctx) => commitOp({ op: 'replace_color', ...a }, 'AI: recolour', ctx),
})

const addPaletteColor = defineAction({
  name: 'add_palette_color',
  description:
    'Append a colour to the palette and return its new index. Lowercase #rrggbb or ' +
    '#rrggbbaa. Reuse an existing colour where one is close enough; the palette holds ' +
    'at most 36 entries.',
  input: z.object({ color: z.string(), name: z.string().max(32).optional() }),
  kind: 'mutate',
  run: ({ color, name }, ctx) => {
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(color)) {
      return fail(`"${color}" is not a lowercase #rrggbb or #rrggbbaa colour`)
    }
    if (doc.palette.length >= MAX_PALETTE) {
      return fail(`the palette is full (${MAX_PALETTE}); replace a colour instead`)
    }
    if (ctx.budget && !ctx.budget.spendColor()) {
      return fail('no new-colour allowance remains in this session')
    }
    const index = doc.palette.length
    ctx.commit({
      type: 'palette_add',
      label: 'AI: add colour',
      entries: [{ c: color, ...(name ? { n: name } : {}) }],
    })
    return ok({ index, color })
  },
})

const editPaletteColor = defineAction({
  name: 'edit_palette_color',
  description:
    'Change an existing palette colour. Every pixel using that index changes at once — ' +
    'this is how you shift a whole artwork toward a different mood.',
  input: z.object({ index: z.number().int().min(1), color: z.string() }),
  kind: 'mutate',
  run: ({ index, color }, ctx) => {
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    if (index === 0) return fail('index 0 is transparent and cannot be changed')
    const before = doc.palette[index]
    if (!before) return fail(`palette index ${index} does not exist`)
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(color)) {
      return fail(`"${color}" is not a lowercase #rrggbb or #rrggbbaa colour`)
    }
    ctx.commit({
      type: 'palette_edit',
      label: 'AI: edit colour',
      index,
      before: { ...before },
      after: { ...before, c: color },
    })
    return ok({ index, color })
  },
})

const undoAction = defineAction({
  name: 'undo',
  description: 'Undo the last change. Use this to back out of an edit that did not work.',
  input: z.object({}),
  kind: 'mutate',
  run: (_i, ctx) => {
    if (ctx.historyDepth().undo === 0) return fail('there is nothing to undo')
    ctx.undo()
    return ok()
  },
})

const redoAction = defineAction({
  name: 'redo',
  description: 'Redo the change that was just undone.',
  input: z.object({}),
  kind: 'mutate',
  run: (_i, ctx) => {
    if (ctx.historyDepth().redo === 0) return fail('there is nothing to redo')
    ctx.redo()
    return ok()
  },
})

// ─── destructive ─────────────────────────────────────────────────────────────

const newDocument = defineAction({
  name: 'new_document',
  description:
    'Discard the current artwork and start a blank canvas. Destructive — the user is ' +
    'asked to confirm. Only call this when explicitly asked to start over.',
  input: z.object({
    width: z.number().int().min(1).max(256),
    height: z.number().int().min(1).max(256),
  }),
  kind: 'destructive',
  run: ({ width, height }, ctx) => {
    if (!ctx.confirmed) return fail('requires user confirmation')
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    const next = createDoc({ id: doc.id, w: width, h: height, name: doc.name })
    ctx.commit({ type: 'replace_doc', label: 'AI: new document', before: doc, after: next })
    return ok({ width, height })
  },
})

const clearLayer = defineAction({
  name: 'clear_layer',
  description:
    'Erase everything on the current frame, leaving a blank canvas of the same size. ' +
    'Destructive — the user is asked to confirm.',
  input: z.object({}),
  kind: 'destructive',
  run: (_i, ctx) => {
    if (!ctx.confirmed) return fail('requires user confirmation')
    const doc = needDoc(ctx)
    if (!doc) return fail('no document is open')
    const px = doc.frames[ctx.frame()]!.layers[0]!.px
    const cells: PaintCell[] = []
    for (let p = 0; p < px.length; p++) {
      if (px[p] !== 0) cells.push([p % doc.w, Math.floor(p / doc.w), px[p]!, 0])
    }
    const cmd = paintCommand('AI: clear', ctx.frame(), cells)
    if (!cmd) return ok({ cleared: 0 })
    ctx.commit(cmd)
    return ok({ cleared: cells.length })
  },
})

// ─── terminal ────────────────────────────────────────────────────────────────

const finish = defineAction({
  name: 'finish',
  description:
    'Call when the task is complete. Give a one-sentence, past-tense summary of what ' +
    'you changed, in plain language, including anything you could not do.',
  input: z.object({ summary: z.string().min(1).max(200) }),
  kind: 'query',
  run: ({ summary }) => ok({ summary }),
})

// ─────────────────────────────────────────────────────────────────────────────

export const CATALOGUE: Array<Action<never>> = [
  getState, getGrid, getRegion,
  selectTool, setColor, setBrush, setZoom, fitView, toggleGrid,
  setPixels, drawLine, drawRect, floodFill, replaceColor,
  addPaletteColor, editPaletteColor, undoAction, redoAction,
  newDocument, clearLayer,
  finish,
] as unknown as Array<Action<never>>

export const FINISH = 'finish'
