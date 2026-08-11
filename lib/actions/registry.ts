/**
 * The registry. See docs/specs/12-agent-actions.md §2.
 *
 * `toDeclarations()` is GENERATED from the same zod schemas the runtime validates
 * against, so what the model is told and what we accept cannot drift.
 */

import { z } from 'zod'
import { CATALOGUE } from './catalogue'
import { fail, type Action, type ActionCtx, type ActionResult } from './types'

export const ACTIONS: ReadonlyMap<string, Action<never>> = new Map(
  CATALOGUE.map((a) => [a.name, a]),
)

export function getAction(name: string): Action<never> | undefined {
  return ACTIONS.get(name)
}

/**
 * Execute an action by name. NEVER throws — an unknown name, malformed arguments,
 * or a handler that blows up all become a typed error the model can read and
 * recover from.
 */
export function runAction(name: string, args: unknown, ctx: ActionCtx): ActionResult {
  const action = ACTIONS.get(name)
  if (!action) {
    const known = [...ACTIONS.keys()].join(', ')
    return fail(`there is no action called "${name}". Available: ${known}`)
  }

  const parsed = action.input.safeParse(args ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    const where = issue.path.length ? `${issue.path.join('.')}: ` : ''
    return fail(`invalid arguments for ${name} — ${where}${issue.message}`)
  }

  if (action.kind === 'destructive' && !ctx.confirmed) {
    return fail('requires user confirmation')
  }

  try {
    return action.run(parsed.data as never, ctx)
  } catch (e) {
    return fail(`${name} failed: ${(e as Error).message}`)
  }
}

// ─── zod → Gemini function declarations ──────────────────────────────────────

type GSchema = {
  type: string
  description?: string
  properties?: Record<string, GSchema>
  required?: string[]
  items?: GSchema
  enum?: string[]
  nullable?: boolean
}

export type FunctionDeclaration = {
  name: string
  description: string
  parameters: GSchema
}

function unwrap(t: z.ZodTypeAny): z.ZodTypeAny {
  let inner: z.ZodTypeAny = t
  for (;;) {
    if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny
    else if (inner instanceof z.ZodDefault) inner = inner.removeDefault() as z.ZodTypeAny
    else if (inner instanceof z.ZodEffects) inner = inner.innerType() as z.ZodTypeAny
    else return inner
  }
}

function toGSchema(t: z.ZodTypeAny): GSchema {
  const inner = unwrap(t)
  const description = inner.description ?? t.description

  if (inner instanceof z.ZodString) return { type: 'STRING', description }
  if (inner instanceof z.ZodBoolean) return { type: 'BOOLEAN', description }
  if (inner instanceof z.ZodNumber) {
    const isInt = inner._def.checks?.some((c: { kind: string }) => c.kind === 'int')
    return { type: isInt ? 'INTEGER' : 'NUMBER', description }
  }
  if (inner instanceof z.ZodEnum) {
    return { type: 'STRING', enum: [...(inner.options as string[])], description }
  }
  if (inner instanceof z.ZodLiteral) {
    return { type: 'STRING', enum: [String(inner.value)], description }
  }
  // Gemini's declaration schema has no tuple type. Widen to an array of integers
  // and let the zod parse in runAction enforce the real shape.
  if (inner instanceof z.ZodTuple) return { type: 'ARRAY', items: { type: 'INTEGER' }, description }
  if (inner instanceof z.ZodArray) {
    return { type: 'ARRAY', items: toGSchema(inner.element as z.ZodTypeAny), description }
  }
  if (inner instanceof z.ZodObject) {
    const shape = inner.shape as Record<string, z.ZodTypeAny>
    const properties: Record<string, GSchema> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = toGSchema(value)
      if (!value.isOptional()) required.push(key)
    }
    return { type: 'OBJECT', properties, ...(required.length ? { required } : {}) }
  }
  return { type: 'STRING', description }
}

export function toDeclarations(): FunctionDeclaration[] {
  return CATALOGUE.map((a) => ({
    name: a.name,
    description: a.description,
    parameters: toGSchema(a.input as z.ZodTypeAny),
  }))
}

/** Grouped listing, used by the system prompt and by tests. */
export function actionNamesByKind(): Record<string, string[]> {
  const out: Record<string, string[]> = { query: [], view: [], mutate: [], destructive: [] }
  for (const a of CATALOGUE) out[a.kind]!.push(a.name)
  return out
}
