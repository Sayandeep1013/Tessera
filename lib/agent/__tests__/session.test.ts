import { describe, expect, it } from 'vitest'
import { AgentSession } from '../session'
import { MAX_SESSION_COLORS, MAX_SESSION_PIXELS } from '../limits'
import { loadStarter } from '../../artwork-core/create'
import { applyCommand, invertCommand } from '../../artwork-core/commands'
import { runAction } from '../../actions/registry'
import type { ActionCtx, EditorSnapshot } from '../../actions/types'
import type { Doc } from '../../artwork-core/schema'

/**
 * A harness that behaves the way the real store will: mutations apply to the live
 * document but never reach history while a session is open.
 */
function harness() {
  let doc: Doc = loadStarter('face')
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

  return { session, ctx, call, history, getDoc: () => doc, editor }
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
    const results = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map((c) =>
      h.call('add_palette_color', { color: c }),
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
})
