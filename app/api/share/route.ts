/**
 * Publish a read-only snapshot. See docs/specs/09-persistence.md §3.
 *
 * The abuse surface is the whole design problem here: this is an
 * unauthenticated public insert into a database, reachable by anyone who can
 * reach the deployment. Four things stand between it and a landfill —
 *
 *   1. a hard body cap, checked before anything is parsed;
 *   2. parseDoc, so a row can never contain something the viewer cannot render;
 *   3. a per-IP hourly limit, the same sliding window the agent route uses;
 *   4. the service role, which is the ONLY way to write — the table's public
 *      insert policy was dropped, so a leaked anon key cannot bypass 1–3.
 *
 * Never insert unvalidated JSON. The viewer is a server component with no way
 * to recover from a malformed row beyond apologising, and the row is immutable,
 * so a bad insert is permanent.
 */

import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { parseDoc } from '@/lib/artwork-core/codec'
import { SHARE_ID_LENGTH, putShare, shareConfigured } from '@/lib/persist/share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOUR = 3_600_000

/** Spec 09 §3. A 64x64 document with a full palette serialises well under this. */
export const MAX_SHARE_BYTES = 256 * 1024
export const SHARES_PER_HOUR = 10

/** In-memory and per-instance, like the agent route's. Resets on deploy; a
 *  portfolio demo does not need Redis, and the tradeoff is stated in the spec. */
const seen = new Map<string, number[]>()

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now()
  const recent = (seen.get(ip) ?? []).filter((at) => now - at < HOUR)

  if (recent.length >= SHARES_PER_HOUR) {
    seen.set(ip, recent)
    return { ok: false, retryAfter: Math.ceil((HOUR - (now - recent[0]!)) / 1000) }
  }

  recent.push(now)
  seen.set(ip, recent)
  if (seen.size > 5000) {
    for (const [k, v] of seen) if (!v.some((at) => now - at < HOUR)) seen.delete(k)
  }
  return { ok: true }
}

/** Tests share a module instance across cases; without this the 11th-share case
 *  would poison every case after it. */
export function __resetShareLimit(): void {
  seen.clear()
}

const fail = (status: number, code: string, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ code, message, ...extra }, { status })

export async function POST(req: Request) {
  if (!shareConfigured()) {
    return fail(
      503,
      'not_configured',
      "Sharing isn't configured for this deployment.",
    )
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'

  // Length first, before JSON.parse — parsing a 50MB body to find out it is too
  // big is the denial of service, not the protection against one.
  const raw = await req.text()
  if (raw.length > MAX_SHARE_BYTES) {
    return fail(
      413,
      'too_large',
      'This artwork is too large to share. The limit is 256KB of JSON.',
    )
  }

  let body: { doc?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return fail(400, 'bad_json', 'That request was not valid JSON.')
  }

  const parsed = parseDoc(typeof body.doc === 'string' ? body.doc : JSON.stringify(body.doc))
  if (!parsed.ok) {
    return fail(400, 'bad_doc', parsed.error.message, { detail: parsed.error.code })
  }

  // After validation, so a rejected document does not spend the caller's quota.
  const limited = rateLimit(ip)
  if (!limited.ok) {
    return fail(
      429,
      'rate_limited',
      `You've shared ${SHARES_PER_HOUR} artworks this hour. Try again later.`,
      { retryAfter: limited.retryAfter },
    )
  }

  const id = nanoid(SHARE_ID_LENGTH)
  // Store what parseDoc accepted, not what arrived: the round trip through the
  // codec is what guarantees the viewer can read the row back.
  const stored = typeof body.doc === 'string' ? JSON.parse(body.doc) : body.doc
  const put = await putShare(id, parsed.value, stored)
  if (!put.ok) {
    return fail(502, 'store_failed', "Couldn't save the share. Your artwork is safe locally.")
  }

  const origin = req.headers.get('origin') ?? new URL(req.url).origin
  return NextResponse.json({ id, url: `${origin}/a/${id}` }, { status: 201 })
}
