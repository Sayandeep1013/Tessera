/**
 * Gemini-shaped turns ⇄ Anthropic content blocks. See docs/specs/18-provider-byok.md §6.
 *
 * `ConversePart` is Gemini-shaped by an explicit decision in spec 12 §5 — the second
 * provider gets one adapter written against a shape we can already see working. This
 * module is that adapter's translation half, kept separate from transport so it can
 * be tested without a fetch anywhere near it.
 *
 * THE THING THAT MAKES THIS NON-TRIVIAL (§6.1): Gemini pairs a response to its call
 * by NAME. Anthropic pairs by ID, and rejects the request outright when a
 * tool_result's tool_use_id does not name a tool_use in the immediately preceding
 * assistant message. Our history carries no ids, and a BYOK provider is rebuilt on
 * every request — so it cannot remember ids it minted last turn.
 *
 * The whole history is re-sent every turn, so position IS identity: the same call
 * occupies the same coordinates in every request of a session. Deriving the id from
 * those coordinates needs no state and produces the same id every time.
 */

import type { ConversePart, ConverseTurn } from './types'

export type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicBlock[] }

export type AnthropicTool = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/**
 * Position is identity. `turn` is the index in the history array, `ordinal` counts
 * tool_use blocks WITHIN that turn — not raw part indices, because a model turn
 * interleaves text with its calls and the responses that follow only ever count
 * the calls.
 */
export function toolUseId(turn: number, ordinal: number): string {
  return `toolu_${turn}_${ordinal}`
}

const isCall = (p: ConversePart): p is Extract<ConversePart, { functionCall: unknown }> =>
  'functionCall' in p

const isResponse = (p: ConversePart): p is Extract<ConversePart, { functionResponse: unknown }> =>
  'functionResponse' in p

/**
 * One model turn's parts → assistant content blocks, plus the ids minted for its
 * calls in call order.
 */
function assistantBlocks(
  parts: ConversePart[],
  turn: number,
): { blocks: AnthropicBlock[]; ids: string[] } {
  const blocks: AnthropicBlock[] = []
  const ids: string[] = []

  for (const part of parts) {
    if ('text' in part) {
      // An empty text block is a 400. The model emits them; drop them here rather
      // than discovering it as a failed session.
      if (part.text.trim()) blocks.push({ type: 'text', text: part.text })
    } else if ('inlineData' in part) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.inlineData.mimeType,
          data: part.inlineData.data,
        },
      })
    } else if (isCall(part)) {
      const id = toolUseId(turn, ids.length)
      ids.push(id)
      blocks.push({
        type: 'tool_use',
        id,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
      })
    }
    // A functionResponse in a model turn is malformed; ignoring it beats sending
    // a block the API will reject.
  }

  return { blocks, ids }
}

/**
 * History → messages. The system prompt is NOT a message; the caller puts it in the
 * top-level `system` field.
 */
export function toAnthropicMessages(history: ConverseTurn[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  /** Ids minted by the immediately preceding assistant turn, awaiting results. */
  let pending: string[] = []

  history.forEach((turn, t) => {
    if (turn.role === 'model') {
      const { blocks, ids } = assistantBlocks(turn.parts, t)
      pending = ids
      if (blocks.length) out.push({ role: 'assistant', content: blocks })
      return
    }

    // A tool_result must be the FIRST content in its message, and every result for
    // one assistant turn must share a single message. Both are API requirements,
    // not preferences — so results are gathered ahead of everything else.
    const results: AnthropicBlock[] = []
    const rest: AnthropicBlock[] = []

    for (const part of turn.parts) {
      if (isResponse(part)) {
        const id = pending[results.length]
        // No id to pair with means the model never made this call. Sending it
        // anyway is a 400; dropping it is the only correct move.
        if (id === undefined) continue
        results.push({
          type: 'tool_result',
          tool_use_id: id,
          content: JSON.stringify(part.functionResponse.response),
        })
      } else if ('text' in part) {
        if (part.text.trim()) rest.push({ type: 'text', text: part.text })
      } else if ('inlineData' in part) {
        rest.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.inlineData.mimeType,
            data: part.inlineData.data,
          },
        })
      }
    }

    /**
     * Every tool_use MUST be answered in the very next user message or the request
     * is rejected whole. The runner always answers all of them (spec 12 §5), so
     * this filler should never fire — but "should never" plus "rejects the entire
     * session" is exactly the pair that earns a guard.
     */
    for (let k = results.length; k < pending.length; k++) {
      results.push({
        type: 'tool_result',
        tool_use_id: pending[k]!,
        content: JSON.stringify({ ok: false, error: 'no result was recorded for this call' }),
      })
    }

    pending = []
    const content = [...results, ...rest]
    if (content.length) out.push({ role: 'user', content })
  })

  return out
}

/** Anthropic response content → the Gemini-shaped parts the runner understands. */
export function fromAnthropicContent(content: unknown): ConversePart[] {
  if (!Array.isArray(content)) return []
  const parts: ConversePart[] = []

  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      if (block.text.trim()) parts.push({ text: block.text })
    } else if (block?.type === 'tool_use' && typeof block.name === 'string') {
      parts.push({
        functionCall: {
          name: block.name,
          args: (block.input ?? {}) as Record<string, unknown>,
        },
      })
    }
    // 'thinking' and 'redacted_thinking' carry no instruction for the runner and
    // are deliberately dropped.
  }

  return parts
}

/**
 * Gemini's declaration dialect → JSON Schema.
 *
 * MEASURED, 24 Aug 2026: the first live agent session against claude-opus-5 died on
 * a 400 for every request. `toDeclarations()` in lib/actions/registry.ts emits
 * Gemini's schema dialect, whose types are UPPERCASE — `"OBJECT"`, `"INTEGER"`,
 * `"ARRAY"`. Anthropic's `input_schema` is real JSON Schema and wants them
 * lowercase, so all 25 tools were rejected together.
 *
 * The registry stays Gemini-shaped on purpose (spec 12 §5), so the conversion
 * belongs here — a provider adapter absorbing a provider difference — rather than in
 * the registry, where it would make the declarations neither dialect.
 */
type GeminiSchema = {
  type?: string
  description?: string
  enum?: string[]
  items?: GeminiSchema
  properties?: Record<string, GeminiSchema>
  required?: string[]
  nullable?: boolean
}

export function toJsonSchema(schema: GeminiSchema): Record<string, unknown> {
  const type = String(schema.type ?? 'string').toLowerCase()
  const out: Record<string, unknown> = { type }

  if (schema.description) out.description = schema.description
  if (schema.enum?.length) out.enum = schema.enum

  if (type === 'object') {
    const properties: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      properties[key] = toJsonSchema(value)
    }
    // Always present, even when empty: Anthropic rejects an object schema with no
    // properties key, and several actions take no arguments at all.
    out.properties = properties
    if (schema.required?.length) out.required = schema.required
  }

  if (type === 'array') {
    out.items = schema.items ? toJsonSchema(schema.items) : { type: 'string' }
  }

  // `nullable` is Gemini's, not JSON Schema's, and is dropped rather than
  // translated — no action in the catalogue declares one.
  return out
}

/** Tool declarations: the registry's shape → Anthropic's. */
export function toAnthropicTools(
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>,
): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: toJsonSchema(t.parameters as GeminiSchema),
  }))
}
