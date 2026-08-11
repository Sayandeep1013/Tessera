/**
 * Gemini adapter. See docs/specs/06a-provider.md §3.
 *
 * Measured facts this encodes (11 Aug 2026, against a live key):
 *   - gemini-2.5-flash is 404 for new keys while still listed by models.list()
 *   - the Flash line was cut to ~20 req/day; Flash-Lite kept the real quota
 *   - flash-lite is 7.5x faster on our task (2.2s vs 16.6s) with 0 thinking tokens
 *   - temperature/topP/topK are deprecated (2026-07-21) — sending them is wrong
 *   - thinkingConfig.thinkingBudget = 0 is a 400 on Gemini 3.x
 *   - mediaResolution ULTRA_HIGH is a 400 on flash-lite
 *   - parallel function calling works: 3 calls in one response, unprompted
 */

import { GoogleGenAI } from '@google/genai'
import type {
  AiProvider,
  ConverseRequest,
  ConverseResult,
  ConversePart,
  EditRequest,
  EditResult,
  ProviderErrorKind,
  ProviderUsage,
} from './types'

/** Newest-first, Flash-Lite first — that is where the free quota lives. */
const PREFERENCE = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-flash-latest',
]

/**
 * Module-level, shared across provider instances.
 *
 * Resolution costs a real generateContent probe. An agent turn creates a fresh
 * provider per request (BYOK sends a different key each time), so without this
 * cache every step would spend two requests against a 5-per-minute budget rather
 * than one. A key that cannot reach the cached model gets a 404, which clears the
 * cache and re-resolves — so a stale entry costs one retry, not a broken session.
 */
let resolvedModel: string | null = null

function mapError(e: unknown, signal: AbortSignal | undefined, modelId: string): {
  kind: ProviderErrorKind
  message: string
  retryAfterMs?: number
} {
  const msg = String((e as Error).message ?? e)

  if (signal?.aborted) return { kind: 'unavailable', message: 'the request was cancelled' }

  if (/RESOURCE_EXHAUSTED|"code":\s*429|quota/i.test(msg)) {
    const secs = /retry in ([\d.]+)s/i.exec(msg)?.[1] ?? /"retryDelay":\s*"(\d+)s"/.exec(msg)?.[1]
    return {
      kind: 'rate_limited',
      message: 'the model is rate limited right now',
      retryAfterMs: secs ? Math.ceil(parseFloat(secs) * 1000) : 20_000,
    }
  }
  if (/API key|API_KEY_INVALID|PERMISSION_DENIED|"code":\s*40[13]/i.test(msg)) {
    return { kind: 'config', message: `the API key was rejected: ${msg.slice(0, 200)}` }
  }
  if (/NOT_FOUND|"code":\s*404/i.test(msg)) {
    resolvedModel = null // force re-resolution next call
    return { kind: 'config', message: `model "${modelId}" is unavailable` }
  }
  if (/"code":\s*400|INVALID_ARGUMENT/i.test(msg)) {
    return { kind: 'config', message: `the request was rejected: ${msg.slice(0, 300)}` }
  }
  return { kind: 'unavailable', message: msg.slice(0, 300) }
}

/**
 * Why generation stopped, checked BEFORE touching candidate text: a blocked
 * response has none, and indexing into it throws.
 */
function checkFinish(res: unknown): { kind: ProviderErrorKind; message: string } | null {
  const cand = (res as { candidates?: Array<{ finishReason?: string }> }).candidates?.[0]
  const blockReason = (res as { promptFeedback?: { blockReason?: string } }).promptFeedback
    ?.blockReason
  const finish = cand?.finishReason

  if (blockReason || finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
    return { kind: 'refused', message: `the model declined this request (${blockReason ?? finish})` }
  }
  if (finish === 'MAX_TOKENS') {
    return { kind: 'bad_response', message: 'the response was truncated before it was complete' }
  }
  return null
}

function readUsage(res: unknown): ProviderUsage {
  const u = (res as { usageMetadata?: Record<string, number> }).usageMetadata
  return {
    inputTokens: u?.promptTokenCount,
    outputTokens: u?.candidatesTokenCount,
    thinkingTokens: u?.thoughtsTokenCount,
    totalTokens: u?.totalTokenCount,
  }
}

export function createGeminiProvider(apiKey: string | undefined): AiProvider {
  let client: GoogleGenAI | null = null

  const getClient = (): GoogleGenAI | null => {
    if (!apiKey) return null
    client ??= new GoogleGenAI({ apiKey })
    return client
  }

  async function model(): Promise<string> {
    if (resolvedModel) return resolvedModel
    const ai = getClient()
    if (!ai) throw new Error('GEMINI_API_KEY is not set')

    const available = new Set<string>()
    for await (const m of await ai.models.list()) {
      const name = ((m as { name?: string }).name ?? '').replace('models/', '')
      const actions = (m as { supportedActions?: string[] }).supportedActions ?? []
      if (!actions.length || actions.includes('generateContent')) available.add(name)
    }

    for (const candidate of PREFERENCE) {
      if (!available.has(candidate)) continue
      try {
        // A listed model can still 404 ("no longer available to new users"),
        // so probe rather than trust the list.
        await ai.models.generateContent({ model: candidate, contents: 'ok' })
        resolvedModel = candidate
        return candidate
      } catch {
        continue
      }
    }
    throw new Error(`none of the preferred models are usable: ${PREFERENCE.join(', ')}`)
  }

  async function generate(req: EditRequest): Promise<EditResult> {
    const ai = getClient()
    if (!ai) return { ok: false, kind: 'config', message: 'GEMINI_API_KEY is not set' }

    let modelId: string
    try {
      modelId = await model()
    } catch (e) {
      return { ok: false, kind: 'config', message: (e as Error).message }
    }

    const started = Date.now()
    try {
      const res = await ai.models.generateContent({
        model: modelId,
        contents: [
          {
            role: 'user',
            parts: [
              // Image first — Gemini attends better to an image preceding the
              // prompt that refers to it.
              { inlineData: { mimeType: 'image/png', data: req.imagePngBase64 } },
              { text: req.userText },
            ],
          },
        ],
        config: {
          systemInstruction: req.systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: req.jsonSchema as never,
          maxOutputTokens: req.maxOutputTokens,
          abortSignal: req.signal,
          // No temperature / topP / topK — deprecated 2026-07-21.
        } as never,
      })

      const stopped = checkFinish(res)
      if (stopped) return { ok: false, ...stopped }

      const text = res.text
      if (!text) {
        return { ok: false, kind: 'bad_response', message: 'the model returned an empty response' }
      }

      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        return { ok: false, kind: 'bad_response', message: 'the model returned malformed JSON' }
      }

      return {
        ok: true,
        raw,
        usage: readUsage(res),
        model: modelId,
        latencyMs: Date.now() - started,
      }
    } catch (e) {
      return { ok: false, ...mapError(e, req.signal, modelId) }
    }
  }

  async function converse(req: ConverseRequest): Promise<ConverseResult> {
    const ai = getClient()
    if (!ai) return { ok: false, kind: 'config', message: 'GEMINI_API_KEY is not set' }

    let modelId: string
    try {
      modelId = await model()
    } catch (e) {
      return { ok: false, kind: 'config', message: (e as Error).message }
    }

    const started = Date.now()
    try {
      const res = await ai.models.generateContent({
        model: modelId,
        contents: req.history as never,
        config: {
          systemInstruction: req.systemPrompt,
          tools: [{ functionDeclarations: req.tools }],
          maxOutputTokens: req.maxOutputTokens,
          abortSignal: req.signal,
        } as never,
      })

      const stopped = checkFinish(res)
      if (stopped) return { ok: false, ...stopped }

      const parts = ((res as { candidates?: Array<{ content?: { parts?: ConversePart[] } }> })
        .candidates?.[0]?.content?.parts ?? []) as ConversePart[]

      // An empty parts array is not an error here the way empty text is for
      // generate() — the runner reads "no calls, no text" as a finished turn.
      return {
        ok: true,
        parts,
        usage: readUsage(res),
        model: modelId,
        latencyMs: Date.now() - started,
      }
    } catch (e) {
      return { ok: false, ...mapError(e, req.signal, modelId) }
    }
  }

  return { id: 'gemini', schemaFlavour: 'loose', model, generate, converse }
}
