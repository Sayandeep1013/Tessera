/**
 * Wire schemas for the model, derived from the zod union so the two cannot drift.
 * See docs/specs/06-ai-protocol.md §4 and 06a §4.
 *
 * Two flavours:
 *   strict — the real discriminated union, for providers that support oneOf.
 *   loose  — one permissive object shape, for providers that do not (Gemini).
 *
 * The loose flavour costs nothing in safety: every gate in validate.ts runs on
 * the result regardless, and gate 1 is a strict zod parse of the real union.
 */

import { z } from 'zod'
import { opSchema, type Op } from '../artwork-core/ops'
import { MAX_SUMMARY } from './limits'

export const aiEditResponseSchema = z.object({
  summary: z.string().trim().min(1).max(MAX_SUMMARY),
  operations: z.array(opSchema).min(1),
})

export type AiEditResponse = { summary: string; operations: Op[] }

export type SchemaFlavour = 'strict' | 'loose'
type JsonSchema = Record<string, unknown>

const OP_NAMES = opSchema.options.map(
  (o) => (o.shape.op as z.ZodLiteral<string>).value,
)

/** Map a zod type to its JSON Schema equivalent. Deliberately small. */
function jsonTypeOf(t: z.ZodTypeAny): JsonSchema {
  let inner: z.ZodTypeAny = t
  // unwrap optional/default/effects wrappers
  for (;;) {
    if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny
    else if (inner instanceof z.ZodDefault) inner = inner.removeDefault() as z.ZodTypeAny
    else if (inner instanceof z.ZodEffects) inner = inner.innerType() as z.ZodTypeAny
    else break
  }
  if (inner instanceof z.ZodNumber) return { type: 'integer' }
  if (inner instanceof z.ZodString) return { type: 'string' }
  if (inner instanceof z.ZodBoolean) return { type: 'boolean' }
  if (inner instanceof z.ZodLiteral) return { type: 'string', enum: [inner.value] }
  if (inner instanceof z.ZodTuple) return { type: 'array', items: { type: 'integer' } }
  if (inner instanceof z.ZodArray) {
    return { type: 'array', items: jsonTypeOf(inner.element as z.ZodTypeAny) }
  }
  return {}
}

/**
 * Every field across every union member, merged into one flat object shape.
 * Only `op` is required — the validator enforces the rest.
 */
function buildLooseOpSchema(): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    op: { type: 'string', enum: OP_NAMES },
  }
  for (const member of opSchema.options) {
    for (const [key, type] of Object.entries(member.shape)) {
      if (key === 'op') continue
      properties[key] ??= jsonTypeOf(type as z.ZodTypeAny)
    }
  }
  return { type: 'object', properties, required: ['op'] }
}

function buildStrictOpSchema(): JsonSchema {
  return {
    oneOf: opSchema.options.map((member) => {
      const properties: Record<string, JsonSchema> = {}
      const required: string[] = []
      for (const [key, type] of Object.entries(member.shape)) {
        properties[key] = jsonTypeOf(type as z.ZodTypeAny)
        if (!(type as z.ZodTypeAny).isOptional()) required.push(key)
      }
      return { type: 'object', properties, required, additionalProperties: false }
    }),
  }
}

function wrap(opShape: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      operations: { type: 'array', items: opShape },
    },
    required: ['summary', 'operations'],
  }
}

export const LOOSE_SCHEMA = wrap(buildLooseOpSchema())
export const STRICT_SCHEMA = wrap(buildStrictOpSchema())

export function schemaFor(flavour: SchemaFlavour): JsonSchema {
  return flavour === 'strict' ? STRICT_SCHEMA : LOOSE_SCHEMA
}

/** Exposed for the drift test in __tests__/schema.test.ts. */
export const ALL_OP_FIELDS: string[] = (() => {
  const s = new Set<string>()
  for (const member of opSchema.options) for (const k of Object.keys(member.shape)) s.add(k)
  return [...s].sort()
})()
