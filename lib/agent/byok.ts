'use client'

/**
 * Free tries and bring-your-own-key. See docs/specs/12-agent-actions.md §9.
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

export const FREE_SESSIONS = 2

const KEY_STORE = 'tessera-api-key'
const COUNT_STORE = 'tessera-free-sessions'

export const GET_KEY_URL = 'https://aistudio.google.com/apikey'

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

export function getApiKey(): string | null {
  const k = read(KEY_STORE)?.trim()
  return k ? k : null
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) return clearApiKey()
  write(KEY_STORE, trimmed)
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
  | { allowed: true; apiKey: string; usingOwnKey: true }
  | { allowed: true; apiKey: undefined; usingOwnKey: false; freeLeft: number }
  | { allowed: false; reason: 'needs-key' }

/**
 * Whether a session may start, and on whose quota. A user's own key is checked
 * first — having supplied one, they should never be told they are out of tries.
 */
export function checkAccess(): AgentAccess {
  const key = getApiKey()
  if (key) return { allowed: true, apiKey: key, usingOwnKey: true }

  const left = freeSessionsLeft()
  if (left <= 0) return { allowed: false, reason: 'needs-key' }
  return { allowed: true, apiKey: undefined, usingOwnKey: false, freeLeft: left }
}
