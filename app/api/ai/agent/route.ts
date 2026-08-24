/**
 * The agent gateway. See docs/specs/12-agent-actions.md §5 and §9.
 *
 * Deliberately thin: it holds the key, the system prompt, and the tool
 * declarations, and forwards one turn. It does not run the loop, does not execute
 * actions, and does not know what the actions do — that all lives in the browser,
 * where the state being edited lives.
 *
 * The system prompt and the declarations come from the registry on the SERVER.
 * A client that could send its own tool list could describe an action as anything
 * it liked; it would still only be able to call actions that exist, but the model
 * would have been lied to about what they do.
 */

import { NextResponse } from 'next/server'
import { AGENT_SYSTEM_PROMPT } from '@/lib/agent/prompt'
import { MAX_HISTORY_BYTES, SESSIONS_PER_HOUR } from '@/lib/agent/limits'
import { toDeclarations } from '@/lib/actions/registry'
import { getProvider } from '@/lib/ai/provider'
import { parseClientProvider, type ClientProviderConfig } from '@/lib/ai/provider/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOUR = 3_600_000

/**
 * Sessions per hour per IP, counted once per session id rather than per turn — a
 * six-step session is one session, not six. In-memory: resets on deploy and is
 * per-instance. A demo does not need Redis, and the tradeoff is stated in the spec.
 */
const seen = new Map<string, Array<{ id: string; at: number }>>()

function rateLimit(ip: string, sessionId: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now()
  const recent = (seen.get(ip) ?? []).filter((s) => now - s.at < HOUR)

  if (!recent.some((s) => s.id === sessionId)) {
    if (recent.length >= SESSIONS_PER_HOUR) {
      return { ok: false, retryAfter: Math.ceil((HOUR - (now - recent[0]!.at)) / 1000) }
    }
    recent.push({ id: sessionId, at: now })
  }

  seen.set(ip, recent)
  if (seen.size > 5000) {
    for (const [k, v] of seen) if (!v.some((s) => now - s.at < HOUR)) seen.delete(k)
  }
  return { ok: true }
}

const fail = (status: number, code: string, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ code, message, ...extra }, { status })

export async function POST(req: Request) {
  // The user's own key. Used for this request and discarded with the provider
  // instance below. It is never logged and never written anywhere.
  const userKey = req.headers.get('x-api-key')?.trim() || undefined

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'

  const raw = await req.text()
  if (raw.length > MAX_HISTORY_BYTES) {
    return fail(413, 'too_large', 'This session has grown too long. Start a new one.')
  }

  let body: { sessionId?: unknown; history?: unknown; provider?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return fail(400, 'bad_json', 'The request was malformed.')
  }

  /**
   * Spec 18 §4.1 — the rule the rest of the BYOK design rests on.
   *
   * body.provider names a host this server will make an outbound request to, and it
   * comes from the browser. It is honoured ONLY on a request that carried the user's
   * own key. Without this, a crafted baseUrl collects the DEPLOYMENT'S key on the
   * first request. Structural, not a check: with no key there is no config, so there
   * is no code path where our credential meets a URL a visitor chose.
   */
  let clientConfig: ClientProviderConfig | undefined
  if (userKey && body.provider !== undefined) {
    const parsed = parseClientProvider(body.provider)
    if (!parsed.ok) {
      return fail(400, parsed.error.code, parsed.error.message, { byok: true })
    }
    clientConfig = parsed.value
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  if (!sessionId) return fail(400, 'bad_session', 'The request was malformed.')

  if (!Array.isArray(body.history) || body.history.length === 0) {
    return fail(400, 'bad_history', 'The request was malformed.')
  }

  // Someone spending their own quota is not consuming ours, so our limit does not
  // apply to them.
  if (!userKey) {
    const limited = rateLimit(ip, sessionId)
    if (!limited.ok) {
      return fail(
        429,
        'rate_limited',
        `You've used all ${SESSIONS_PER_HOUR} free AI sessions for this hour. Add your own key to keep going.`,
        { retryAfter: limited.retryAfter, byok: true },
      )
    }
  }

  const provider = getProvider(undefined, userKey, clientConfig)
  if (!provider.converse) {
    console.error('[ai/agent] provider %s has no converse()', provider.id)
    return fail(500, 'config', 'The AI agent is not configured for this deployment.')
  }

  const res = await provider.converse({
    systemPrompt: AGENT_SYSTEM_PROMPT,
    history: body.history as never,
    tools: toDeclarations() as never,
    /**
     * 4000 truncated on a 32x32 shading task; 16000 still truncated three of
     * fifteen eval scenarios (docs/specs/19 §5.1). Output tokens are billed for
     * what is generated, not for the ceiling, so a generous cap costs nothing
     * until it is used. The adapter also salvages a truncated turn now — this is
     * the belt, that is the braces.
     */
    maxOutputTokens: 32_000,
  })

  if (!res.ok) {
    switch (res.kind) {
      case 'rate_limited':
        // A 429 against OUR key means the shared free tier is busy — an invitation
        // to bring a key. A 429 against THEIR key is their own quota, and telling
        // them to add a key they already added would be nonsense.
        return fail(
          429,
          'upstream_rate_limited',
          userKey
            ? "Your API key has hit its rate limit. Wait a moment and try again."
            : 'Lots of people are trying this right now. Wait a moment, or add your own key for unlimited edits.',
          { retryAfter: Math.ceil((res.retryAfterMs ?? 20_000) / 1000), byok: !userKey },
        )
      case 'refused':
        return fail(422, 'refused', 'The model declined this request. Try rephrasing it.')
      case 'bad_response':
        return fail(502, 'bad_response', "The model's reply couldn't be read. Nothing changed.")
      case 'config':
        if (userKey) {
          // Their key, their problem to fix — and the only case where we can say
          // something specific enough to be useful. Spec 18 §5: the relay's
          // client refusal gets its OWN message, because the generic one sends the
          // user off re-typing a key that was never the problem.
          if (res.message.startsWith('bad_client')) {
            return fail(
              400,
              'bad_client',
              'This provider only accepts requests from clients it recognises. Turn on AgentRouter compatibility in the key dialog and try again.',
              { byok: true },
            )
          }
          if (res.message.startsWith('bad_model')) {
            return fail(400, 'bad_model', "That model isn't available on this key. Pick another.", {
              byok: true,
            })
          }
          return fail(400, 'bad_key', 'That API key was rejected. Check it and try again.', {
            byok: true,
          })
        }
        console.error('[ai/agent] provider config error:', res.message)
        return fail(500, 'config', 'The AI agent is not configured for this deployment.')
      default:
        return fail(503, 'unavailable', "Couldn't reach the model. Your artwork is safe — try again.")
    }
  }

  return NextResponse.json({
    parts: res.parts,
    model: res.model,
    latencyMs: res.latencyMs,
    // Not a secret, and the only way the quality harness can report what a run
    // actually cost (docs/specs/19 §4).
    usage: res.usage,
  })
}
