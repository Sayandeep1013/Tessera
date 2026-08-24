/**
 * docs/specs/18-provider-byok.md §7.2, §9.
 *
 * This route takes a key AND a URL from the browser and makes an outbound request,
 * so it carries the same two rules as the agent route. The §4.1 test is the one
 * that matters: without it, a crafted baseUrl is a way to make this server send a
 * credential somewhere a visitor chose.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/ai/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const KEY = { 'x-api-key': 'sk-user-key' }
const AGENTROUTER = { id: 'anthropic', baseUrl: 'https://agentrouter.org', profile: 'claude-code' }

function mockFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  })
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('the outbound request only ever happens on a user key (§4.1)', () => {
  it('makes NO request at all without x-api-key', async () => {
    const calls = mockFetch({ data: [{ id: 'claude-opus-5' }] })
    const res = await POST(req({ provider: AGENTROUTER }))
    expect(await res.json()).toEqual({ models: [] })
    expect(calls).toHaveLength(0)
  })

  it('makes no request when the base URL fails a gate', async () => {
    const calls = mockFetch({ data: [] })
    const res = await POST(
      req({ provider: { id: 'anthropic', baseUrl: 'http://169.254.169.254' } }, KEY),
    )
    expect(await res.json()).toEqual({ models: [] })
    expect(calls).toHaveLength(0)
  })

  it('makes no request for the gemini provider, which has no catalogue here', async () => {
    const calls = mockFetch({ data: [] })
    await POST(req({ provider: { id: 'gemini' } }, KEY))
    expect(calls).toHaveLength(0)
  })
})

describe('the request it does make', () => {
  it('asks the named host for /v1/models', async () => {
    const calls = mockFetch({ data: [{ id: 'claude-opus-5' }] })
    await POST(req({ provider: AGENTROUTER }, KEY))
    expect(calls[0]!.url).toBe('https://agentrouter.org/v1/models')
  })

  it('sends the compatibility identity only when the profile asks for it', async () => {
    const compat = mockFetch({ data: [] })
    await POST(req({ provider: AGENTROUTER }, KEY))
    expect((compat[0]!.init.headers as Record<string, string>)['user-agent']).toMatch(/claude-cli/)
    vi.unstubAllGlobals()

    const honest = mockFetch({ data: [] })
    await POST(req({ provider: { id: 'anthropic', baseUrl: 'https://api.anthropic.com' } }, KEY))
    expect((honest[0]!.init.headers as Record<string, string>)['user-agent']).toMatch(/^tessera\//)
  })

  it('returns the ids', async () => {
    mockFetch({ data: [{ id: 'claude-opus-5' }, { id: 'claude-sonnet-4-5' }] })
    const res = await POST(req({ provider: AGENTROUTER }, KEY))
    expect(await res.json()).toEqual({ models: ['claude-opus-5', 'claude-sonnet-4-5'] })
  })

  it('caps a relay that lists hundreds', async () => {
    mockFetch({ data: Array.from({ length: 300 }, (_, n) => ({ id: `m-${n}` })) })
    const res = await POST(req({ provider: AGENTROUTER }, KEY))
    expect(((await res.json()) as { models: string[] }).models).toHaveLength(100)
  })
})

describe('an unreadable catalogue degrades, never blocks (§7.2)', () => {
  it('returns an empty list on an upstream error', async () => {
    mockFetch({ error: 'nope' }, 401)
    const res = await POST(req({ provider: AGENTROUTER }, KEY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ models: [] })
  })

  it('returns an empty list when the network throws', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED')
    })
    const res = await POST(req({ provider: AGENTROUTER }, KEY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ models: [] })
  })

  it('survives a malformed body and a malformed catalogue', async () => {
    mockFetch({ nonsense: true })
    expect(await (await POST(req({ provider: AGENTROUTER }, KEY))).json()).toEqual({ models: [] })

    const bad = new Request('http://localhost/api/ai/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...KEY },
      body: '{not json',
    })
    expect(await (await POST(bad)).json()).toEqual({ models: [] })
  })

  it('drops non-string ids rather than passing them to the dialog', async () => {
    mockFetch({ data: [{ id: 'claude-opus-5' }, { id: 42 }, {}] })
    const res = await POST(req({ provider: AGENTROUTER }, KEY))
    expect(await res.json()).toEqual({ models: ['claude-opus-5'] })
  })
})

describe('the key', () => {
  it('never appears in the response', async () => {
    mockFetch({ data: [{ id: 'claude-opus-5' }] })
    const res = await POST(req({ provider: AGENTROUTER }, KEY))
    expect(JSON.stringify(await res.json())).not.toContain('sk-user-key')
  })
})
