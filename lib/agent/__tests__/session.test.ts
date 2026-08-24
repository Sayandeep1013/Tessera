import { describe, expect, it } from 'vitest'
import { AgentSession, currentSession } from '../session'
import { MAX_SESSION_COLORS, MAX_SESSION_PIXELS } from '../limits'
import { createDoc, loadStarter } from '../../artwork-core/create'
import { cloneDoc } from '../../artwork-core/codec'
import { clampLayer } from '../../artwork-core/layers'
import { applyCommand, invertCommand } from '../../artwork-core/commands'
import { runAction } from '../../actions/registry'
import type { ActionCtx, EditorSnapshot } from '../../actions/types'
import type { Doc } from '../../artwork-core/schema'

/** Every layer's pixels, as plain arrays — easy to deep-compare. */
function layerPixels(doc: Doc): number[][] {
  return doc.frames[0]!.layers.map((l) => Array.from(l.px))
}

/**
 * A harness that behaves the way the real store will: mutations apply to the live
 * document but never reach history while a session is open.
 */
function harness(start?: Doc) {
  let doc: Doc = start ?? loadStarter('face')
  let layer = 0
  const history: ReturnType<typeof applyCommand> extends never ? never : Array<Parameters<typeof applyCommand>[1]> = []
  const session = new AgentSession('s1', 'make it angrier', doc)

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
    // Deterministic, so "did new_document fork the id" is assertable.
    newId: () => 'forked-id',
    // the interception: apply live, do NOT push to history
    commit: (cmd) => {
      doc = applyCommand(doc, cmd)
    },
    editor: {
      setTool: (t) => (editor.tool = t),
      setColorIndex: (i) => (editor.colorIndex = i),
      setBrushSize: (n) => (editor.brushSize = n),
      setBrushShape: (s) => (editor.brushShape = s),
      setViewport: (vp) => (editor.viewport = vp),
      toggleGrid: (on) => (editor.showGrid = on ?? !editor.showGrid),
      state: () => ({ ...editor }),
    },
    undo: () => {},
    redo: () => {},
    historyDepth: () => ({ undo: history.length, redo: 0 }),
    confirmed: true,
    budget: session.budget,
  }

  const call = (name: string, args: unknown = {}) => {
    const r = runAction(name, args, ctx)
    session.record(name, args, r)
    return r
  }

  return { session, ctx, call, history, getDoc: () => doc, getLayer: () => layer, editor }
}

describe('session collapses to one command', () => {
  it('N mutations produce exactly one history entry', () => {
    const h = harness()
    expect(h.call('draw_line', { x1: 1, y1: 1, x2: 6, y2: 1, i: 1 }).ok).toBe(true)
    expect(h.call('draw_line', { x1: 1, y1: 2, x2: 6, y2: 2, i: 3 }).ok).toBe(true)
    expect(h.call('set_pixels', { px: [[8, 8, 1]] }).ok).toBe(true)

    const out = h.session.finalise(h.getDoc(), 'did three things', 'finish')
    expect(out.command).not.toBeNull()
    expect(out.command!.type).toBe('ai_edit')
    expect(out.changed).toBeGreaterThan(0)
  })

  it('the single command inverts back to the exact starting document', () => {
    const h = harness()
    const start = loadStarter('face')

    h.call('draw_line', { x1: 2, y1: 2, x2: 10, y2: 2, i: 1 })
    h.call('flood_fill', { x: 0, y: 0, i: 2 })
    h.call('replace_color', { from: 2, to: 3 })

    const out = h.session.finalise(h.getDoc(), 's', 'finish')
    expect(out.command).not.toBeNull()

    // apply then invert, from the ORIGINAL — the round trip must be exact
    const applied = applyCommand(start, out.command!)
    const back = applyCommand(applied, invertCommand(out.command!))
    expect(Array.from(back.frames[0]!.layers[0]!.px)).toEqual(
      Array.from(start.frames[0]!.layers[0]!.px),
    )
  })

  it('intermediate churn does not survive — draw then erase is a no-op', () => {
    const h = harness()
    h.call('set_pixels', { px: [[0, 0, 1]] })
    h.call('set_pixels', { px: [[0, 0, 0]] })

    const out = h.session.finalise(h.getDoc(), 'nothing', 'finish')
    expect(out.changed).toBe(0)
    expect(out.command).toBeNull()
  })

  it('view actions are not recorded in the diff', () => {
    const h = harness()
    h.call('select_tool', { tool: 'fill' })
    h.call('set_color', { index: 3 })
    h.call('set_zoom', { scale: 8 })
    h.call('toggle_grid', {})

    const out = h.session.finalise(h.getDoc(), 'looked around', 'finish')
    expect(out.command).toBeNull()
    expect(h.editor.tool).toBe('fill')
  })

  it('records every step, successes and failures alike', () => {
    const h = harness()
    h.call('draw_line', { x1: 0, y1: 0, x2: 4, y2: 0, i: 1 })
    h.call('draw_line', { x1: 0, y1: 0, x2: 999, y2: 0, i: 1 }) // fails
    h.call('nope', {}) // unknown

    expect(h.session.steps).toHaveLength(3)
    expect(h.session.steps[0]!.result.ok).toBe(true)
    expect(h.session.steps[1]!.result.ok).toBe(false)
    expect(h.session.steps[2]!.result.ok).toBe(false)
  })
})

describe('stopping early', () => {
  it('finalises with the work completed so far', () => {
    const h = harness()
    h.call('draw_line', { x1: 1, y1: 1, x2: 8, y2: 1, i: 1 })

    const out = h.session.finalise(h.getDoc(), 'stopped', 'abort')
    expect(out.stoppedBy).toBe('abort')
    expect(out.command).not.toBeNull()
    expect(out.changed).toBeGreaterThan(0)
  })

  it('marks the session closed', () => {
    const h = harness()
    expect(h.session.isClosed).toBe(false)
    h.session.finalise(h.getDoc(), 'x', 'finish')
    expect(h.session.isClosed).toBe(true)
  })
})

describe('budgets are cumulative across the session', () => {
  it('stops mutating once the pixel allowance is spent', () => {
    const h = harness()
    let spent = 0 // calls that actually changed pixels
    let refused = 0

    // Flood the whole 16x16 canvas, alternating colour so a pass genuinely changes
    // 256 pixels. Note: once a call is REFUSED the document stops alternating, so
    // the following same-colour fill is a real no-op that succeeds without
    // spending. Count changing calls, not ok calls.
    for (let n = 0; n < 40; n++) {
      const r = h.call('draw_rect', { x: 0, y: 0, w: 16, h: 16, i: (n % 2) + 1, fill: true })
      if (!r.ok) refused++
      else if (((r.data as { changed: number }).changed ?? 0) > 0) spent++
    }

    expect(spent).toBeGreaterThan(0)
    expect(refused).toBeGreaterThan(0)
    // 2000 / 256 -> at most 7 full passes fit
    expect(spent).toBeLessThanOrEqual(Math.floor(MAX_SESSION_PIXELS / 256))
    expect(h.session.budget.pixelsLeft()).toBeLessThan(256)
  })

  it('caps new palette colours', () => {
    const h = harness()
    // Generated from the constant, not a list of literals: the list was six long
    // against a cap of four, and raising the cap to twelve turned "more than the
    // budget" into "fewer than the budget" without the test noticing what it had
    // stopped testing.
    const tries = MAX_SESSION_COLORS + 2
    const results = Array.from({ length: tries }, (_, n) =>
      h.call('add_palette_color', { color: `#${(n + 1).toString(16).padStart(6, '0')}` }),
    )
    const okCount = results.filter((r) => r.ok).length
    expect(okCount).toBe(MAX_SESSION_COLORS)
    expect(h.session.budget.colorsLeft()).toBe(0)
  })
})

describe('dimension changes fall back to replace_doc', () => {
  it('new_document produces a whole-document command that still inverts', () => {
    const h = harness()
    const start = loadStarter('face')
    h.call('new_document', { width: 8, height: 8 })

    const out = h.session.finalise(h.getDoc(), 'started over', 'finish')
    expect(out.command!.type).toBe('replace_doc')

    const back = applyCommand(applyCommand(start, out.command!), invertCommand(out.command!))
    expect(back.w).toBe(16)
    expect(back.h).toBe(16)
  })

  /**
   * The guard that made forking the id safe — spec 17 §7.11.
   *
   * A SAME-SIZE new_document passes the dimension check (16x16 over 16x16) and
   * the layer-shape check (a blank canvas has the same single layer), so before
   * this guard the session collapsed to an `ai_edit` carrying pixels only. Undo
   * would then restore the artwork under the NEW id and orphan the old draft:
   * the same silent-corruption class as the ai_edit palette bug in 14 §0.2.
   */
  it('a same-size new_document still falls back, because the id changed', () => {
    const h = harness()
    const start = loadStarter('face')
    h.call('new_document', { width: start.w, height: start.h })

    expect(h.getDoc().w).toBe(start.w)
    expect(h.getDoc().h).toBe(start.h)
    expect(h.getDoc().id).not.toBe(start.id)

    const out = h.session.finalise(h.getDoc(), 'started over', 'finish')
    expect(out.command!.type).toBe('replace_doc')

    const back = applyCommand(applyCommand(start, out.command!), invertCommand(out.command!))
    expect(back.id).toBe(start.id)
    expect(Array.from(back.frames[0]!.layers[0]!.px))
      .toEqual(Array.from(start.frames[0]!.layers[0]!.px))
  })
})

describe('only one session is open at a time', () => {
  /**
   * Spec §4. Two sessions sharing one document would each diff against their own
   * `before`, so the second's collapsed command would contain the first's
   * changes too — and one undo would silently revert work the user believed was
   * already committed.
   */
  it('opening a second session finalises the first', () => {
    const doc = loadStarter('face')
    const first = new AgentSession('a', 'one', doc)
    expect(first.isClosed).toBe(false)
    expect(currentSession()).toBe(first)

    const second = new AgentSession('b', 'two', doc)
    expect(first.isClosed).toBe(true)
    expect(currentSession()).toBe(second)
  })

  it('clears the open session when it finalises', () => {
    const doc = loadStarter('face')
    const s = new AgentSession('a', 'one', doc)
    s.finalise(doc, 'done', 'finish')
    expect(currentSession()).toBeNull()
  })

  it('a finalised session is not re-finalised by the next one opening', () => {
    const doc = loadStarter('face')
    const first = new AgentSession('a', 'one', doc)
    const out = first.finalise(doc, 'done', 'finish')
    expect(out.stoppedBy).toBe('finish')

    new AgentSession('b', 'two', doc)
    // still 'finish' — opening another session must not rewrite a closed one
    expect(out.stoppedBy).toBe('finish')
  })
})

// ─── layers. See docs/specs/14-layers.md §8.6. ───────────────────────────────

/**
 * A 8x8 document with three empty layers, so a session can paint on more than
 * one and the collapse has something to get wrong.
 */
function layeredDoc(): Doc {
  const doc = createDoc({ id: 'layered', w: 8, h: 8, now: '2026-08-11T00:00:00.000Z' })
  doc.frames[0]!.layers.push({ n: 'over', px: new Uint8Array(64) })
  doc.frames[0]!.layers.push({ n: 'top', px: new Uint8Array(64) })
  return doc
}

describe('session collapse across layers', () => {
  it('a session confined to one layer collapses to an ai_edit carrying that index', () => {
    const start = layeredDoc()
    const h = harness(cloneDoc(start))
    expect(h.call('select_layer', { index: 1 }).ok).toBe(true)
    expect(h.call('draw_line', { x1: 0, y1: 0, x2: 7, y2: 0, i: 1 }).ok).toBe(true)

    const out = h.session.finalise(h.getDoc(), 'drew a line', 'finish', 0, h.getLayer())
    expect(out.command!.type).toBe('ai_edit')
    expect((out.command as { layer: number }).layer).toBe(1)

    const back = applyCommand(h.getDoc(), invertCommand(out.command!))
    expect(layerPixels(back)).toEqual(layerPixels(start))
  })

  /**
   * The case that made the fallback necessary. A single-layer ai_edit would
   * describe one of these two strokes and silently leave the other behind on
   * undo.
   */
  it('a session that paints on two layers collapses to replace_doc', () => {
    const start = layeredDoc()
    const h = harness(cloneDoc(start))
    h.call('select_layer', { index: 1 })
    h.call('draw_line', { x1: 0, y1: 0, x2: 7, y2: 0, i: 1 })
    h.call('select_layer', { index: 2 })
    h.call('draw_line', { x1: 0, y1: 7, x2: 7, y2: 7, i: 1 })

    const out = h.session.finalise(h.getDoc(), 'two layers', 'finish', 0, h.getLayer())
    expect(out.command!.type).toBe('replace_doc')

    const back = applyCommand(h.getDoc(), invertCommand(out.command!))
    expect(layerPixels(back)).toEqual(layerPixels(start))
  })

  it('a session that adds a layer collapses to replace_doc', () => {
    const start = layeredDoc()
    const h = harness(cloneDoc(start))
    expect(h.call('add_layer', { name: 'shadow' }).ok).toBe(true)
    h.call('draw_line', { x1: 0, y1: 3, x2: 7, y2: 3, i: 1 })

    const out = h.session.finalise(h.getDoc(), 'added a layer', 'finish', 0, h.getLayer())
    expect(out.command!.type).toBe('replace_doc')

    const back = applyCommand(h.getDoc(), invertCommand(out.command!))
    expect(back.frames[0]!.layers).toHaveLength(3)
    expect(layerPixels(back)).toEqual(layerPixels(start))
  })

  it('hiding a layer counts as a shape change and collapses to replace_doc', () => {
    const start = layeredDoc()
    const h = harness(cloneDoc(start))
    h.call('set_layer_visible', { index: 1, visible: false })

    const out = h.session.finalise(h.getDoc(), 'hid a layer', 'finish', 0, h.getLayer())
    expect(out.command!.type).toBe('replace_doc')

    const back = applyCommand(h.getDoc(), invertCommand(out.command!))
    expect(back.frames[0]!.layers[1]!.hidden).toBeFalsy()
  })

  it('a palette-only session still collapses to an ai_edit whose inverse restores the palette', () => {
    const start = layeredDoc()
    const h = harness(cloneDoc(start))
    expect(h.call('add_palette_color', { color: '#abcdef' }).ok).toBe(true)

    const out = h.session.finalise(h.getDoc(), 'added a colour', 'finish', 0, h.getLayer())
    expect(out.command!.type).toBe('ai_edit')
    expect((out.command as { cells: unknown[] }).cells).toHaveLength(0)

    const back = applyCommand(h.getDoc(), invertCommand(out.command!))
    expect(back.palette).toHaveLength(start.palette.length)
  })
})

/**
 * Found by tools/eval-ai.ts scenario C1, 24 Aug 2026 (docs/specs/19 §5).
 *
 * "Change the body from blue to purple" — claude-opus-5 answered by recolouring
 * palette entries and touching no pixel at all. That is a BETTER answer than
 * repainting, and the collapse had no way to express it: diff() reports palette
 * entries that were appended, never ones rewritten in place, so the session ended
 * with an empty diff, `command: null`, and a panel saying nothing had changed —
 * over a canvas that was now visibly purple, with no way to undo it.
 */
describe('a palette-only session is still undoable', () => {
  it('collapses to replace_doc rather than to nothing', () => {
    const h = harness()
    expect(h.call('edit_palette_color', { index: 1, color: '#9a5cf0' }).ok).toBe(true)

    const out = h.session.finalise(h.getDoc(), 'recoloured the outline', 'finish')
    expect(out.command).not.toBeNull()
    expect(out.command!.type).toBe('replace_doc')
    expect(out.changed).toBeGreaterThan(0)
  })

  it('undoing it restores the original colour', () => {
    const h = harness()
    const start = cloneDoc(h.getDoc())
    h.call('edit_palette_color', { index: 2, color: '#9a5cf0' })

    const out = h.session.finalise(h.getDoc(), 'recoloured', 'finish')
    const restored = applyCommand(h.getDoc(), invertCommand(out.command!))
    expect(restored.palette.map((p) => p.c)).toEqual(start.palette.map((p) => p.c))
  })

  it('a pixel edit with no palette change still collapses to ai_edit', () => {
    // The guard must not turn every session into a whole-document replacement.
    const h = harness()
    h.call('set_pixels', { px: [[8, 8, 1]] })
    const out = h.session.finalise(h.getDoc(), 'one pixel', 'finish')
    expect(out.command!.type).toBe('ai_edit')
  })

  it('an APPENDED colour is still an ai_edit, not a replacement', () => {
    // add_palette_color is already carried correctly by ai_edit's paletteAdded;
    // the guard deliberately ignores entries after the shared prefix.
    const h = harness()
    h.call('add_palette_color', { c: '#123456' })
    h.call('set_pixels', { px: [[8, 8, 1]] })
    const out = h.session.finalise(h.getDoc(), 'added a colour', 'finish')
    expect(out.command!.type).toBe('ai_edit')
  })
})

/**
 * The headline said "256 pixels changed" beside "0 added, 0 changed, 0 cleared" —
 * two statements that cannot both be true. Found by eval scenario C1, 24 Aug 2026.
 */
describe('the changed count means what the panel claims it means', () => {
  it('counts only the pixels a palette edit actually recoloured', () => {
    const h = harness()
    const doc = h.getDoc()
    // How many cells render with palette index 2 on the starting artwork.
    let expected = 0
    const px = doc.frames[0]!.layers[0]!.px
    for (const v of px) if (v === 2) expected++
    expect(expected).toBeGreaterThan(0)

    h.call('edit_palette_color', { index: 2, color: '#a855f7' })
    const out = h.session.finalise(h.getDoc(), 'recoloured', 'finish')
    expect(out.changed).toBe(expected)
    expect(out.changed).toBeLessThan(doc.w * doc.h)
  })

  it('reports zero when a session replaced the document with an identical one', () => {
    const h = harness()
    const out = h.session.finalise(cloneDoc(h.getDoc()), 'nothing', 'finish')
    expect(out.changed).toBe(0)
  })

  it('still reports the whole canvas when the dimensions changed', () => {
    // A resize cannot be compared cell by cell, so w*h remains the honest answer.
    const h = harness()
    h.call('new_document', { width: 8, height: 8 })
    const out = h.session.finalise(h.getDoc(), 'new canvas', 'finish')
    expect(out.command!.type).toBe('replace_doc')
    expect(out.changed).toBe(64)
  })
})
