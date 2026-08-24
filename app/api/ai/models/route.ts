/**
 * Model catalogue for a user-supplied key. See docs/specs/18-provider-byok.md §7.2.
 *
 * The dialog needs to offer the models a key can ACTUALLY reach, rather than a list
 * hard-coded in this repo that will be wrong within a month. (Measured 24 Aug 2026:
 * a real AgentRouter key exposes exactly one model, `claude-opus-5`, and no public
 * write-up of that catalogue was correct.)
 *
 * Same two rules as the agent route:
 *   - no key, no client config — the deployment's own credential is never sent to a
 *     host a browser named (§4.1)
 *   - the base URL passes every gate in §4.2 before anything is fetched
 *
 * An unreadable catalogue is a degraded dialog, never a blocked one: every failure
 * returns 200 with an empty list, so the user can still type a model id.
 */

import { NextResponse } from 'next/server'
import { parseClientProvider } from '@/lib/ai/provider/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMPTY = { models: [] as string[] }

/** Anthropic and every new-api relay answer /v1/models in the OpenAI list shape. */
type ModelList = { data?: Array<{ id?: unknown }> }

export async function POST(req: Request) {
  const key = req.headers.get('x-api-key')?.trim()
  if (!key) return NextResponse.json(EMPTY)

  let body: { provider?: unknown }
  try {
    body = (await req.json()) as { provider?: unknown }
  } catch {
    return NextResponse.json(EMPTY)
  }

  const parsed = parseClientProvider(body.provider)
  if (!parsed.ok || parsed.value.id !== 'anthropic') return NextResponse.json(EMPTY)

  const baseUrl = parsed.value.baseUrl || 'https://api.anthropic.com'
  const identity: Record<string, string> =
    parsed.value.profile === 'claude-code'
      ? { 'user-agent': 'claude-cli/2.0.14 (external, cli)', 'x-app': 'cli' }
      : { 'user-agent': 'tessera/0.1.0 (+https://github.com/Sayandeep1013/Tessera)' }

  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        'x-api-key': key,
        authorization: `Bearer ${key}`,
        'anthropic-version': '2023-06-01',
        ...identity,
      },
      // A dialog waits on this. Ten seconds or it is not worth having.
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return NextResponse.json(EMPTY)

    const json = (await res.json()) as ModelList
    const models = (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      // Bound it: a relay can list hundreds, and a dialog cannot use them.
      .slice(0, 100)

    return NextResponse.json({ models })
  } catch {
    // Network, timeout, a body that is not JSON — all the same answer.
    return NextResponse.json(EMPTY)
  }
}
