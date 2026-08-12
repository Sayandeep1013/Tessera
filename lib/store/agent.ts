'use client'

/**
 * Agent session lifecycle. See docs/specs/12-agent-actions.md §5.
 *
 *   idle -> running -> done      (finished, or stopped, or capped)
 *                   -> error
 *                   -> confirm -> running     (a destructive action, mid-flight)
 *
 * Unlike the single-shot proposal in ./ai.ts there is no review step: the work
 * lands on the canvas as it happens, and the whole session is one undo. Reject and
 * undo are the same gesture, so there is nothing to accept.
 */

import { create } from 'zustand'
import { runAgent, type AgentStep } from '../agent/run'
import type { SessionOutcome } from '../agent/session'
import { diffCounts } from '../artwork-core/diff'
import { buildContext } from '../ai/context'
import { checkAccess, recordFreeSession } from '../agent/byok'
import type { ActionCtx } from '../actions/types'
import type { EditorCommand } from '../artwork-core/commands'
import { useDocStore } from './editor'
import { buildCtx } from './ctx'

export type AgentStatus = 'idle' | 'running' | 'confirm' | 'done' | 'error'

export type LogEntry = {
  id: number
  name: string
  args: unknown
  ok: boolean
  detail: string
}

type ConfirmRequest = { name: string; args: unknown; resolve: (approved: boolean) => void }

type AgentState = {
  status: AgentStatus
  instruction: string
  log: LogEntry[]
  step: number
  ofSteps: number
  summary: string
  changed: number
  /** Why the run ended. The panel's headline is computed from this and
   *  `changed`, never from the model's own account of itself — see
   *  lib/agent/outcome.ts and docs/specs/15-feedback-and-input.md §3. */
  stoppedBy: SessionOutcome['stoppedBy'] | null
  /** The added/changed/cleared breakdown, kept because it reads far better than
   *  a single total — it says what kind of edit happened, not just how big. */
  counts: { added: number; changed: number; removed: number; palette: number }
  error: string | null
  /** Set when the error is one the user can fix by supplying their own key. */
  needsKey: boolean
  confirm: ConfirmRequest | null
  freeLeft: number

  setInstruction: (s: string) => void
  start: () => Promise<void>
  stop: () => void
  answerConfirm: (approved: boolean) => void
  dismiss: () => void
  refreshAccess: () => void
}

const ZERO = { added: 0, changed: 0, removed: 0, palette: 0 }

let controller: AbortController | null = null
let nextId = 0

/** One place that knows how an action result becomes a line of readable log. */
function describe(step: Extract<AgentStep, { type: 'action' }>): LogEntry {
  const { name, args, result } = step
  if (!result.ok) return { id: nextId++, name, args, ok: false, detail: result.error }

  const data = (result.data ?? {}) as Record<string, unknown>
  const detail =
    typeof data.changed === 'number'
      ? `${data.changed} pixel${data.changed === 1 ? '' : 's'}`
      : typeof data.summary === 'string'
        ? data.summary
        : ''
  return { id: nextId++, name, args, ok: true, detail }
}

export const useAgentStore = create<AgentState>((set, get) => ({
  status: 'idle',
  instruction: '',
  log: [],
  step: 0,
  ofSteps: 0,
  summary: '',
  changed: 0,
  stoppedBy: null,
  counts: ZERO,
  error: null,
  needsKey: false,
  confirm: null,
  freeLeft: 0,

  setInstruction: (s) => set({ instruction: s }),

  refreshAccess: () => {
    const access = checkAccess()
    set({ freeLeft: access.allowed && !access.usingOwnKey ? access.freeLeft : 0 })
  },

  answerConfirm: (approved) => {
    const c = get().confirm
    if (!c) return
    set({ confirm: null, status: 'running' })
    c.resolve(approved)
  },

  stop: () => controller?.abort(),

  dismiss: () =>
    set({ status: 'idle', log: [], summary: '', changed: 0, stoppedBy: null, counts: ZERO, error: null, needsKey: false, step: 0 }),

  start: async () => {
    const instruction = get().instruction.trim()
    if (!instruction || get().status === 'running') return

    const docStore = useDocStore.getState()
    const doc = docStore.doc
    if (!doc) return

    const access = checkAccess()
    if (!access.allowed) {
      set({
        status: 'error',
        error: 'You have used both free AI tries. Add your own API key to keep going.',
        needsKey: true,
      })
      return
    }

    controller = new AbortController()
    set({ status: 'running', log: [], summary: '', changed: 0, stoppedBy: null, counts: ZERO, error: null, needsKey: false })

    // From here the document is written without touching history, so the user can
    // watch the work land and still reverse the whole session with one undo.
    docStore.beginAgentSession()

    // The same bridge the toolbar uses — see lib/store/ctx.ts. Only the two
    // things that genuinely differ for an agent are overridden: a human clicking
    // a button is its own confirmation, and no budget applies to human effort.
    // runAgent replaces undo/redo/historyDepth with session-scoped versions, so
    // the agent can never reach past its own work into the user's history.
    const ctx: ActionCtx = buildCtx({ confirmed: false, budget: null })

    let outcome
    try {
      outcome = await runAgent({
        instruction,
        imagePngBase64: buildContext(doc, docStore.frame, docStore.layer).png,
        ctx,
        sessionId: `${Date.now()}-${instruction.length}`,
        apiKey: access.usingOwnKey ? access.apiKey : undefined,
        signal: controller.signal,
        currentDoc: () => useDocStore.getState().doc,
        onConfirm: (name, args) =>
          new Promise<boolean>((resolve) => set({ status: 'confirm', confirm: { name, args, resolve } })),
        onStep: (s) => {
          if (s.type === 'thinking') set({ step: s.step, ofSteps: s.of })
          if (s.type === 'action') set({ log: [...get().log, describe(s)] })
          if (s.type === 'error') {
            set({ error: s.message, needsKey: s.code === 'upstream_rate_limited' })
          }
        },
      })
    } finally {
      docStore.endAgentSession()
      controller = null
    }

    // One command for everything the session did. Applying it to the already
    // mutated document is idempotent — it sets the values that are already there —
    // so this lands exactly one entry on the undo stack.
    finaliseToHistory(outcome.command)

    if (!access.usingOwnKey) recordFreeSession()
    get().refreshAccess()

    set({
      status: get().error ? 'error' : 'done',
      summary: outcome.summary,
      changed: outcome.changed,
      stoppedBy: outcome.stoppedBy,
      counts: diffCounts(outcome.diff),
      confirm: null,
    })
  },
}))

function finaliseToHistory(command: EditorCommand | null): void {
  if (command) useDocStore.getState().commit(command)
}
