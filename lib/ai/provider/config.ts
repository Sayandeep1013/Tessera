/**
 * Client-supplied provider configuration. See docs/specs/18-provider-byok.md §4.
 *
 * The browser tells us which provider a bring-your-own key belongs to, and for an
 * Anthropic-compatible relay it also tells us the base URL. That URL is a host this
 * server will make an outbound request to, chosen by whoever is holding the page —
 * so nothing here trusts it, and every rejection is a Result rather than a throw.
 *
 * THE RULE THAT MAKES THIS SAFE LIVES IN THE ROUTE, NOT HERE: a request with no
 * x-api-key never reaches this module at all, so the deployment's own key can never
 * be sent to a host a browser picked. See §4.1. The gates below are the second line,
 * and §4.2 is explicit that they are syntactic only.
 */

import type { Result } from '../../artwork-core/schema'

/**
 * Which wire identity to present. See §3.
 *
 * 'claude-code' exists for one measured reason: AgentRouter refuses any client it
 * does not recognise, before it looks at the key (§3.1). It is never a default,
 * never automatic, and only ever selected by a user for their own key — the route
 * enforces that structurally by ignoring this whole object when no key was sent.
 */
export type ClientProfile = 'standard' | 'claude-code'

export type ClientProviderConfig = {
  id: 'gemini' | 'anthropic'
  baseUrl?: string
  model?: string
  profile?: ClientProfile
}

export type ConfigError = { code: string; message: string }

/** Presets the UI offers. Nothing here is a bypass — every one passes §4.2 too. */
export const PRESETS = {
  anthropic: { baseUrl: 'https://api.anthropic.com', profile: 'standard' as ClientProfile },
  agentrouter: { baseUrl: 'https://agentrouter.org', profile: 'claude-code' as ClientProfile },
} as const

export const MAX_BASE_URL = 200

/** A real model provider has a hostname. Anything numeric is refused outright (§4.2 gate 4). */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
const LOCAL_SUFFIX = ['.localhost', '.internal', '.local', '.home.arpa']

const bad = (code: string, message: string): Result<never, ConfigError> => ({
  ok: false,
  error: { code, message },
})

/**
 * §4.2. Order matters only for the quality of the message — every gate is
 * independent, and a URL has to clear all seven.
 */
export function validateBaseUrl(raw: string): Result<string, ConfigError> {
  if (raw.length > MAX_BASE_URL) {
    return bad('url_too_long', `Keep the base URL under ${MAX_BASE_URL} characters.`)
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return bad('url_invalid', "That doesn't look like a URL.")
  }

  if (url.protocol !== 'https:') {
    return bad('url_scheme', 'The base URL must start with https://.')
  }

  if (url.username || url.password) {
    return bad('url_credentials', 'Put the key in the key field, not in the URL.')
  }

  // A bracketed host is an IPv6 literal by definition; hostname strips the brackets,
  // so test `host` for the bracket and `hostname` for the v4 shape.
  const host = url.hostname.toLowerCase()
  if (url.host.startsWith('[') || IPV4.test(host) || host.includes(':')) {
    return bad('url_ip', 'Use a hostname, not an IP address.')
  }

  if (host === 'localhost' || LOCAL_SUFFIX.some((s) => host.endsWith(s))) {
    return bad('url_local', 'That host is not reachable from the server.')
  }

  // The base URL is a host. /v1/messages is ours to append, and a caller who could
  // supply a path could point the request at any route on that host.
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    return bad('url_path', 'Give the host only — no path, query or fragment.')
  }

  // Normalised: no trailing slash, so joining is unambiguous everywhere else.
  return { ok: true, value: `${url.protocol}//${url.host}` }
}

const MODEL_ID = /^[a-zA-Z0-9._:-]{1,64}$/

export function validateModel(raw: string): Result<string, ConfigError> {
  if (!MODEL_ID.test(raw)) {
    return bad('model_invalid', "That model id isn't valid.")
  }
  return { ok: true, value: raw }
}

/**
 * Parse whatever the browser sent. Unknown fields are dropped rather than rejected —
 * an older page posting a newer shape should degrade, not fail.
 */
export function parseClientProvider(raw: unknown): Result<ClientProviderConfig, ConfigError> {
  if (raw == null || typeof raw !== 'object') {
    return bad('provider_missing', 'The request was malformed.')
  }
  const o = raw as Record<string, unknown>

  const id = o.id
  if (id !== 'gemini' && id !== 'anthropic') {
    return bad('provider_unknown', `Unknown provider "${String(id).slice(0, 32)}".`)
  }

  // Gemini takes a key and nothing else. Accepting a base URL for it would be a
  // second, unvalidated path to the same outbound request.
  if (id === 'gemini') return { ok: true, value: { id } }

  const out: ClientProviderConfig = { id }

  if (o.baseUrl !== undefined) {
    if (typeof o.baseUrl !== 'string') return bad('url_invalid', "That doesn't look like a URL.")
    const url = validateBaseUrl(o.baseUrl)
    if (!url.ok) return url
    out.baseUrl = url.value
  }

  if (o.model !== undefined) {
    if (typeof o.model !== 'string') return bad('model_invalid', "That model id isn't valid.")
    const model = validateModel(o.model)
    if (!model.ok) return model
    out.model = model.value
  }

  // An unrecognised profile falls back to the honest one rather than erroring: the
  // failure mode of a wrong profile is a clear 401 the user can act on (§5,
  // bad_client), and refusing the request outright tells them less.
  out.profile = o.profile === 'claude-code' ? 'claude-code' : 'standard'

  return { ok: true, value: out }
}
