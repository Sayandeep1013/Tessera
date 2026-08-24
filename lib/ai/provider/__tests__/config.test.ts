/**
 * docs/specs/18-provider-byok.md §4.2, §9.
 *
 * This URL is a host the SERVER will make an outbound request to, supplied by
 * whoever is holding the page. Every case below is a thing someone would actually
 * try, and the gates are syntactic by design — §4.2's closing paragraph says what
 * they do not cover and why that is acceptable while §4.1 holds.
 */

import { describe, expect, it } from 'vitest'
import {
  MAX_BASE_URL,
  PRESETS,
  parseClientProvider,
  validateBaseUrl,
  validateModel,
} from '../config'

const err = (r: ReturnType<typeof validateBaseUrl>) => (r.ok ? null : r.error.code)

describe('validateBaseUrl — every gate in §4.2', () => {
  it('accepts the two presets the UI offers', () => {
    for (const preset of Object.values(PRESETS)) {
      const r = validateBaseUrl(preset.baseUrl)
      expect(r.ok, preset.baseUrl).toBe(true)
    }
  })

  it('rejects anything that is not a URL', () => {
    expect(err(validateBaseUrl('agentrouter.org'))).toBe('url_invalid')
    expect(err(validateBaseUrl('not a url at all'))).toBe('url_invalid')
    expect(err(validateBaseUrl(''))).toBe('url_invalid')
  })

  it('rejects every scheme but https', () => {
    expect(err(validateBaseUrl('http://api.anthropic.com'))).toBe('url_scheme')
    expect(err(validateBaseUrl('file:///etc/passwd'))).toBe('url_scheme')
    expect(err(validateBaseUrl('ftp://example.com'))).toBe('url_scheme')
  })

  it('rejects credentials smuggled into the URL', () => {
    expect(err(validateBaseUrl('https://user:pass@api.anthropic.com'))).toBe('url_credentials')
  })

  it('rejects IP literals, v4 and v6, private or not', () => {
    expect(err(validateBaseUrl('https://127.0.0.1'))).toBe('url_ip')
    expect(err(validateBaseUrl('https://10.0.0.5'))).toBe('url_ip')
    expect(err(validateBaseUrl('https://169.254.169.254'))).toBe('url_ip') // the metadata endpoint
    expect(err(validateBaseUrl('https://8.8.8.8'))).toBe('url_ip')
    expect(err(validateBaseUrl('https://[::1]'))).toBe('url_ip')
    expect(err(validateBaseUrl('https://[fd00::1]'))).toBe('url_ip')
  })

  it('rejects loopback and internal names', () => {
    expect(err(validateBaseUrl('https://localhost'))).toBe('url_local')
    expect(err(validateBaseUrl('https://api.localhost'))).toBe('url_local')
    expect(err(validateBaseUrl('https://vault.internal'))).toBe('url_local')
    expect(err(validateBaseUrl('https://printer.local'))).toBe('url_local')
    expect(err(validateBaseUrl('https://router.home.arpa'))).toBe('url_local')
  })

  it('rejects a path, a query or a fragment', () => {
    expect(err(validateBaseUrl('https://agentrouter.org/v1'))).toBe('url_path')
    expect(err(validateBaseUrl('https://agentrouter.org/v1/messages'))).toBe('url_path')
    expect(err(validateBaseUrl('https://agentrouter.org?key=x'))).toBe('url_path')
    expect(err(validateBaseUrl('https://agentrouter.org#x'))).toBe('url_path')
  })

  it('accepts a bare host with a trailing slash, and normalises it away', () => {
    const r = validateBaseUrl('https://agentrouter.org/')
    expect(r.ok && r.value).toBe('https://agentrouter.org')
  })

  it('keeps an explicit port', () => {
    const r = validateBaseUrl('https://relay.example.com:8443')
    expect(r.ok && r.value).toBe('https://relay.example.com:8443')
  })

  it('rejects an over-long URL before parsing it', () => {
    const long = `https://${'a'.repeat(MAX_BASE_URL)}.com`
    expect(err(validateBaseUrl(long))).toBe('url_too_long')
  })

  it('is case-insensitive about the host', () => {
    expect(err(validateBaseUrl('https://LOCALHOST'))).toBe('url_local')
  })
})

describe('validateModel', () => {
  it('accepts real model ids', () => {
    for (const id of ['claude-opus-4-5-20250929', 'claude-sonnet-4.5', 'gemini-3.1-flash-lite']) {
      expect(validateModel(id).ok, id).toBe(true)
    }
  })

  it('rejects a slash, so a model id can never become a path', () => {
    expect(validateModel('anthropic/claude-3').ok).toBe(false)
    expect(validateModel('../../etc/passwd').ok).toBe(false)
  })

  it('rejects empty and over-long ids', () => {
    expect(validateModel('').ok).toBe(false)
    expect(validateModel('a'.repeat(65)).ok).toBe(false)
  })
})

describe('parseClientProvider', () => {
  it('rejects a non-object', () => {
    for (const v of [null, undefined, 'anthropic', 42, []]) {
      // an array is an object, so it passes the typeof gate and fails on id
      expect(parseClientProvider(v).ok).toBe(false)
    }
  })

  it('rejects an unknown provider id', () => {
    const r = parseClientProvider({ id: 'openai' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('provider_unknown')
  })

  it('accepts gemini and drops everything else it was sent', () => {
    const r = parseClientProvider({
      id: 'gemini',
      baseUrl: 'https://evil.example.com',
      profile: 'claude-code',
    })
    expect(r.ok && r.value).toEqual({ id: 'gemini' })
  })

  it('accepts a full anthropic config', () => {
    const r = parseClientProvider({
      id: 'anthropic',
      baseUrl: 'https://agentrouter.org',
      model: 'claude-opus-4-5-20250929',
      profile: 'claude-code',
    })
    expect(r.ok && r.value).toEqual({
      id: 'anthropic',
      baseUrl: 'https://agentrouter.org',
      model: 'claude-opus-4-5-20250929',
      profile: 'claude-code',
    })
  })

  it('defaults the profile to the honest one', () => {
    const r = parseClientProvider({ id: 'anthropic' })
    expect(r.ok && r.value.profile).toBe('standard')
  })

  it('falls back to standard for an unrecognised profile rather than failing', () => {
    const r = parseClientProvider({ id: 'anthropic', profile: 'sneaky' })
    expect(r.ok && r.value.profile).toBe('standard')
  })

  it('propagates a base-URL rejection with its own code', () => {
    const r = parseClientProvider({ id: 'anthropic', baseUrl: 'http://127.0.0.1' })
    expect(!r.ok && r.error.code).toBe('url_scheme')
  })

  it('rejects wrong types without throwing', () => {
    expect(parseClientProvider({ id: 'anthropic', baseUrl: 42 }).ok).toBe(false)
    expect(parseClientProvider({ id: 'anthropic', model: {} }).ok).toBe(false)
  })
})
