import { describe, expect, it } from 'vitest'
import { ACTIONS, runAction, toDeclarations, actionNamesByKind } from '../registry'
import { CATALOGUE } from '../catalogue'
import type { ActionCtx } from '../types'
import { makeCtx } from './harness'

describe('registry integrity', () => {
  it('has no duplicate action names', () => {
    expect(ACTIONS.size).toBe(CATALOGUE.length)
  })

  it('emits one declaration per action, with matching names', () => {
    const decls = toDeclarations()
    expect(decls).toHaveLength(CATALOGUE.length)
    expect(decls.map((d) => d.name).sort()).toEqual(CATALOGUE.map((a) => a.name).sort())
  })

  it('every declaration has a non-trivial description and an OBJECT parameter schema', () => {
    for (const d of toDeclarations()) {
      expect(d.description.length, `${d.name} description`).toBeGreaterThan(20)
      expect(d.parameters.type, `${d.name} params`).toBe('OBJECT')
    }
  })

  it('marks required vs optional correctly', () => {
    const setBrush = toDeclarations().find((d) => d.name === 'set_brush')!
    // both fields are optional on set_brush
    expect(setBrush.parameters.required).toBeUndefined()

    const drawLine = toDeclarations().find((d) => d.name === 'draw_line')!
    expect(drawLine.parameters.required?.sort()).toEqual(['i', 'x1', 'x2', 'y1', 'y2'])
  })

  it('maps integer, enum and array types', () => {
    const decls = toDeclarations()
    const selectTool = decls.find((d) => d.name === 'select_tool')!
    expect(selectTool.parameters.properties!.tool!.enum).toContain('brush')

    const drawLine = decls.find((d) => d.name === 'draw_line')!
    expect(drawLine.parameters.properties!.x1!.type).toBe('INTEGER')

    // tuples widen to ARRAY — Gemini declarations have no tuple type
    const setPixels = decls.find((d) => d.name === 'set_pixels')!
    expect(setPixels.parameters.properties!.px!.type).toBe('ARRAY')
    expect(setPixels.parameters.properties!.px!.items!.type).toBe('ARRAY')
  })

  it('groups every action into a known kind', () => {
    const by = actionNamesByKind()
    const total = Object.values(by).reduce((n, a) => n + a.length, 0)
    expect(total).toBe(CATALOGUE.length)
  })
})

describe('runAction — never throws', () => {
  it('rejects an unknown name and lists what exists', () => {
    const { ctx } = makeCtx()
    const r = runAction('teleport', {}, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('no action called "teleport"')
      expect(r.error).toContain('get_state')
    }
  })

  it('rejects malformed arguments with the field named, and mutates nothing', () => {
    const { ctx, committed } = makeCtx()
    const r = runAction('draw_line', { x1: 'nope' }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('x1')
    expect(committed).toHaveLength(0)
  })

  it('survives hostile argument shapes', () => {
    const { ctx } = makeCtx()
    for (const args of [null, undefined, 0, '', [], { __proto__: { x: 1 } }, { px: 'no' }]) {
      expect(() => runAction('set_pixels', args, ctx)).not.toThrow()
    }
  })

  it('catches a throwing handler', () => {
    const { ctx } = makeCtx({ doc: () => { throw new Error('boom') } })
    const r = runAction('get_state', {}, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('boom')
  })
})

describe('queries', () => {
  it('get_state reports the document and editor together', () => {
    const { ctx } = makeCtx()
    const r = runAction('get_state', {}, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const d = r.data as Record<string, unknown>
      expect(d.width).toBe(16)
      expect(d.height).toBe(16)
      expect(d.tool).toBe('brush')
      expect((d.palette as unknown[]).length).toBe(5)
      expect(d.nextColorIndex).toBe(5)
    }
  })

  it('get_grid returns one line per row', () => {
    const { ctx } = makeCtx()
    const r = runAction('get_grid', {}, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const grid = (r.data as { grid: string }).grid
      expect(grid.split('\n')).toHaveLength(16)
    }
  })

  it('get_region rejects a region outside the canvas', () => {
    const { ctx } = makeCtx()
    const r = runAction('get_region', { x: 10, y: 10, w: 20, h: 20 }, ctx)
    expect(r.ok).toBe(false)
  })
})

describe('view actions do not touch the document', () => {
  it('select_tool and set_color change editor state only', () => {
    const { ctx, committed, editor } = makeCtx()
    expect(runAction('select_tool', { tool: 'fill' }, ctx).ok).toBe(true)
    expect(runAction('set_color', { index: 3 }, ctx).ok).toBe(true)
    expect(editor.tool).toBe('fill')
    expect(editor.colorIndex).toBe(3)
    expect(committed).toHaveLength(0)
  })

  it('set_color rejects an index that does not exist', () => {
    const { ctx } = makeCtx()
    const r = runAction('set_color', { index: 99 }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('does not exist')
  })
})

describe('mutations', () => {
  it('draw_line commits exactly one command', () => {
    const { ctx, committed } = makeCtx()
    const r = runAction('draw_line', { x1: 0, y1: 0, x2: 5, y2: 0, i: 1 }, ctx)
    expect(r.ok).toBe(true)
    expect(committed).toHaveLength(1)
    if (r.ok) expect((r.data as { changed: number }).changed).toBeGreaterThan(0)
  })

  it('an out-of-bounds op fails and commits nothing', () => {
    const { ctx, committed } = makeCtx()
    const r = runAction('draw_line', { x1: 0, y1: 0, x2: 99, y2: 0, i: 1 }, ctx)
    expect(r.ok).toBe(false)
    expect(committed).toHaveLength(0)
  })

  it('a no-op edit reports zero changes without committing', () => {
    const { ctx, committed } = makeCtx()
    // row 0 of the face starter is entirely transparent already
    const r = runAction('set_pixels', { px: [[0, 0, 0]] }, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.data as { changed: number }).changed).toBe(0)
    expect(committed).toHaveLength(0)
  })

  it('add_palette_color appends and returns the new index', () => {
    const { ctx, getDoc } = makeCtx()
    const r = runAction('add_palette_color', { color: '#ff0000', name: 'red' }, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.data as { index: number }).index).toBe(5)
    expect(getDoc().palette).toHaveLength(6)
  })

  it('add_palette_color rejects an uppercase or short colour', () => {
    const { ctx } = makeCtx()
    expect(runAction('add_palette_color', { color: '#FF0000' }, ctx).ok).toBe(false)
    expect(runAction('add_palette_color', { color: '#f00' }, ctx).ok).toBe(false)
  })

  it('edit_palette_color refuses index 0', () => {
    const { ctx } = makeCtx()
    const r = runAction('edit_palette_color', { index: 0, color: '#123456' }, ctx)
    expect(r.ok).toBe(false)
  })
})

describe('budgets', () => {
  it('a mutation that exceeds the pixel allowance is refused and commits nothing', () => {
    let left = 3
    const { ctx, committed } = makeCtx({
      budget: {
        pixelsLeft: () => left,
        colorsLeft: () => 4,
        spendPixels: (n) => (n <= left ? ((left -= n), true) : false),
        spendColor: () => true,
      },
    })
    const r = runAction('draw_line', { x1: 0, y1: 0, x2: 10, y2: 0, i: 1 }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('remain in this session')
    expect(committed).toHaveLength(0)
  })

  it('add_palette_color is refused when the colour allowance is spent', () => {
    const { ctx, committed } = makeCtx({
      budget: {
        pixelsLeft: () => 999,
        colorsLeft: () => 0,
        spendPixels: () => true,
        spendColor: () => false,
      },
    })
    const r = runAction('add_palette_color', { color: '#ff0000' }, ctx)
    expect(r.ok).toBe(false)
    expect(committed).toHaveLength(0)
  })
})

describe('destructive actions', () => {
  it('are refused without confirmation, and mutate nothing', () => {
    const { ctx, committed } = makeCtx({ confirmed: false })
    const r = runAction('clear_layer', {}, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('confirmation')
    expect(committed).toHaveLength(0)
  })

  it('run once confirmed', () => {
    const { ctx, committed } = makeCtx({ confirmed: true })
    const r = runAction('clear_layer', {}, ctx)
    expect(r.ok).toBe(true)
    expect(committed).toHaveLength(1)
  })

  it('new_document is gated the same way', () => {
    const a = makeCtx({ confirmed: false })
    expect(runAction('new_document', { width: 8, height: 8 }, a.ctx).ok).toBe(false)
    expect(a.committed).toHaveLength(0)

    const b = makeCtx({ confirmed: true })
    expect(runAction('new_document', { width: 8, height: 8 }, b.ctx).ok).toBe(true)
    expect(b.getDoc().w).toBe(8)
  })
})

describe('finish', () => {
  it('returns the summary and commits nothing', () => {
    const { ctx, committed } = makeCtx()
    const r = runAction('finish', { summary: 'Did the thing.' }, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.data as { summary: string }).summary).toBe('Did the thing.')
    expect(committed).toHaveLength(0)
  })

  it('rejects an empty summary', () => {
    const { ctx } = makeCtx()
    expect(runAction('finish', { summary: '' }, ctx).ok).toBe(false)
  })
})
