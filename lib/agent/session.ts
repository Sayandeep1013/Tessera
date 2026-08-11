/**
 * Agent session. See docs/specs/12-agent-actions.md §4.
 *
 * The mechanic that lets "watch it work" and "one Cmd-Z reverses it" coexist:
 * while a session is open, commit() APPLIES to the live document — so the canvas
 * updates and the user sees the work — but records the command instead of pushing
 * it to history. On finalise, the whole session collapses into ONE ai_edit built
 * from the aggregate diff.
 *
 * Consequences worth knowing:
 *   - reject and undo become the same gesture
 *   - intermediate churn (draw, erase, redraw) never reaches the undo stack
 *   - the existing ai_edit command type is reused unchanged
 */

import { cloneDoc } from '../artwork-core/codec'
import { applyCommand, invertCommand, type EditorCommand } from '../artwork-core/commands'
import { diff, isEmpty, type PixelDiff } from '../artwork-core/diff'
import type { Doc, PaletteEntry } from '../artwork-core/schema'
import type { ActionBudget, ActionResult } from '../actions/types'
import { MAX_SESSION_COLORS, MAX_SESSION_PIXELS } from './limits'

export type StepLog = {
  name: string
  args: unknown
  result: ActionResult
  at: number
}

export type SessionOutcome = {
  summary: string
  diff: PixelDiff
  changed: number
  steps: StepLog[]
  /** null when nothing changed — no history entry was pushed */
  command: EditorCommand | null
  stoppedBy: 'finish' | 'cap' | 'abort' | 'error' | 'no-calls'
}

export class AgentSession {
  readonly id: string
  readonly instruction: string
  readonly before: Doc
  readonly steps: StepLog[] = []

  private pixels = 0
  private colors = 0
  private closed = false

  constructor(id: string, instruction: string, doc: Doc) {
    this.id = id
    this.instruction = instruction
    // Snapshot BEFORE anything happens. cloneDoc copies every typed array, so the
    // session's baseline cannot be mutated from under it.
    this.before = cloneDoc(doc)
  }

  get isClosed(): boolean {
    return this.closed
  }

  /** Cumulative across the session, not per call. */
  readonly budget: ActionBudget = {
    pixelsLeft: () => Math.max(0, MAX_SESSION_PIXELS - this.pixels),
    colorsLeft: () => Math.max(0, MAX_SESSION_COLORS - this.colors),
    spendPixels: (n) => {
      if (this.pixels + n > MAX_SESSION_PIXELS) return false
      this.pixels += n
      return true
    },
    spendColor: () => {
      if (this.colors + 1 > MAX_SESSION_COLORS) return false
      this.colors += 1
      return true
    },
  }

  record(name: string, args: unknown, result: ActionResult): void {
    this.steps.push({ name, args, result, at: Date.now() })
  }

  // ─── session-scoped undo ───────────────────────────────────────────────────
  //
  // Found by probing the live model: given a step budget it had not used up, it
  // called undo to second-guess an edit. Nothing in the session's own work is on
  // the history stack — commits are applied without being pushed — so a plain
  // undo would have popped the USER'S last manual edit instead. The agent would
  // have silently reverted work it was never asked to touch.
  //
  // So the session keeps its own stack. While one is open the store routes undo
  // and redo here, and the agent can only ever reach its own changes.

  private readonly applied: EditorCommand[] = []
  private readonly undone: EditorCommand[] = []

  /** Called by the store for every command committed while this session is open. */
  noteApplied(cmd: EditorCommand): void {
    this.applied.push(cmd)
    this.undone.length = 0
  }

  /** What the model should see, so its view of the stack matches reality. */
  depth(): { undo: number; redo: number } {
    return { undo: this.applied.length, redo: this.undone.length }
  }

  /** The command to apply to reverse the session's most recent change. */
  takeUndo(): EditorCommand | null {
    const last = this.applied.pop()
    if (!last) return null
    this.undone.push(last)
    return invertCommand(last)
  }

  takeRedo(): EditorCommand | null {
    const last = this.undone.pop()
    if (!last) return null
    this.applied.push(last)
    return last
  }

  /**
   * Collapse everything the session did into a single command.
   *
   * `current` is the live document as it stands now — the caller owns the store,
   * so the session does not reach into it.
   */
  finalise(current: Doc, summary: string, stoppedBy: SessionOutcome['stoppedBy'], frame = 0): SessionOutcome {
    this.closed = true

    // A resize or new_document changes dimensions, which diff() cannot compare.
    // Fall back to a whole-document replacement so undo still works.
    if (current.w !== this.before.w || current.h !== this.before.h) {
      return {
        summary,
        diff: { added: [], changed: [], removed: [], paletteAdded: [] },
        changed: current.w * current.h,
        steps: this.steps,
        stoppedBy,
        command: {
          type: 'replace_doc',
          label: `AI: ${this.instruction}`,
          before: this.before,
          after: cloneDoc(current),
        },
      }
    }

    const d = diff(this.before, current, frame)
    if (isEmpty(d)) {
      return { summary, diff: d, changed: 0, steps: this.steps, command: null, stoppedBy }
    }

    const cells: Array<[number, number, number, number]> = []
    for (const [x, y, to] of d.added) cells.push([x, y, 0, to])
    for (const [x, y, from, to] of d.changed) cells.push([x, y, from, to])
    for (const [x, y, from] of d.removed) cells.push([x, y, from, 0])

    const paletteAdded: PaletteEntry[] = d.paletteAdded.map((e) => ({ ...e }))

    return {
      summary,
      diff: d,
      changed: cells.length,
      steps: this.steps,
      stoppedBy,
      command: {
        type: 'ai_edit',
        label: `AI: ${this.instruction}`,
        frame,
        cells,
        summary,
        ops: [],
        paletteAdded,
      },
    }
  }
}

/**
 * Apply a command to a document without touching history — what `ctx.commit`
 * becomes while a session is open. Exposed so the store and the tests use one
 * implementation.
 */
export function applyDuringSession(doc: Doc, cmd: EditorCommand): Doc {
  return applyCommand(doc, cmd)
}
