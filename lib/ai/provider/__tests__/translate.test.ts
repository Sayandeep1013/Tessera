/**
 * docs/specs/18-provider-byok.md §6, §9.
 *
 * The id-pairing tests are the ones that matter. Gemini pairs a tool response to its
 * call by name; Anthropic pairs by id and rejects the whole request on a mismatch —
 * so getting §6.1 wrong does not degrade a session, it kills every session on turn
 * two with a 400. These tests are the guard.
 */

import { describe, expect, it } from 'vitest'
import {
  fromAnthropicContent,
  toAnthropicMessages,
  toAnthropicTools,
  toJsonSchema,
  toolUseId,
} from '../translate'
import type { ConverseTurn } from '../types'

const png = { inlineData: { mimeType: 'image/png', data: 'AAAA' } }

/** The exact shape lib/agent/run.ts builds: image + instruction, then call/response. */
const session: ConverseTurn[] = [
  { role: 'user', parts: [png, { text: 'make the eyebrows angry' }] },
  {
    role: 'model',
    parts: [
      { text: "I'll read the grid first." },
      { functionCall: { name: 'get_state', args: {} } },
      { functionCall: { name: 'get_grid', args: {} } },
    ],
  },
  {
    role: 'user',
    parts: [
      { functionResponse: { name: 'get_state', response: { ok: true, result: { w: 16 } } } },
      { functionResponse: { name: 'get_grid', response: { ok: true, result: { grid: '...' } } } },
    ],
  },
  { role: 'model', parts: [{ functionCall: { name: 'draw_line', args: { x1: 4, y1: 5 } } }] },
]

describe('toAnthropicMessages — block translation', () => {
  it('maps text, image, call and response to the right block types', () => {
    const m = toAnthropicMessages(session)
    expect(m[0]!.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
    })
    expect(m[0]!.content[1]).toEqual({ type: 'text', text: 'make the eyebrows angry' })
    expect(m[1]!.content[0]).toEqual({ type: 'text', text: "I'll read the grid first." })
    expect(m[1]!.content[1]).toMatchObject({ type: 'tool_use', name: 'get_state', input: {} })
    expect(m[2]!.content[0]).toMatchObject({ type: 'tool_result' })
  })

  it("renames the 'model' role to 'assistant'", () => {
    const roles = toAnthropicMessages(session).map((m) => m.role)
    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant'])
  })

  it('drops empty text blocks, which are a 400', () => {
    const m = toAnthropicMessages([{ role: 'user', parts: [{ text: '   ' }, { text: 'real' }] }])
    expect(m[0]!.content).toEqual([{ type: 'text', text: 'real' }])
  })

  it('omits a turn that translates to nothing rather than sending empty content', () => {
    const m = toAnthropicMessages([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: '' }] },
    ])
    expect(m).toHaveLength(1)
  })

  it('carries tool descriptions across as input_schema', () => {
    const tools = toAnthropicTools([
      { name: 'draw_line', description: 'a line', parameters: { type: 'OBJECT' } },
    ])
    expect(tools[0]!.name).toBe('draw_line')
    expect(tools[0]!.description).toBe('a line')
    expect(tools[0]!.input_schema.type).toBe('object')
  })
})

/**
 * The bug that killed the first live session: every request 400'd because all 25
 * declarations arrived in Gemini's UPPERCASE dialect. It failed identically for
 * every tool, so nothing about the symptom pointed at the schema.
 */
describe('toJsonSchema — Gemini dialect to JSON Schema', () => {
  it('lowercases every type', () => {
    const s = toJsonSchema({
      type: 'OBJECT',
      properties: {
        x1: { type: 'INTEGER' },
        name: { type: 'STRING' },
        fill: { type: 'BOOLEAN' },
        ratio: { type: 'NUMBER' },
        px: { type: 'ARRAY', items: { type: 'INTEGER' } },
      },
      required: ['x1'],
    })
    expect(s.type).toBe('object')
    const p = s.properties as Record<string, { type: string }>
    expect(p.x1!.type).toBe('integer')
    expect(p.name!.type).toBe('string')
    expect(p.fill!.type).toBe('boolean')
    expect(p.ratio!.type).toBe('number')
    expect(p.px!.type).toBe('array')
    expect(s.required).toEqual(['x1'])
  })

  it('recurses into nested arrays of objects', () => {
    const s = toJsonSchema({
      type: 'ARRAY',
      items: { type: 'ARRAY', items: { type: 'INTEGER' } },
    })
    expect(s).toEqual({ type: 'array', items: { type: 'array', items: { type: 'integer' } } })
  })

  it('always emits a properties key for an object, even an empty one', () => {
    // Several actions take no arguments; Anthropic rejects an object schema
    // without the key.
    expect(toJsonSchema({ type: 'OBJECT' })).toEqual({ type: 'object', properties: {} })
  })

  it('keeps descriptions and enums', () => {
    const s = toJsonSchema({ type: 'STRING', description: 'a tool', enum: ['brush', 'fill'] })
    expect(s).toEqual({ type: 'string', description: 'a tool', enum: ['brush', 'fill'] })
  })

  it('drops nullable, which is not JSON Schema', () => {
    expect(toJsonSchema({ type: 'STRING', nullable: true })).toEqual({ type: 'string' })
  })

  it('converts every real declaration to a lowercase-typed schema', () => {
    // The regression guard: if the registry ever changes dialect, this catches it
    // here rather than as a 400 on every live session.
    const walk = (s: unknown): string[] => {
      if (!s || typeof s !== 'object') return []
      const o = s as Record<string, unknown>
      const found = typeof o.type === 'string' ? [o.type] : []
      const kids = [
        ...Object.values((o.properties ?? {}) as Record<string, unknown>),
        ...(o.items ? [o.items] : []),
      ]
      return [...found, ...kids.flatMap(walk)]
    }
    const types = walk(
      toJsonSchema({
        type: 'OBJECT',
        properties: { px: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'INTEGER' } } } },
      }),
    )
    expect(types.every((t) => t === t.toLowerCase())).toBe(true)
  })
})

describe('toAnthropicMessages — tool_use ids (§6.1)', () => {
  it('gives two calls in one turn two DISTINCT ids', () => {
    const assistant = toAnthropicMessages(session)[1]!
    const ids = assistant.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => (b as { id: string }).id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('pairs each tool_result to its call, in order', () => {
    const m = toAnthropicMessages(session)
    const callIds = m[1]!.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => (b as { id: string }).id)
    const resultIds = m[2]!.content
      .filter((b) => b.type === 'tool_result')
      .map((b) => (b as { tool_use_id: string }).tool_use_id)
    expect(resultIds).toEqual(callIds)
  })

  it('counts call ordinals, not part indices — a leading text block must not shift them', () => {
    // session[1] opens with a text part; get_state is still ordinal 0 of turn 1.
    const m = toAnthropicMessages(session)
    const first = m[1]!.content.find((b) => b.type === 'tool_use') as { id: string }
    expect(first.id).toBe(toolUseId(1, 0))
  })

  it('is DETERMINISTIC — the same history translates to the same ids every time', () => {
    // The whole reason position works as identity: a BYOK provider is rebuilt on
    // every request and cannot remember what it minted last turn.
    expect(JSON.stringify(toAnthropicMessages(session))).toBe(
      JSON.stringify(toAnthropicMessages(session)),
    )
  })

  it('does not reuse an id across turns', () => {
    const m = toAnthropicMessages(session)
    const all = m
      .flatMap((msg) => msg.content)
      .filter((b) => b.type === 'tool_use')
      .map((b) => (b as { id: string }).id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('puts every tool_result first, and all of them in ONE message', () => {
    const m = toAnthropicMessages([
      ...session.slice(0, 2),
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'get_state', response: { ok: true } } },
          { text: 'and here is the updated canvas' },
          { functionResponse: { name: 'get_grid', response: { ok: true } } },
        ],
      },
    ])
    const types = m[2]!.content.map((b) => b.type)
    expect(types).toEqual(['tool_result', 'tool_result', 'text'])
  })

  it('fills in a result for a call that never got one, rather than sending a 400', () => {
    const m = toAnthropicMessages([
      ...session.slice(0, 2),
      { role: 'user', parts: [{ functionResponse: { name: 'get_state', response: { ok: true } } }] },
    ])
    const results = m[2]!.content.filter((b) => b.type === 'tool_result')
    expect(results).toHaveLength(2) // two calls, one real answer, one filler
    expect((results[1] as { content: string }).content).toContain('no result was recorded')
  })

  it('drops a stray response that pairs with no call', () => {
    const m = toAnthropicMessages([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'user', parts: [{ functionResponse: { name: 'ghost', response: { ok: true } } }] },
    ])
    expect(m[1]).toBeUndefined()
  })
})

describe('fromAnthropicContent', () => {
  it('maps tool_use to functionCall and text to text', () => {
    expect(
      fromAnthropicContent([
        { type: 'text', text: 'Drawing now.' },
        { type: 'tool_use', id: 'toolu_x', name: 'draw_line', input: { x1: 1 } },
      ]),
    ).toEqual([{ text: 'Drawing now.' }, { functionCall: { name: 'draw_line', args: { x1: 1 } } }])
  })

  it('defaults a missing input to an empty object', () => {
    const parts = fromAnthropicContent([{ type: 'tool_use', id: 'a', name: 'get_state' }])
    expect(parts).toEqual([{ functionCall: { name: 'get_state', args: {} } }])
  })

  it('drops thinking blocks', () => {
    const parts = fromAnthropicContent([
      { type: 'thinking', thinking: 'hmm' },
      { type: 'text', text: 'done' },
    ])
    expect(parts).toEqual([{ text: 'done' }])
  })

  it('returns [] for a missing or non-array content, never throws', () => {
    expect(fromAnthropicContent(undefined)).toEqual([])
    expect(fromAnthropicContent(null)).toEqual([])
    expect(fromAnthropicContent('nope')).toEqual([])
  })
})
