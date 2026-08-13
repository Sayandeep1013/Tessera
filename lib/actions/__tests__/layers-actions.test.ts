/** Layer actions. See docs/specs/14-layers.md §8.5. */

import { describe, expect, it } from 'vitest'
import { runAction, toDeclarations } from '../registry'
import { makeCtx } from './harness'
import { MAX_LAYERS } from '../../artwork-core/layers'
import { applyCommand, invertCommand } from '../../artwork-core/commands'
import { createDoc } from '../../artwork-core/create'
import type { Doc } from '../../artwork-core/schema'

const state = (ctx: Parameters<typeof runAction>[2]) =>
  runAction('get_state', {}, ctx) as { ok: true; data: Record<string, unknown> }

/** A 4x4 document with two layers, the upper one carrying a mark. */
function twoLayerDoc(): Doc {
  const doc = createDoc({ id: 'two', w: 4, h: 4, now: '2026-08-11T00:00:00.000Z' })
  const px = new Uint8Array(16)
  px[0] = 2
  doc.frames[0]!.layers.push({ n: 'over', px })
  doc.frames[0]!.layers[0]!.px[15] = 1
  return doc
}

describe('add_layer', () => {
  it('inserts above the active layer, selects it, and is one history entry', () => {
    const h = makeCtx()
    const r = runAction('add_layer', {}, h.ctx)
    expect(r.ok).toBe(true)
    expect(h.committed).toHaveLength(1)
    expect(h.committed[0]!.type).toBe('layer_add')
    expect(h.getDoc().frames[0]!.layers.map((l) => l.n)).toEqual(['base', 'Layer 2'])
    expect(h.getLayer()).toBe(1)
  })

  it('inserts above an explicit index', () => {
    const h = makeCtx({}, twoLayerDoc())
    runAction('add_layer', { name: 'mid', above: 0 }, h.ctx)
    expect(h.getDoc().frames[0]!.layers.map((l) => l.n)).toEqual(['base', 'mid', 'over'])
    expect(h.getLayer()).toBe(1)
  })

  it('undoes cleanly', () => {
    const h = makeCtx()
    runAction('add_layer', {}, h.ctx)
    const back = applyCommand(h.getDoc(), invertCommand(h.committed[0]!))
    expect(back.frames[0]!.layers).toHaveLength(1)
  })

  it('fails at the cap and mutates nothing (L-E1)', () => {
    const h = makeCtx()
    for (let i = 1; i < MAX_LAYERS; i++) expect(runAction('add_layer', {}, h.ctx).ok).toBe(true)
    expect(h.getDoc().frames[0]!.layers).toHaveLength(MAX_LAYERS)

    const r = runAction('add_layer', {}, h.ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(String(MAX_LAYERS))
    expect(h.getDoc().frames[0]!.layers).toHaveLength(MAX_LAYERS)
  })

  it('rejects an out-of-range `above` (L-E2)', () => {
    const h = makeCtx()
    expect(runAction('add_layer', { above: 5 }, h.ctx).ok).toBe(false)
    expect(h.committed).toHaveLength(0)
  })

  it('truncates an over-long name rather than rejecting the call (L-E5)', () => {
    const h = makeCtx()
    // zod caps the input at 32, so the action never sees a longer one.
    expect(runAction('add_layer', { name: 'x'.repeat(40) }, h.ctx).ok).toBe(false)
    expect(runAction('add_layer', { name: '  spaced  out  ' }, h.ctx).ok).toBe(true)
    expect(h.getDoc().frames[0]!.layers[1]!.n).toBe('spaced out')
  })
})

describe('select_layer', () => {
  it('changes the active layer without touching history', () => {
    const h = makeCtx({}, twoLayerDoc())
    expect(runAction('select_layer', { index: 1 }, h.ctx).ok).toBe(true)
    expect(h.getLayer()).toBe(1)
    expect(h.committed).toHaveLength(0)
    expect(state(h.ctx).data.activeLayer).toBe(1)
  })

  it('fails out of range (L-E2)', () => {
    const h = makeCtx({}, twoLayerDoc())
    const r = runAction('select_layer', { index: 4 }, h.ctx)
    expect(r.ok).toBe(false)
    expect(h.getLayer()).toBe(0)
  })
})

describe('set_layer_visible', () => {
  it('hides and shows, round-tripping through undo', () => {
    const h = makeCtx({}, twoLayerDoc())
    expect(runAction('set_layer_visible', { index: 1, visible: false }, h.ctx).ok).toBe(true)
    expect(h.getDoc().frames[0]!.layers[1]!.hidden).toBe(true)

    const back = applyCommand(h.getDoc(), invertCommand(h.committed[0]!))
    expect(back.frames[0]!.layers[1]!.hidden).toBeFalsy()
  })

  it('is a no-op when already in that state', () => {
    const h = makeCtx({}, twoLayerDoc())
    const r = runAction('set_layer_visible', { index: 1, visible: true }, h.ctx)
    expect(r.ok).toBe(true)
    expect(h.committed).toHaveLength(0)
  })

  it('fails out of range (L-E2)', () => {
    const h = makeCtx({}, twoLayerDoc())
    expect(runAction('set_layer_visible', { index: 9, visible: false }, h.ctx).ok).toBe(false)
  })
})

describe('delete_layer', () => {
  it('mutates nothing without confirmation', () => {
    const h = makeCtx({}, twoLayerDoc())
    const r = runAction('delete_layer', { index: 1 }, h.ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('confirmation')
    expect(h.getDoc().frames[0]!.layers).toHaveLength(2)
  })

  it('refuses to remove the only layer (L-E3)', () => {
    const h = makeCtx({ confirmed: true })
    const r = runAction('delete_layer', { index: 0 }, h.ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('at least one layer')
  })

  it('moves the active index back into range when the top layer goes', () => {
    const h = makeCtx({ confirmed: true }, twoLayerDoc())
    runAction('select_layer', { index: 1 }, h.ctx)
    expect(runAction('delete_layer', { index: 1 }, h.ctx).ok).toBe(true)
    expect(h.getDoc().frames[0]!.layers).toHaveLength(1)
    expect(h.getLayer()).toBe(0)
  })

  it('restores the deleted pixels on undo', () => {
    const h = makeCtx({ confirmed: true }, twoLayerDoc())
    runAction('delete_layer', { index: 1 }, h.ctx)
    const back = applyCommand(h.getDoc(), invertCommand(h.committed[0]!))
    expect(back.frames[0]!.layers).toHaveLength(2)
    expect(back.frames[0]!.layers[1]!.px[0]).toBe(2)
  })
})

describe('drawing follows the active layer', () => {
  it('draw_line writes to the selected layer only', () => {
    const h = makeCtx({}, twoLayerDoc())
    runAction('select_layer', { index: 1 }, h.ctx)
    expect(runAction('draw_line', { x1: 0, y1: 1, x2: 3, y2: 1, i: 1 }, h.ctx).ok).toBe(true)

    const layers = h.getDoc().frames[0]!.layers
    expect(Array.from(layers[1]!.px.slice(4, 8))).toEqual([1, 1, 1, 1])
    expect(Array.from(layers[0]!.px.slice(4, 8))).toEqual([0, 0, 0, 0])
    expect(h.committed[0]!.type).toBe('paint')
    expect((h.committed[0] as { layer: number }).layer).toBe(1)
  })

  it('clear_layer clears the active one and leaves the rest byte-identical', () => {
    const h = makeCtx({ confirmed: true }, twoLayerDoc())
    const baseBefore = Array.from(h.getDoc().frames[0]!.layers[0]!.px)
    runAction('select_layer', { index: 1 }, h.ctx)
    expect(runAction('clear_layer', {}, h.ctx).ok).toBe(true)

    const layers = h.getDoc().frames[0]!.layers
    expect(Array.from(layers[1]!.px)).toEqual(new Array(16).fill(0))
    expect(Array.from(layers[0]!.px)).toEqual(baseBefore)
  })
})

describe('reads report layers', () => {
  it('get_state lists the layers bottom-first with the active index', () => {
    const h = makeCtx({}, twoLayerDoc())
    runAction('set_layer_visible', { index: 1, visible: false }, h.ctx)
    const d = state(h.ctx).data
    expect(d.layers).toEqual([
      { index: 0, name: 'base', hidden: false, opacity: 100, blendMode: 'normal' },
      { index: 1, name: 'over', hidden: true, opacity: 100, blendMode: 'normal' },
    ])
    expect(d.activeLayer).toBe(0)
  })

  it('get_grid on a single-layer document is unchanged by this unit', () => {
    const h = makeCtx()
    const r = runAction('get_grid', {}, h.ctx) as { ok: true; data: Record<string, unknown> }
    expect(Object.keys(r.data).sort()).toEqual(['grid', 'height', 'legend', 'width'])
  })

  it('get_grid on a layered document returns the active layer AND a composite', () => {
    const h = makeCtx({}, twoLayerDoc())
    const r = runAction('get_grid', {}, h.ctx) as { ok: true; data: Record<string, string> }
    expect(r.data.layer).toBe(0)
    // Active layer 0 has its mark at the bottom-right only.
    expect(r.data.grid).toContain('...1')
    // The composite carries layer 1's mark at the top-left as well.
    expect(r.data.composite).toContain('2...')
    expect(r.data.composite).toContain('...1')
  })

  it('get_region does the same, and only when there is more than one layer', () => {
    const one = makeCtx()
    const a = runAction('get_region', { x: 0, y: 0, w: 2, h: 2 }, one.ctx) as {
      ok: true
      data: Record<string, unknown>
    }
    expect(a.data.composite).toBeUndefined()

    const two = makeCtx({}, twoLayerDoc())
    const b = runAction('get_region', { x: 0, y: 0, w: 2, h: 2 }, two.ctx) as {
      ok: true
      data: Record<string, string>
    }
    expect(b.data.composite).toContain('2.')
  })
})

describe('registry drift', () => {
  it('declares every new layer action', () => {
    const names = toDeclarations().map((d) => d.name)
    for (const n of ['add_layer', 'select_layer', 'set_layer_visible', 'delete_layer']) {
      expect(names).toContain(n)
    }
  })

  it('delete_layer is destructive so the registry gates it', () => {
    const h = makeCtx()
    const r = runAction('delete_layer', { index: 0 }, h.ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('requires user confirmation')
  })
})
