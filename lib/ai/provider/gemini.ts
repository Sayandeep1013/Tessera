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
 */

import { GoogleGenAI } from '@google/genai'
import type { AiProvider, EditRequest, EditResult, ProviderUsage } from './types'

/** Newest-first, Flash-Lite first — that is where the free quota lives. */
const PREFERENCE = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-flash-latest',
]

export function createGeminiProvider(apiKey: string | undefined): AiProvider {
  let resolved: string | null = null
  let client: GoogleGenAI | null = null

  const getClient = (): GoogleGenAI | null => {
    if (!apiKey) return null
    client ??= new GoogleGenAI({ apiKey })
    return client
  }

  async function model(): Promise<string> {
    if (resolved) return resolved
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
        resolved = candidate
        return candidate
      } catch {
        continue
      }
    }
    throw new Error(`none of the preferred models are usable: ${PREFERENCE.join(', ')}`)
  }

  async function generate(req: EditRequest): Promise<EditResult> {
    const ai = getClient()
    if (!ai) {
      return { ok: false, kind: 'config', message: 'GEMINI_API_KEY is not set' }
    }

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

      // Check why generation stopped BEFORE touching candidate text: a blocked
      // response has none, and indexing into it throws.
      const cand = (res as { candidates?: Array<{ finishReason?: string }> }).candidates?.[0]
      const blockReason = (res as { promptFeedback?: { blockReason?: string } }).promptFeedback
        ?.blockReason
      const finish = cand?.finishReason

      if (blockReason || finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
        return {
          ok: false,
          kind: 'refused',
          message: `the model declined this request (${blockReason ?? finish})`,
        }
      }
      if (finish === 'MAX_TOKENS') {
        return {
          ok: false,
          kind: 'bad_response',
          message: 'the response was truncated before it was complete',
        }
      }

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

      const u = res.usageMetadata as Record<string, number> | undefined
      const usage: ProviderUsage = {
        inputTokens: u?.promptTokenCount,
        outputTokens: u?.candidatesTokenCount,
        thinkingTokens: u?.thoughtsTokenCount,
        totalTokens: u?.totalTokenCount,
      }

      return { ok: true, raw, usage, model: modelId, latencyMs: Date.now() - started }
    } catch (e) {
      const msg = String((e as Error).message ?? e)

      if (req.signal?.aborted) {
        return { ok: false, kind: 'unavailable', message: 'the request was cancelled' }
      }
      if (/RESOURCE_EXHAUSTED|"code":\s*429|quota/i.test(msg)) {
        const secs = /retry in ([\d.]+)s/i.exec(msg)?.[1] ?? /"retryDelay":\s*"(\d+)s"/.exec(msg)?.[1]
        return {
          ok: false,
          kind: 'rate_limited',
          message: 'the model is rate limited right now',
          retryAfterMs: secs ? Math.ceil(parseFloat(secs) * 1000) : 20_000,
        }
      }
      if (/API key|API_KEY_INVALID|PERMISSION_DENIED|"code":\s*40[13]/i.test(msg)) {
        return { ok: false, kind: 'config', message: `the API key was rejected: ${msg.slice(0, 200)}` }
      }
      if (/NOT_FOUND|"code":\s*404/i.test(msg)) {
        resolved = null // force re-resolution next call
        return { ok: false, kind: 'config', message: `model "${modelId}" is unavailable` }
      }
      if (/"code":\s*400|INVALID_ARGUMENT/i.test(msg)) {
        return { ok: false, kind: 'config', message: `the request was rejected: ${msg.slice(0, 300)}` }
      }
      return { ok: false, kind: 'unavailable', message: msg.slice(0, 300) }
    }
  }

  return { id: 'gemini', schemaFlavour: 'loose', model, generate }
}
