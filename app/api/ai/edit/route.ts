/**
 * The AI gateway. See docs/specs/06-ai-protocol.md §8.
 *
 * Node runtime, server only. The API key never reaches the browser.
 */

import { NextResponse } from 'next/server'
import { parseDoc } from '@/lib/artwork-core/codec'
import { buildContext, buildUserText } from '@/lib/ai/context'
import { SYSTEM_PROMPT } from '@/lib/ai/prompt'
import { schemaFor } from '@/lib/ai/opSchema'
import { validateResponse } from '@/lib/ai/validate'
import { getProvider } from '@/lib/ai/provider'
import { MAX_BODY_BYTES, MAX_INSTRUCTION, RATE_LIMIT_PER_HOUR } from '@/lib/ai/limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// In-memory sliding window. A demo does not need Redis; the tradeoff (resets on
// deploy, per-instance) is acceptable and stated in the spec.
const hits = new Map<string, number[]>()
const HOUR = 3_600_000

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR)
  if (recent.length >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, retryAfter: Math.ceil((HOUR - (now - recent[0]!)) / 1000) }
  }
  recent.push(now)
  hits.set(ip, recent)
  // sweep so the map cannot grow without bound
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < HOUR)) hits.delete(k)
  }
  return { ok: true }
}

const fail = (status: number, code: string, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ code, message, ...extra }, { status })

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'

  const limited = rateLimit(ip)
  if (!limited.ok) {
    return fail(
      429,
      'rate_limited',
      `You've used all ${RATE_LIMIT_PER_HOUR} AI edits for this hour. Try again later.`,
      { retryAfter: limited.retryAfter },
    )
  }

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) {
    return fail(413, 'too_large', 'That artwork is too large to send.')
  }

  let body: { doc?: unknown; frame?: unknown; instruction?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return fail(400, 'bad_json', 'The request was malformed.')
  }

  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''
  if (!instruction) return fail(400, 'bad_instruction', 'Type what you want changed.')
  if (instruction.length > MAX_INSTRUCTION) {
    return fail(400, 'bad_instruction', `Keep it under ${MAX_INSTRUCTION} characters.`)
  }

  const parsed = parseDoc(body.doc)
  if (!parsed.ok) {
    return fail(400, parsed.error.code, `That artwork couldn't be read: ${parsed.error.message}`)
  }
  const doc = parsed.value
  const frame = typeof body.frame === 'number' ? body.frame : 0

  const provider = getProvider()
  const ctx = buildContext(doc, frame)

  const res = await provider.generate({
    systemPrompt: SYSTEM_PROMPT,
    imagePngBase64: ctx.png,
    userText: buildUserText(doc, frame, instruction),
    jsonSchema: schemaFor(provider.schemaFlavour),
    maxOutputTokens: 8000,
  })

  if (!res.ok) {
    switch (res.kind) {
      case 'rate_limited':
        return fail(429, 'upstream_rate_limited', 'The model is busy right now. Try again in a moment.', {
          retryAfter: Math.ceil((res.retryAfterMs ?? 20_000) / 1000),
        })
      case 'refused':
        return fail(422, 'refused', 'The model declined this request. Try rephrasing it.')
      case 'bad_response':
        return fail(502, 'bad_response', "The model's reply couldn't be read. Nothing changed.")
      case 'config':
        // A deploy fault — never presented as a failed edit.
        console.error('[ai/edit] provider config error:', res.message)
        return fail(500, 'config', 'AI editing is not configured for this deployment.')
      default:
        return fail(503, 'unavailable', "Couldn't reach the model. Your artwork is safe — try again.")
    }
  }

  const v = validateResponse(res.raw, doc, frame)
  if (!v.ok) {
    const friendly: Record<string, string> = {
      empty_diff: 'No change was proposed — try being more specific.',
      pixel_budget: 'That edit was too large. Try asking for one change at a time.',
      too_many_ops: 'That edit was too complex. Try asking for one change at a time.',
    }
    return fail(
      422,
      v.error.code,
      friendly[v.error.code] ?? "The proposed edit wasn't valid and was discarded. Nothing changed.",
    )
  }

  const p = v.value
  return NextResponse.json({
    summary: p.summary,
    operations: p.ops,
    diff: p.diff,
    latencyMs: res.latencyMs,
    model: res.model,
  })
}
