/**
 * Anthropic-compatible adapter. See docs/specs/18-provider-byok.md §2, §3, §5.
 *
 * Built on fetch, with no @anthropic-ai/sdk dependency — this adapter needs
 * byte-level control of its request headers (§3), which is the one thing an SDK
 * exists to take away from you. Spec 06a §2 said the Anthropic adapter was not built
 * because it "requires @anthropic-ai/sdk"; that reason is now recorded as wrong.
 *
 * Works against any host that speaks POST {base}/v1/messages: api.anthropic.com, or
 * a relay the user names. The base URL is validated in config.ts BEFORE anything here
 * is constructed — never trust a caller to have done it.
 *
 * Measured against agentrouter.org, 24 Aug 2026: claude-opus-5, tool calling
 * confirmed (stop_reason 'tool_use', ids prefixed `toolu_bdrk_` — the relay fronts
 * Bedrock), usage reported, WAF passed only with the claude-code client profile.
 */

import { Agent } from 'undici'
import type { ClientProfile } from './config'
import { fromAnthropicContent, toAnthropicMessages, toAnthropicTools } from './translate'
import type {
  AiProvider,
  ConverseRequest,
  ConverseResult,
  EditRequest,
  EditResult,
  ProviderErrorKind,
  ProviderUsage,
} from './types'

export const DEFAULT_BASE_URL = 'https://api.anthropic.com'
export const DEFAULT_MODEL = 'claude-opus-5'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * A dedicated dispatcher with a real timeout.
 *
 * Measured 24 Aug 2026 (docs/specs/19 §5.1): two live requests died at EXACTLY
 * 5.1 minutes with a 503, on both a 32x32 apple and a 16x16 butterfly — not a
 * canvas-size problem, a fixed wall. Node's global fetch runs on undici's default
 * dispatcher, whose `headersTimeout` and `bodyTimeout` default to 300_000ms. A
 * capable model drawing something detailed routinely runs longer than that in a
 * single turn, and the default dispatcher was killing the socket out from under a
 * perfectly healthy response before Claude finished sending it.
 *
 * Scoped to THIS module's requests only — not `setGlobalDispatcher` — so nothing
 * else in the app (the eval harness's own fetches, the models route, a future
 * provider) inherits a 20-minute timeout it never asked for.
 */
const dispatcher = new Agent({
  headersTimeout: 20 * 60 * 1000,
  bodyTimeout: 20 * 60 * 1000,
  connectTimeout: 30 * 1000,
})

/** The tool generate() forces, so a discriminated union survives the wire (§2.2). */
const EDIT_TOOL = 'propose_edit'

/** See the comment on converse()'s request body. Must stay well under maxOutputTokens. */
const THINKING_BUDGET = 16_000

/**
 * §3. 'standard' is what Tessera is. 'claude-code' is a compatibility shim for
 * relays that refuse unrecognised clients, selected by a user for their own key and
 * never applied to this deployment's own requests — the route enforces that by
 * ignoring client config on any request that arrived without a key (§4.1).
 */
function identityHeaders(profile: ClientProfile): Record<string, string> {
  if (profile === 'claude-code') {
    return {
      'user-agent': 'claude-cli/2.0.14 (external, cli)',
      'x-app': 'cli',
    }
  }
  return {
    'user-agent': 'tessera/0.1.0 (+https://github.com/Sayandeep1013/Tessera)',
  }
}

type Fail = { ok: false; kind: ProviderErrorKind; message: string; retryAfterMs?: number }

const fail = (kind: ProviderErrorKind, message: string, retryAfterMs?: number): Fail => ({
  ok: false,
  kind,
  message,
  ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
})

/**
 * §5. Two of these rows are AgentRouter's own shapes rather than Anthropic's, both
 * measured: `unauthorized_client_error` is the WAF refusing the client before it
 * looks at the key, and `new_api_error` carrying 无效的令牌 is the relay's own
 * invalid-token message. The first one matters most — without its own kind it
 * reports as a bad key, and the user re-types a key that was fine.
 */
function mapHttpError(status: number, body: unknown, retryAfterHeader: string | null): Fail {
  const err = (body as { error?: { type?: string; message?: string } })?.error
  const type = err?.type ?? (body as { type?: string })?.type ?? ''
  const message = err?.message ?? ''

  if (type === 'unauthorized_client_error' || /unauthorized client/i.test(message)) {
    return fail(
      'config',
      'bad_client: this relay only accepts requests from clients it recognises',
    )
  }

  switch (status) {
    case 400:
      return fail('config', `the request was rejected: ${message.slice(0, 200)}`)
    case 401:
    case 403:
      return fail('config', `the API key was rejected: ${message.slice(0, 200)}`)
    case 404:
      return fail('config', `bad_model: ${message.slice(0, 200) || 'that model is unavailable'}`)
    case 413:
      return fail('config', 'the request was too large for this model')
    case 429: {
      const secs = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN
      return fail(
        'rate_limited',
        'the model is rate limited right now',
        Number.isFinite(secs) ? secs * 1000 : 20_000,
      )
    }
    default:
      if (status >= 500) {
        return fail('unavailable', `the model is unavailable (${status})`)
      }
      return fail('unavailable', `unexpected response (${status}) ${message.slice(0, 160)}`)
  }
}

/**
 * Why generation stopped, checked BEFORE touching content — a refusal carries no
 * block to read, the same class of bug 06a §3 records for Gemini.
 */
function checkStop(res: { stop_reason?: string; content?: unknown }): Fail | null {
  if (res.stop_reason === 'max_tokens') {
    return fail('bad_response', 'the response was truncated before it was complete')
  }
  if (res.stop_reason === 'refusal') {
    return fail('refused', 'the model declined this request')
  }
  if (Array.isArray(res.content)) {
    const refusal = (res.content as Array<{ type?: string }>).find((b) => b?.type === 'refusal')
    if (refusal) return fail('refused', 'the model declined this request')
  }
  return null
}

function readUsage(res: { usage?: Record<string, number> }): ProviderUsage {
  const u = res.usage
  if (!u) return {}
  const input = u.input_tokens ?? 0
  const output = u.output_tokens ?? 0
  // Cache reads are billed at a fraction of a fresh input token, so they are
  // reported separately rather than folded in — otherwise the saving is invisible.
  const cacheRead = u.cache_read_input_tokens ?? 0
  const cacheWrite = u.cache_creation_input_tokens ?? 0
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
  }
}

export type AnthropicOptions = {
  apiKey: string | undefined
  baseUrl?: string
  model?: string
  profile?: ClientProfile
}

export function createAnthropicProvider(opts: AnthropicOptions): AiProvider {
  const baseUrl = opts.baseUrl || DEFAULT_BASE_URL
  const modelId = opts.model || DEFAULT_MODEL
  const profile: ClientProfile = opts.profile ?? 'standard'

  async function post(
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ): Promise<{ ok: true; json: Record<string, unknown>; latencyMs: number } | Fail> {
    if (!opts.apiKey) return fail('config', 'no API key was supplied')

    const started = Date.now()
    let res: Response
    try {
      res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Both, deliberately: api.anthropic.com authenticates on x-api-key,
          // relays fronting it generally read Authorization. Sending one costs a
          // 401 against half the hosts this adapter is meant to reach.
          'x-api-key': opts.apiKey,
          authorization: `Bearer ${opts.apiKey}`,
          'anthropic-version': ANTHROPIC_VERSION,
          ...identityHeaders(profile),
        },
        body: JSON.stringify({ model: modelId, ...body }),
        signal,
        // Node-specific fetch extension, not a spec option — this is what
        // actually raises the 5-minute wall. See the comment on `dispatcher`.
        dispatcher,
      } as RequestInit & { dispatcher: Agent })
    } catch (e) {
      if (signal?.aborted) return fail('unavailable', 'the request was cancelled')
      return fail('unavailable', String((e as Error).message ?? e).slice(0, 200))
    }

    const latencyMs = Date.now() - started
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      if (!res.ok) return mapHttpError(res.status, {}, res.headers.get('retry-after'))
      return fail('bad_response', 'the model returned a response that was not JSON')
    }

    if (!res.ok) return mapHttpError(res.status, json, res.headers.get('retry-after'))
    return { ok: true, json, latencyMs }
  }

  /**
   * Single-shot structured edit. Anthropic has no responseSchema; the idiomatic
   * equivalent is a forced tool call, and its input_schema DOES handle the
   * discriminated union that Gemini could not (§2.2) — hence schemaFlavour 'strict'.
   *
   * The ten gates in 06 §5 still run on whatever comes back. A better model does not
   * make the validator optional.
   */
  async function generate(req: EditRequest): Promise<EditResult> {
    const sent = await post(
      {
        max_tokens: req.maxOutputTokens,
        system: req.systemPrompt,
        tools: [
          {
            name: EDIT_TOOL,
            description: 'Return the edit as a list of operations.',
            input_schema: req.jsonSchema,
          },
        ],
        tool_choice: { type: 'tool', name: EDIT_TOOL },
        messages: [
          {
            role: 'user',
            content: [
              // Image first — it is what the text refers to.
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: req.imagePngBase64 },
              },
              { type: 'text', text: req.userText },
            ],
          },
        ],
      },
      req.signal,
    )
    if (!sent.ok) return sent

    const stopped = checkStop(sent.json)
    if (stopped) return stopped

    const content = sent.json.content
    const call = Array.isArray(content)
      ? (content as Array<Record<string, unknown>>).find(
          (b) => b?.type === 'tool_use' && b?.name === EDIT_TOOL,
        )
      : undefined

    if (!call) {
      return fail('bad_response', 'the model did not return an edit')
    }

    return {
      ok: true,
      raw: call.input,
      usage: readUsage(sent.json),
      model: String(sent.json.model ?? modelId),
      latencyMs: sent.latencyMs,
    }
  }

  /**
   * Prompt caching. Measured 24 Aug 2026, and it is not a micro-optimisation.
   *
   * The agent re-sends the ENTIRE history every turn — the ruled PNG, every grid
   * the model has read, every tool result. A ten-turn session therefore pays for
   * its own opening turn ten times, and a 32x32 grid is about a thousand tokens
   * each time it appears. Three and a half eval scenarios cost $3.86 without this.
   *
   * Two breakpoints, both on content that is byte-identical across every request
   * this deployment ever makes:
   *   - the last tool, which caches the whole tool array AND the system prompt
   *     above it (the cache prefix runs tools -> system -> messages)
   *   - the last block of the last message, so each turn's cache write becomes
   *     the next turn's cache read
   *
   * The system prompt is a frozen constant and the declarations are generated from
   * the registry, so the static prefix genuinely never varies. Anthropic allows
   * four breakpoints; two is enough and leaves room.
   */
  function withCaching(
    tools: ReturnType<typeof toAnthropicTools>,
    messages: ReturnType<typeof toAnthropicMessages>,
  ): { tools: unknown[]; messages: unknown[] } {
    const cache = { cache_control: { type: 'ephemeral' as const } }

    const cachedTools: unknown[] = tools.map((t, i) =>
      i === tools.length - 1 ? { ...t, ...cache } : t,
    )

    const cachedMessages: unknown[] = messages.map((m, i) => {
      if (i !== messages.length - 1 || !m.content.length) return m
      const content = m.content.map((b, j) =>
        j === m.content.length - 1 ? { ...b, ...cache } : b,
      )
      return { ...m, content }
    })

    return { tools: cachedTools, messages: cachedMessages }
  }

  async function converse(req: ConverseRequest): Promise<ConverseResult> {
    const cached = withCaching(toAnthropicTools(req.tools), toAnthropicMessages(req.history))
    const sent = await post(
      {
        max_tokens: req.maxOutputTokens,
        system: req.systemPrompt,
        tools: cached.tools,
        messages: cached.messages,
        /**
         * Bound the thinking budget explicitly. NOT set on generate() — Anthropic
         * rejects an explicit `thinking` config alongside a FORCED tool_choice
         * (generate() forces propose_edit), and only an "auto" tool_choice, which
         * is what converse() uses, is compatible with it.
         *
         * Measured 24 Aug 2026 (docs/specs/19 §5.1): claude-opus-5 has adaptive
         * thinking on BY DEFAULT, and thinking tokens are billed against the same
         * max_tokens ceiling as everything else. Three eval scenarios — an apple
         * with a highlight and shadow, shading a bird's underside, a mirrored
         * butterfly — burned the ENTIRE 32,000-token budget reasoning about the
         * task and never reached a tool call, which reads to the user as "the
         * model's reply couldn't be read. Nothing changed." on artwork the model
         * was fully capable of drawing.
         *
         * A generous but bounded budget guarantees room is left for the actual
         * response regardless of how hard the model reasons. Every real turn
         * measured in this repo's eval used well under 1,000 output tokens for
         * its tool calls and explanation — 16,000 is not a tight budget, it is a
         * ceiling that stops "unbounded" from meaning "the whole request".
         */
        thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
      },
      req.signal,
    )
    if (!sent.ok) return sent

    /**
     * Truncation is SALVAGED here rather than failed, which is the one place
     * converse() deliberately differs from generate().
     *
     * Measured 24 Aug 2026: three of fifteen eval scenarios died on
     * `stop_reason: 'max_tokens'`. In each case the model had generated for
     * minutes and produced a run of perfectly good tool calls, and the whole turn
     * was thrown away and reported to the user as "the model's reply couldn't be
     * read" — after which the session ended with nothing drawn. Discarding minutes
     * of completed work because the LAST call was cut off is exactly what hard
     * rule 7 exists to prevent.
     *
     * A truncated response's final content block is the one that was cut, so it is
     * dropped and the rest is returned as a normal turn. The runner feeds the
     * results back and the model simply continues. Only a turn with nothing
     * salvageable is still an error.
     *
     * generate() keeps failing on truncation: a half-written edit payload is not
     * partially useful, it is unparseable.
     */
    if (sent.json.stop_reason === 'max_tokens') {
      const blocks = Array.isArray(sent.json.content) ? [...(sent.json.content as unknown[])] : []
      blocks.pop()
      const parts = fromAnthropicContent(blocks)
      if (parts.some((part) => 'functionCall' in part)) {
        return {
          ok: true,
          parts,
          usage: readUsage(sent.json),
          model: String(sent.json.model ?? modelId),
          latencyMs: sent.latencyMs,
        }
      }
      return fail('bad_response', 'the response was truncated before it was complete')
    }

    const stopped = checkStop(sent.json)
    if (stopped) return stopped

    // An empty parts array is not an error here — the runner reads "no calls, no
    // text" as a finished turn.
    return {
      ok: true,
      parts: fromAnthropicContent(sent.json.content),
      usage: readUsage(sent.json),
      model: String(sent.json.model ?? modelId),
      latencyMs: sent.latencyMs,
    }
  }

  return { id: 'anthropic', schemaFlavour: 'strict', model: async () => modelId, generate, converse }
}
