/**
 * Agent budgets. See docs/specs/12-agent-actions.md §6.
 *
 * MAX_STEPS is a runaway guard, not an expected cost: parallel function calling is
 * confirmed on gemini-3.1-flash-lite, and a simple edit lands in 1-2 round trips.
 */

/** Model round trips per session. */
export const MAX_STEPS = 6

/** Cumulative pixels changed across a whole session. */
export const MAX_SESSION_PIXELS = 2000

/** New palette entries per session. */
export const MAX_SESSION_COLORS = 4

/** A larger batch than this in one turn is a bug, not a plan. */
export const MAX_CALLS_PER_TURN = 12

/** Sessions per IP per hour — NOT model calls. */
export const SESSIONS_PER_HOUR = 20

/** Guardrails on what the client may post back to the proxy. */
export const MAX_HISTORY_BYTES = 512 * 1024
export const MAX_HISTORY_TURNS = MAX_STEPS * 3
