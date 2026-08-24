'use client'

/**
 * The agent loop. See docs/specs/12-agent-actions.md §5.
 *
 * Runs client-side because the state it drives — tool, colour, brush, zoom — lives
 * in the browser. Model calls proxy through /api/ai/agent so the key stays server
 * side; the client owns the conversation.
 */

import { AgentSession, type SessionOutcome, type StepLog } from './session'
import { MAX_CALLS_PER_TURN, MAX_RETRY_WAIT_S, MAX_STEPS, RETRY_ON_RATE_LIMIT } from './limits'
import { getAction, runAction } from '../actions/registry'
import { FINISH } from '../actions/catalogue'
import type { ActionCtx, ActionResult } from '../actions/types'
import type { Doc } from '../artwork-core/schema'
import type { ClientProviderConfig } from '../ai/provider/config'

// ─── wire types ──────────────────────────────────────────────────────────────

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

export type Turn = { role: 'user' | 'model'; parts: Part[] }

type ProxyOk = { ok: true; parts: Part[] }
type ProxyErr = { ok: false; status: number; code: string; message: string; retryAfter?: number }

// ─── public surface ──────────────────────────────────────────────────────────

export type AgentStep =
  | { type: 'thinking'; step: number; of: number }
  | { type: 'waiting'; seconds: number; attempt: number; of: number }
  | { type: 'action'; step: number; name: string; args: unknown; result: ActionResult }
  | { type: 'needs-confirm'; name: string; args: unknown }
  | { type: 'error'; message: string; code?: string }

export type RunOptions = {
  instruction: string
  /** Rendered ruled PNG of the current artwork, base64, no data: prefix. */
  imagePngBase64: string
  ctx: ActionCtx
  sessionId: string
  apiKey?: string
  /** The user's own provider choice. Only ever sent alongside their own key — see
   *  docs/specs/18-provider-byok.md §4.1. */
  provider?: ClientProviderConfig
  signal?: AbortSignal
  onStep?: (s: AgentStep) => void
  /** Resolve true to run a destructive action. Rejecting is a normal outcome. */
  onConfirm?: (name: string, args: unknown) => Promise<boolean>
  /** The live document, read fresh each time — the store owns it, not us. */
  currentDoc: () => Doc | null
  /**
   * The rate-limit wait, injectable so tests can exercise the retry without
   * actually sleeping for a minute. Real code never passes this.
   */
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<boolean>
}

export type AgentOutcome = SessionOutcome & { steps: StepLog[] }

// ─────────────────────────────────────────────────────────────────────────────

export async function runAgent(opts: RunOptions): Promise<AgentOutcome> {
  const startDoc = opts.currentDoc()
  if (!startDoc) throw new Error('no document is open')

  const session = new AgentSession(opts.sessionId, opts.instruction, startDoc)

  /**
   * Everything the session scopes, wired once. The caller supplies a raw commit
   * that applies without pushing history; the session turns that into an undo
   * stack the agent cannot reach past. See AgentSession's session-scoped undo.
   */
  const scoped: ActionCtx = {
    ...opts.ctx,
    budget: session.budget,
    commit: (cmd) => {
      opts.ctx.commit(cmd)
      session.noteApplied(cmd)
    },
    // NOTE: these commit through opts.ctx, not the wrapper above — reversing a
    // change must pop the stack, not push another entry onto it.
    undo: () => {
      const inverse = session.takeUndo()
      if (inverse) opts.ctx.commit(inverse)
    },
    redo: () => {
      const cmd = session.takeRedo()
      if (cmd) opts.ctx.commit(cmd)
    },
    historyDepth: () => session.depth(),
  }

  const history: Turn[] = [
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: opts.imagePngBase64 } },
        { text: opts.instruction },
      ],
    },
  ]

  let summary = ''
  let stoppedBy: SessionOutcome['stoppedBy'] = 'cap'

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (opts.signal?.aborted) {
      stoppedBy = 'abort'
      break
    }
    opts.onStep?.({ type: 'thinking', step, of: MAX_STEPS })

    /**
     * A transient failure must not destroy the session.
     *
     * Measured 24 Aug 2026 (docs/specs/19): a single upstream 429 mid-session
     * ended the run outright, and the user lost a half-finished drawing that the
     * model was minutes into. The provider tells us how long to wait; not waiting
     * is a choice we were making for no reason.
     *
     * Extended the same session: two live requests were killed by the transport
     * itself (Node's default fetch dispatcher has a 5-minute headersTimeout, and a
     * detailed drawing routinely takes longer than that to generate in one turn —
     * see anthropic.ts). That surfaces as `unavailable`, same as a genuine 5xx or
     * a dropped connection. It is worth one retry for the same reason a 429 is:
     * the failure was ours, not a verdict on the request.
     *
     * Only these two kinds are retried. A refusal, a bad key or a malformed reply
     * will not become true by asking again, and retrying those would just spend
     * someone's quota to reach the same answer slower.
     */
    let reply = await callModel(history, opts)
    for (let attempt = 1; attempt <= RETRY_ON_RATE_LIMIT && !reply.ok; attempt++) {
      const isRateLimit = reply.code === 'upstream_rate_limited' || reply.code === 'rate_limited'
      const isTransient = reply.code === 'unavailable'
      if (!isRateLimit && !isTransient) break

      // A rate limit has a real retryAfter; a dropped connection does not, so a
      // short fixed backoff stands in rather than reusing the rate-limit default.
      const seconds = isRateLimit ? Math.min(reply.retryAfter ?? 20, MAX_RETRY_WAIT_S) : 5
      opts.onStep?.({ type: 'waiting', seconds, attempt, of: RETRY_ON_RATE_LIMIT })
      const slept = await (opts.sleepFn ?? sleep)(seconds * 1000, opts.signal)
      if (!slept) break // aborted while waiting
      reply = await callModel(history, opts)
    }

    if (!reply.ok) {
      opts.onStep?.({ type: 'error', message: reply.message, code: reply.code })
      stoppedBy = 'error'
      break
    }

    const calls = reply.parts.filter(
      (p): p is Extract<Part, { functionCall: unknown }> => 'functionCall' in p,
    )

    // No calls means the model answered in prose — it is done, or stuck.
    if (calls.length === 0) {
      const text = reply.parts.filter((p) => 'text' in p).map((p) => (p as { text: string }).text)
      summary = text.join(' ').trim() || 'Finished without making changes.'
      stoppedBy = 'no-calls'
      break
    }

    history.push({ role: 'model', parts: reply.parts })

    const responses: Part[] = []
    let finished = false

    for (const [i, call] of calls.entries()) {
      if (opts.signal?.aborted) {
        stoppedBy = 'abort'
        finished = true
        break
      }

      const { name, args = {} } = call.functionCall

      // Over-limit calls must be REPORTED, not dropped — the model has to know
      // what did not run.
      if (i >= MAX_CALLS_PER_TURN) {
        responses.push(fnResponse(name, {
          ok: false,
          error: `too many calls in one turn; only the first ${MAX_CALLS_PER_TURN} ran`,
        }))
        continue
      }

      if (name === FINISH) {
        const result = runAction(name, args, scoped)
        session.record(name, args, result)
        opts.onStep?.({ type: 'action', step, name, args, result })
        summary =
          (result.ok && (result.data as { summary?: string })?.summary) ||
          'Finished.'
        stoppedBy = 'finish'
        finished = true
        break
      }

      const result = await invoke(name, args, scoped, opts)
      session.record(name, args, result)
      opts.onStep?.({ type: 'action', step, name, args, result })
      responses.push(fnResponse(name, result))
    }

    if (finished) break

    history.push({ role: 'user', parts: responses })
  }

  const endDoc = opts.currentDoc() ?? startDoc

  /**
   * A session that ran out of steps never called finish, so it has no summary —
   * and the fallback used to be the single word "Finished."
   *
   * Measured 24 Aug 2026 (docs/specs/19): eval scenario G2 drew a complete,
   * pixel-exact butterfly, used all its steps, and told the user "122 pixels
   * changed · Finished." The headline in outcome.ts only mentions the cap when
   * NOTHING changed, so a truncated session that did draw reported itself as a
   * finished one. Telling someone their work is done when it was cut off is the
   * same class of dishonesty hard rule 7 forbids for artwork.
   */
  const fallback =
    stoppedBy === 'cap'
      ? `Ran out of steps after ${MAX_STEPS} turns — this may be unfinished.`
      : 'Finished.'

  return session.finalise(
    endDoc,
    summary || fallback,
    stoppedBy,
    opts.ctx.frame(),
    opts.ctx.layer(),
  )
}

// ─── one action, including the confirmation round trip ───────────────────────

async function invoke(
  name: string,
  args: Record<string, unknown>,
  scoped: ActionCtx,
  opts: RunOptions,
): Promise<ActionResult> {
  const action = getAction(name)

  if (action?.kind === 'destructive') {
    opts.onStep?.({ type: 'needs-confirm', name, args })
    const approved = opts.onConfirm ? await opts.onConfirm(name, args) : false
    if (!approved) {
      return { ok: false, error: 'the user declined this action' }
    }
    return runAction(name, args, { ...scoped, confirmed: true })
  }

  return runAction(name, args, { ...scoped, confirmed: false })
}

/** Resolves false if the wait was aborted, so the caller stops instead of retrying. */
function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// ─── proxy ───────────────────────────────────────────────────────────────────

async function callModel(history: Turn[], opts: RunOptions): Promise<ProxyOk | ProxyErr> {
  try {
    const res = await fetch('/api/ai/agent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(opts.apiKey ? { 'x-api-key': opts.apiKey } : {}),
      },
      body: JSON.stringify({
        sessionId: opts.sessionId,
        history,
        ...(opts.provider ? { provider: opts.provider } : {}),
      }),
      signal: opts.signal,
    })

    const data = (await res.json()) as Record<string, unknown>
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: String(data.code ?? 'error'),
        message: String(data.message ?? 'Something went wrong.'),
        retryAfter: typeof data.retryAfter === 'number' ? data.retryAfter : undefined,
      }
    }
    return { ok: true, parts: (data.parts ?? []) as Part[] }
  } catch {
    if (opts.signal?.aborted) {
      return { ok: false, status: 0, code: 'aborted', message: 'Stopped.' }
    }
    return {
      ok: false,
      status: 0,
      code: 'network',
      message: "Couldn't reach the server. Your artwork is safe.",
    }
  }
}

function fnResponse(name: string, result: ActionResult): Part {
  return {
    functionResponse: {
      name,
      response: result.ok
        ? { ok: true, ...(result.data ? { result: result.data } : {}) }
        : { ok: false, error: result.error },
    },
  }
}
