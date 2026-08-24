/**
 * docs/specs/18-provider-byok.md §4.3, §9.
 *
 * The migration test is the one that matters. Before unit I the slot held a bare
 * key string; anyone who had saved one must not have it silently invalidated by an
 * upgrade — hard rule 7's instinct, applied to a credential instead of artwork.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FREE_SESSIONS,
  PROVIDERS,
  checkAccess,
  clearApiKey,
  freeSessionsLeft,
  getApiKey,
  getConfig,
  maskApiKey,
  recordFreeSession,
  setApiKey,
  setConfig,
  toWireProvider,
} from '../byok'

function fakeStorage(throwing = false) {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => {
      if (throwing) throw new Error('denied')
      return map.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (throwing) throw new Error('denied')
      map.set(k, v)
    },
    removeItem: (k: string) => {
      if (throwing) throw new Error('denied')
      map.delete(k)
    },
    _map: map,
  }
}

let storage = fakeStorage()

beforeEach(() => {
  storage = fakeStorage()
  vi.stubGlobal('window', { localStorage: storage })
})
afterEach(() => vi.unstubAllGlobals())

describe('config round trip', () => {
  it('stores and reads back a full anthropic config', () => {
    setConfig({
      providerId: 'anthropic',
      apiKey: 'sk-abc',
      baseUrl: 'https://agentrouter.org',
      model: 'claude-opus-5',
      profile: 'claude-code',
    })
    expect(getConfig()).toEqual({
      providerId: 'anthropic',
      apiKey: 'sk-abc',
      baseUrl: 'https://agentrouter.org',
      model: 'claude-opus-5',
      profile: 'claude-code',
    })
  })

  it('trims the key on the way in', () => {
    setConfig({ providerId: 'gemini', apiKey: '  AIzaSpaced  ' })
    expect(getApiKey()).toBe('AIzaSpaced')
  })

  it('an empty key clears rather than storing a blank', () => {
    setConfig({ providerId: 'gemini', apiKey: 'AIzaX' })
    setConfig({ providerId: 'gemini', apiKey: '   ' })
    expect(getConfig()).toBeNull()
  })

  it('omits the profile unless it is the opt-in one', () => {
    setConfig({ providerId: 'anthropic', apiKey: 'sk-x', profile: 'standard' })
    expect(getConfig()!.profile).toBeUndefined()
  })
})

describe('migration from the pre-spec-18 shape (§4.3)', () => {
  it('reads a legacy bare key as a Gemini key', () => {
    storage._map.set('tessera-api-key', 'AIzaLegacyKey123')
    expect(getConfig()).toEqual({ providerId: 'gemini', apiKey: 'AIzaLegacyKey123' })
  })

  it('keeps the legacy setApiKey path working', () => {
    setApiKey('AIzaSomething')
    expect(getConfig()).toEqual({ providerId: 'gemini', apiKey: 'AIzaSomething' })
  })

  it('treats corrupt JSON as no key rather than sending garbage upstream', () => {
    storage._map.set('tessera-api-key', '{not json')
    expect(getConfig()).toBeNull()
  })

  it('rejects a stored object with no key in it', () => {
    storage._map.set('tessera-api-key', JSON.stringify({ providerId: 'anthropic' }))
    expect(getConfig()).toBeNull()
  })

  it('coerces an unknown providerId back to gemini', () => {
    storage._map.set('tessera-api-key', JSON.stringify({ providerId: 'openai', apiKey: 'k' }))
    expect(getConfig()!.providerId).toBe('gemini')
  })
})

describe('storage that throws (private mode)', () => {
  it('never blocks an edit — reads as no key, writes are dropped', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage(true) })
    expect(() => setConfig({ providerId: 'gemini', apiKey: 'k' })).not.toThrow()
    expect(getConfig()).toBeNull()
    expect(() => clearApiKey()).not.toThrow()
    expect(freeSessionsLeft()).toBe(FREE_SESSIONS)
  })
})

describe('toWireProvider — never carries the key', () => {
  it('drops apiKey and keeps the rest', () => {
    const wire = toWireProvider({
      providerId: 'anthropic',
      apiKey: 'sk-secret',
      baseUrl: 'https://agentrouter.org',
      model: 'claude-opus-5',
      profile: 'claude-code',
    })
    expect(JSON.stringify(wire)).not.toContain('sk-secret')
    expect(wire).toEqual({
      id: 'anthropic',
      baseUrl: 'https://agentrouter.org',
      model: 'claude-opus-5',
      profile: 'claude-code',
    })
  })
})

describe('checkAccess', () => {
  it('a stored key wins over the free counter', () => {
    for (let i = 0; i < FREE_SESSIONS + 3; i++) recordFreeSession()
    setConfig({ providerId: 'anthropic', apiKey: 'sk-x', baseUrl: 'https://api.anthropic.com' })
    const a = checkAccess()
    expect(a.allowed).toBe(true)
    expect(a.allowed && a.usingOwnKey).toBe(true)
    expect(a.allowed && a.usingOwnKey && a.config.id).toBe('anthropic')
  })

  it('allows the free tries, then asks for a key', () => {
    expect(checkAccess().allowed).toBe(true)
    for (let i = 0; i < FREE_SESSIONS; i++) recordFreeSession()
    const a = checkAccess()
    expect(a.allowed).toBe(false)
    expect(!a.allowed && a.reason).toBe('needs-key')
  })

  it('carries no provider config on the free path', () => {
    const a = checkAccess()
    expect(a.allowed && !a.usingOwnKey && a.config).toBeUndefined()
  })
})

describe('presets (§7.1)', () => {
  it('AgentRouter is the only preset that selects the compatibility profile', () => {
    const compat = Object.values(PROVIDERS).filter((p) => p.profile === 'claude-code')
    expect(compat).toHaveLength(1)
    expect(compat[0]!.label).toMatch(/AgentRouter/)
  })

  it('the compatibility preset explains itself in words the user reads (§7.3)', () => {
    expect(PROVIDERS.agentrouter!.note).toMatch(/identifies itself as Claude Code/)
  })

  it('every preset carries a placeholder and a key link', () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      expect(p.placeholder, id).toBeTruthy()
      expect(p.getKeyUrl, id).toMatch(/^https:\/\//)
    }
  })
})

describe('maskApiKey', () => {
  it('shows the ends and hides the middle', () => {
    expect(maskApiKey('sk-abcdefghijklmnop')).toBe('sk-a••••••••mnop')
  })

  it('hides a short key entirely', () => {
    expect(maskApiKey('short')).toBe('••••')
  })
})
