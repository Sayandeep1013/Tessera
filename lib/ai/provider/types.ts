/**
 * The provider boundary. See docs/specs/06a-provider.md §2.
 *
 * Handles transport and response shape ONLY. It does not build context, does not
 * own the prompt, and does not validate — everything a provider swap must not
 * change lives in lib/ai/.
 */

import type { SchemaFlavour } from '../opSchema'

export type EditRequest = {
  systemPrompt: string
  /** base64 PNG, no data: prefix */
  imagePngBase64: string
  userText: string
  jsonSchema: Record<string, unknown>
  maxOutputTokens: number
  signal?: AbortSignal
}

export type ProviderUsage = {
  inputTokens?: number
  outputTokens?: number
  thinkingTokens?: number
  totalTokens?: number
}

export type ProviderErrorKind =
  /** safety/policy decline — do not retry as-is */
  | 'refused'
  /** quota; retryAfterMs when the provider tells us */
  | 'rate_limited'
  /** 5xx, timeout, network, abort */
  | 'unavailable'
  /** 200 but unparseable as JSON, or truncated */
  | 'bad_response'
  /** missing key, bad model id — a deploy error, never a user-facing edit failure */
  | 'config'

export type EditResult =
  | { ok: true; raw: unknown; usage?: ProviderUsage; model: string; latencyMs: number }
  | { ok: false; kind: ProviderErrorKind; message: string; retryAfterMs?: number }

export interface AiProvider {
  readonly id: string
  readonly schemaFlavour: SchemaFlavour
  /** Resolved lazily — providers may pick a model from a live list. */
  model(): Promise<string>
  /** NEVER throws. Every failure is an EditResult. */
  generate(req: EditRequest): Promise<EditResult>
}
