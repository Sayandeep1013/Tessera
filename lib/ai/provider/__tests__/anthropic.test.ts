/**
 * docs/specs/18-provider-byok.md §2, §3, §5, §9.
 *
 * fetch is mocked throughout — no test in this repo reaches a real provider
 * (06a §6). The live verification is tools/eval-ai.ts, which is a different thing
 * with a different purpose.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnthropicProvider } from '../anthropic'
import type { ConverseTurn } from '../types'

type Captured = { url: string; init: RequestInit; body: Record<string, unknown> }

function mockFetch(
  respond: (n: number) => { status: number; body: unknown; headers?: Record<string, string> },
) {
  const calls: Captured[] = []
  let n = 0
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) })
    const r = respond(n++)
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
      status: r.status,
      headers: r.headers,
    })
  })
  return calls
}

const ok = (content: unknown[], extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: { model: 'claude-opus-5', stop_reason: 'end_turn', content, ...extra },
})

const provider = (over: Partial<Parameters<typeof createAnthropicProvider>[0]> = {}) =>
  createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-opus-5', ...over })

const HISTORY: ConverseTurn[] = [{ role: 'user', parts: [{ text: 'draw a line' }] }]

const converse = (p = provider()) =>
  p.converse!({ systemPrompt: 'SYS', history: HISTORY, tools: [], maxOutputTokens: 100 })

afterEach(() => vi.unstubAllGlobals())

describe('request shape (§2.1)', () => {
  it('posts to {baseUrl}/v1/messages', async () => {
    const calls = mockFetch(() => ok([{ type: 'text', text: 'hi' }]))
    await converse(provider({ baseUrl: 'https://agentrouter.org' }))
    expect(calls[0]!.url).toBe('https://agentrouter.org/v1/messages')
  })

  it('defaults to api.anthropic.com when no base URL is given', async () => {
    const calls = mockFetch(() => ok([]))
    await converse()
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages')
  })

  it('puts the system prompt in `system`, NOT in messages', async () => {
    const calls = mockFetch(() => ok([]))
    await converse()
    expect(calls[0]!.body.system).toBe('SYS')
    const messages = calls[0]!.body.messages as Array<{ role: string }>
    expect(messages.every((m) => m.role !== 'system')).toBe(true)
  })

  it('always sends max_tokens — a missing one is a 400, not a default', async () => {
    const calls = mockFetch(() => ok([]))
    await converse()
    expect(calls[0]!.body.max_tokens).toBe(100)
  })

  it('sends the anthropic-version header and both auth headers', async () => {
    const calls = mockFetch(() => ok([]))
    await converse()
    const h = calls[0]!.init.headers as Record<string, string>
    expect(h['anthropic-version']).toBe('2023-06-01')
    // Both, deliberately: api.anthropic.com reads x-api-key, relays read Authorization.
    expect(h['x-api-key']).toBe('sk-test')
    expect(h.authorization).toBe('Bearer sk-test')
  })
})

/**
 * A custom undici.Agent dispatcher lived here, and broke every live request in
 * production in ~2s — see the comment above `THINKING_BUDGET` in anthropic.ts
 * for the full reasoning. Removed rather than kept-but-disabled: a passing test
 * for infrastructure that must never be reintroduced is worse than no test.
 */

describe('client identity (§3)', () => {
  it('identifies honestly by default', async () => {
    const calls = mockFetch(() => ok([]))
    await converse()
    const h = calls[0]!.init.headers as Record<string, string>
    expect(h['user-agent']).toMatch(/^tessera\//)
    expect(h['x-app']).toBeUndefined()
  })

  it('sends the claude-code wire image ONLY on the opt-in profile', async () => {
    const calls = mockFetch(() => ok([]))
    await converse(provider({ profile: 'claude-code' }))
    const h = calls[0]!.init.headers as Record<string, string>
    expect(h['user-agent']).toMatch(/^claude-cli\//)
    expect(h['x-app']).toBe('cli')
  })
})

describe('error mapping (§5)', () => {
  const kindOf = async (status: number, body: unknown, headers?: Record<string, string>) => {
    mockFetch(() => ({ status, body, headers }))
    const r = await converse()
    return r.ok ? null : { kind: r.kind, message: r.message, retryAfterMs: r.retryAfterMs }
  }

  it("maps the relay's client refusal to its OWN message, not a bad key", async () => {
    // The row that earns its keep: without it, the most likely first-run failure
    // sends the user off re-typing a key that was never the problem.
    const r = await kindOf(401, {
      error: { message: 'unauthorized client detected' },
      type: 'unauthorized_client_error',
    })
    expect(r!.kind).toBe('config')
    expect(r!.message).toMatch(/^bad_client/)
  })

  it('maps a rejected token to a key error', async () => {
    const r = await kindOf(401, { error: { message: '无效的令牌', type: 'new_api_error' } })
    expect(r!.kind).toBe('config')
    expect(r!.message).toMatch(/key was rejected/)
  })

  it('maps 404 to a model error', async () => {
    const r = await kindOf(404, { error: { type: 'not_found_error', message: 'no such model' } })
    expect(r!.message).toMatch(/^bad_model/)
  })

  it('maps 429 and parses retry-after', async () => {
    const r = await kindOf(429, { error: { type: 'rate_limit_error' } }, { 'retry-after': '30' })
    expect(r!.kind).toBe('rate_limited')
    expect(r!.retryAfterMs).toBe(30_000)
  })

  it('falls back to 20s when 429 carries no retry-after', async () => {
    const r = await kindOf(429, { error: { type: 'rate_limit_error' } })
    expect(r!.retryAfterMs).toBe(20_000)
  })

  it('maps 400 to config with the upstream message', async () => {
    const r = await kindOf(400, { error: { type: 'invalid_request_error', message: 'bad schema' } })
    expect(r!.kind).toBe('config')
    expect(r!.message).toMatch(/bad schema/)
  })

  it('maps 5xx and 529 to unavailable', async () => {
    expect((await kindOf(500, {}))!.kind).toBe('unavailable')
    expect((await kindOf(529, { error: { type: 'overloaded_error' } }))!.kind).toBe('unavailable')
  })

  it('maps a 200 that is not JSON to bad_response', async () => {
    mockFetch(() => ({ status: 200, body: 'not json at all' }))
    const r = await converse()
    expect(r.ok).toBe(false)
    expect(!r.ok && r.kind).toBe('bad_response')
  })

  it('never throws on a network failure', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED')
    })
    const r = await converse()
    expect(r.ok).toBe(false)
    expect(!r.ok && r.kind).toBe('unavailable')
  })

  it('reports a missing key as config rather than sending a request', async () => {
    const calls = mockFetch(() => ok([]))
    const r = await converse(provider({ apiKey: undefined }))
    expect(!r.ok && r.kind).toBe('config')
    expect(calls).toHaveLength(0)
  })
})

describe('stop reasons — checked before touching content (§5)', () => {
  it('maps max_tokens to bad_response', async () => {
    mockFetch(() => ({
      status: 200,
      body: { model: 'm', stop_reason: 'max_tokens', content: [] },
    }))
    const r = await converse()
    expect(!r.ok && r.kind).toBe('bad_response')
  })

  it('maps a refusal WITHOUT indexing into content', async () => {
    // A refusal carries no content block; reading one is the bug 06a §3 records
    // for Gemini, restated here for the same reason.
    mockFetch(() => ({ status: 200, body: { model: 'm', stop_reason: 'refusal' } }))
    const r = await converse()
    expect(!r.ok && r.kind).toBe('refused')
  })

  it('treats a refusal content block as a refusal too', async () => {
    mockFetch(() =>
      ok([{ type: 'refusal' }], { stop_reason: 'end_turn' }),
    )
    const r = await converse()
    expect(!r.ok && r.kind).toBe('refused')
  })
})

describe('converse — success', () => {
  it('returns parts, model, usage and latency', async () => {
    mockFetch(() =>
      ok([{ type: 'tool_use', id: 'a', name: 'draw_line', input: { x1: 1 } }], {
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
    )
    const r = await converse()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.parts).toEqual([{ functionCall: { name: 'draw_line', args: { x1: 1 } } }])
    expect(r.model).toBe('claude-opus-5')
    expect(r.usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 120,
    })
    expect(typeof r.latencyMs).toBe('number')
  })

  it('an empty parts array is a finished turn, not an error', async () => {
    mockFetch(() => ok([]))
    const r = await converse()
    expect(r.ok).toBe(true)
    expect(r.ok && r.parts).toEqual([])
  })

  it('converts tool declarations out of the Gemini dialect', async () => {
    const calls = mockFetch(() => ok([]))
    await provider().converse!({
      systemPrompt: 'SYS',
      history: HISTORY,
      tools: [{ name: 't', description: 'd', parameters: { type: 'OBJECT', properties: {} } }],
      maxOutputTokens: 100,
    })
    const tools = calls[0]!.body.tools as Array<{ input_schema: { type: string } }>
    expect(tools[0]!.input_schema.type).toBe('object')
  })
})

/**
 * Prompt caching. The agent re-sends the whole history every turn, so without this
 * a ten-turn session pays for its opening turn ten times — three and a half eval
 * scenarios cost $3.86 before it existed.
 */
/**
 * Measured 24 Aug 2026: claude-opus-5 has adaptive thinking on BY DEFAULT, and
 * thinking tokens are billed against the same max_tokens ceiling as everything
 * else. Three eval scenarios burned the entire 32,000-token budget reasoning and
 * never reached a tool call. A bounded budget on converse() (never generate(),
 * which forces a tool_choice that an explicit thinking config is incompatible
 * with) guarantees room is left for the actual response.
 */
describe('bounded thinking budget (§5.1 runaway)', () => {
  it('converse() sends an enabled, bounded thinking budget', async () => {
    const calls = mockFetch(() => ok([]))
    await converse()
    const thinking = calls[0]!.body.thinking as { type: string; budget_tokens: number }
    expect(thinking.type).toBe('enabled')
    expect(thinking.budget_tokens).toBeGreaterThan(0)
  })

  it('the thinking budget stays well under max_tokens, leaving room for the answer', async () => {
    const calls = mockFetch(() => ok([]))
    await provider().converse!({
      systemPrompt: 'SYS',
      history: HISTORY,
      tools: [],
      maxOutputTokens: 32_000,
    })
    const thinking = calls[0]!.body.thinking as { budget_tokens: number }
    expect(thinking.budget_tokens).toBeLessThan(32_000)
  })

  it('generate() sends NO thinking config — incompatible with its forced tool_choice', async () => {
    const calls = mockFetch(() =>
      ok([{ type: 'tool_use', id: 'x', name: 'propose_edit', input: {} }]),
    )
    await provider().generate({
      systemPrompt: 'SYS',
      imagePngBase64: 'AAAA',
      userText: 'go',
      jsonSchema: { type: 'object' },
      maxOutputTokens: 500,
    })
    expect(calls[0]!.body.thinking).toBeUndefined()
    expect(calls[0]!.body.tool_choice).toEqual({ type: 'tool', name: 'propose_edit' })
  })
})

describe('prompt caching', () => {
  it('marks the last tool, which caches the tools AND the system prompt above them', async () => {
    const calls = mockFetch(() => ok([]))
    await provider().converse!({
      systemPrompt: 'SYS',
      history: HISTORY,
      tools: [
        { name: 'a', description: 'a', parameters: { type: 'OBJECT' } },
        { name: 'b', description: 'b', parameters: { type: 'OBJECT' } },
      ],
      maxOutputTokens: 100,
    })
    const tools = calls[0]!.body.tools as Array<Record<string, unknown>>
    expect(tools[0]!.cache_control).toBeUndefined()
    expect(tools[1]!.cache_control).toEqual({ type: 'ephemeral' })
  })

  it("marks the last message's last block, so this turn's write is next turn's read", async () => {
    const calls = mockFetch(() => ok([]))
    await converse()
    const messages = calls[0]!.body.messages as Array<{ content: Array<Record<string, unknown>> }>
    const last = messages[messages.length - 1]!
    expect(last.content[last.content.length - 1]!.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('marks no earlier message — four breakpoints is the API limit', async () => {
    const calls = mockFetch(() => ok([]))
    await provider().converse!({
      systemPrompt: 'SYS',
      history: [
        { role: 'user', parts: [{ text: 'one' }] },
        { role: 'model', parts: [{ text: 'two' }] },
        { role: 'user', parts: [{ text: 'three' }] },
      ],
      tools: [],
      maxOutputTokens: 100,
    })
    const messages = calls[0]!.body.messages as Array<{ content: Array<Record<string, unknown>> }>
    const marked = messages.filter((m) => m.content.some((b) => b.cache_control))
    expect(marked).toHaveLength(1)
  })

  it('reports cache reads separately so the saving is visible', async () => {
    mockFetch(() =>
      ok([], {
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 4000,
          cache_creation_input_tokens: 0,
        },
      }),
    )
    const r = await converse()
    expect(r.ok && r.usage?.cacheReadTokens).toBe(4000)
  })

  it('does not cache the single-shot generate path, which has no history to reuse', async () => {
    const calls = mockFetch(() =>
      ok([{ type: 'tool_use', id: 'x', name: 'propose_edit', input: {} }]),
    )
    await provider().generate({
      systemPrompt: 'SYS',
      imagePngBase64: 'AAAA',
      userText: 'go',
      jsonSchema: { type: 'object' },
      maxOutputTokens: 500,
    })
    expect(JSON.stringify(calls[0]!.body)).not.toContain('cache_control')
  })
})

describe('generate — the forced tool (§2.2)', () => {
  const edit = (p = provider()) =>
    p.generate({
      systemPrompt: 'SYS',
      imagePngBase64: 'AAAA',
      userText: 'make it angry',
      jsonSchema: { type: 'object' },
      maxOutputTokens: 500,
    })

  it('forces propose_edit and returns its input as raw', async () => {
    const payload = { summary: 'did it', operations: [] }
    const calls = mockFetch(() =>
      ok([{ type: 'tool_use', id: 'x', name: 'propose_edit', input: payload }]),
    )
    const r = await edit()
    expect(calls[0]!.body.tool_choice).toEqual({ type: 'tool', name: 'propose_edit' })
    expect(r.ok && r.raw).toEqual(payload)
  })

  it('sends the image before the text', async () => {
    const calls = mockFetch(() =>
      ok([{ type: 'tool_use', id: 'x', name: 'propose_edit', input: {} }]),
    )
    await edit()
    const messages = calls[0]!.body.messages as Array<{ content: Array<{ type: string }> }>
    expect(messages[0]!.content.map((c) => c.type)).toEqual(['image', 'text'])
  })

  it('reports bad_response when the model answers without calling the tool', async () => {
    mockFetch(() => ok([{ type: 'text', text: 'I would rather explain' }]))
    const r = await edit()
    expect(!r.ok && r.kind).toBe('bad_response')
  })
})

describe('the contract every provider owes (06a §8)', () => {
  it('declares strict schema support', () => {
    expect(provider().schemaFlavour).toBe('strict')
  })

  it('resolves its model without a network call', async () => {
    expect(await provider().model()).toBe('claude-opus-5')
  })

  it('never throws — every failure is a Result', async () => {
    for (const status of [400, 401, 403, 404, 413, 429, 500, 529]) {
      mockFetch(() => ({ status, body: {} }))
      await expect(converse()).resolves.toHaveProperty('ok', false)
      vi.unstubAllGlobals()
    }
  })
})
