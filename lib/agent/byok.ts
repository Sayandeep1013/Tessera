'use client'

/**
 * Free tries and bring-your-own-key. See docs/specs/12-agent-actions.md §9 and
 * 18-provider-byok.md §4.3.
 *
 * The deployment shares one free-tier project across every visitor, and the
 * binding limit is 5 requests per minute for the whole project. Two free sessions
 * per browser is enough to show that the mechanism works; anyone who wants to
 * actually use it brings a key.
 *
 * THE COUNTER IS A COURTESY, NOT A LOCK. Clearing storage or opening a private
 * window resets it, and that is intended — anything stronger means fingerprinting
 * or accounts, and there are no accounts. Do not harden it.
 *
 * The key never leaves this module except as a request header. It is not logged,
 * not sent anywhere else, and not persisted server-side.
 */

import type { ClientProfile, ClientProviderConfig } from '../ai/provider/config'

export const FREE_SESSIONS = 2

const KEY_STORE = 'tessera-api-key'
const COUNT_STORE = 'tessera-free-sessions'

/** What the user picked, alongside the key it belongs to. §4.3. */
export type ByokConfig = {
  providerId: 'gemini' | 'anthropic'
  apiKey: string
  baseUrl?: string
  model?: string
  profile?: ClientProfile
}

export type ProviderChoice = {
  id: 'gemini' | 'anthropic'
  label: string
  /** Shown in the key field so the user can tell they pasted the right thing. */
  placeholder: string
  getKeyUrl: string
  baseUrl?: string
  profile?: ClientProfile
  /** Copy for the compatibility notice, when one applies. §7.3. */
  note?: string
}

/**
 * The presets the dialog offers. AgentRouter carries the one shim in this codebase
 * that misrepresents what the client is, so it says so in the interface rather than
 * only in the spec — same standard as the credential promise next to it.
 */
export const PROVIDERS: Record<string, ProviderChoice> = {
  gemini: {
    id: 'gemini',
    label: 'Gemini · free',
    placeholder: 'AIza…',
    getKeyUrl: 'https://aistudio.google.com/apikey',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude · Anthropic',
    placeholder: 'sk-ant-…',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com',
    profile: 'standard',
  },
  agentrouter: {
    id: 'anthropic',
    label: 'Claude · AgentRouter',
    placeholder: 'sk-…',
    getKeyUrl: 'https://agentrouter.org',
    baseUrl: 'https://agentrouter.org',
    profile: 'claude-code',
    note: 'AgentRouter only answers clients it recognises, so Tessera identifies itself as Claude Code when talking to it. Your key, your account, your call — leave this off for any other provider.',
  },
}

export const GET_KEY_URL = PROVIDERS.gemini!.getKeyUrl

/** Every read is guarded: localStorage throws in private mode on some browsers. */
function read(name: string): string | null {
  try {
    return window.localStorage.getItem(name)
  } catch {
    return null
  }
}

function write(name: string, value: string): void {
  try {
    window.localStorage.setItem(name, value)
  } catch {
    // Storage being unavailable must never block an edit. The user simply gets
    // their free tries again next time.
  }
}

/**
 * Reads the stored config, migrating the pre-spec-18 shape.
 *
 * Before this unit the slot held a bare key string, which was always a Gemini key.
 * Anyone who saved one must not have it silently invalidated by an upgrade — the
 * same instinct hard rule 7 applies to artwork, applied to a credential.
 */
export function getConfig(): ByokConfig | null {
  const raw = read(KEY_STORE)?.trim()
  if (!raw) return null

  if (!raw.startsWith('{')) return { providerId: 'gemini', apiKey: raw }

  try {
    const o = JSON.parse(raw) as Partial<ByokConfig>
    if (!o || typeof o.apiKey !== 'string' || !o.apiKey.trim()) return null
    return {
      providerId: o.providerId === 'anthropic' ? 'anthropic' : 'gemini',
      apiKey: o.apiKey.trim(),
      ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}),
      ...(o.model ? { model: o.model } : {}),
      ...(o.profile === 'claude-code' ? { profile: 'claude-code' as ClientProfile } : {}),
    }
  } catch {
    // Corrupt JSON is not a key. Treating it as one sends garbage upstream and
    // reports a confusing 401.
    return null
  }
}

export function setConfig(cfg: ByokConfig): void {
  if (!cfg.apiKey.trim()) return clearApiKey()
  write(KEY_STORE, JSON.stringify({ ...cfg, apiKey: cfg.apiKey.trim() }))
}

export function getApiKey(): string | null {
  return getConfig()?.apiKey ?? null
}

/** Kept for the legacy call path: a bare key is a Gemini key. */
export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) return clearApiKey()
  setConfig({ providerId: 'gemini', apiKey: trimmed })
}

export function clearApiKey(): void {
  try {
    window.localStorage.removeItem(KEY_STORE)
  } catch {
    /* nothing to do */
  }
}

/** Shown in the UI so the user can see we hold it without revealing it. */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}${'•'.repeat(8)}${key.slice(-4)}`
}

/** The wire shape the route validates — never includes the key itself. */
export function toWireProvider(cfg: ByokConfig): ClientProviderConfig {
  return {
    id: cfg.providerId,
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
    ...(cfg.model ? { model: cfg.model } : {}),
    ...(cfg.profile ? { profile: cfg.profile } : {}),
  }
}

export function freeSessionsUsed(): number {
  const n = Number.parseInt(read(COUNT_STORE) ?? '0', 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function freeSessionsLeft(): number {
  return Math.max(0, FREE_SESSIONS - freeSessionsUsed())
}

/** Called once per session that actually starts, not once per turn. */
export function recordFreeSession(): void {
  write(COUNT_STORE, String(freeSessionsUsed() + 1))
}

export type AgentAccess =
  | { allowed: true; apiKey: string; config: ClientProviderConfig; usingOwnKey: true }
  | { allowed: true; apiKey: undefined; config: undefined; usingOwnKey: false; freeLeft: number }
  | { allowed: false; reason: 'needs-key' }

/**
 * Whether a session may start, and on whose quota. A user's own key is checked
 * first — having supplied one, they should never be told they are out of tries.
 */
export function checkAccess(): AgentAccess {
  const cfg = getConfig()
  if (cfg) {
    return { allowed: true, apiKey: cfg.apiKey, config: toWireProvider(cfg), usingOwnKey: true }
  }

  const left = freeSessionsLeft()
  if (left <= 0) return { allowed: false, reason: 'needs-key' }
  return { allowed: true, apiKey: undefined, config: undefined, usingOwnKey: false, freeLeft: left }
}
