/**
 * Agent budgets. See docs/specs/12-agent-actions.md §6 and 19-ai-quality-eval.md §5.1.
 *
 * MAX_STEPS is a runaway guard, not an expected cost: parallel function calling is
 * confirmed on gemini-3.1-flash-lite, and a simple edit lands in 1-2 round trips.
 *
 * RAISED 6 -> 16, 24 Aug 2026. Prompt caching (lib/ai/provider/anthropic.ts) cut
 * the marginal cost of a turn by roughly 70%, so a generous guard is affordable;
 * eval scenario G2 drew a complete butterfly and still ran out at 10. Simple edits
 * finish in 5-6 whatever this says — L1 uses 5, G1 uses 6. Six was sized against a free tier that allowed five
 * requests per MINUTE, where the cap was a cost ceiling rather than a safety one.
 * Measured on claude-opus-5 (tools/eval-ai.ts): "give it a hat" and "give it a red
 * collar and make its eye green" BOTH ran out at six, so neither ever reached
 * `finish` — and a session that never calls finish has no summary, so the panel
 * showed the artwork changing and then said only "Finished." The cap was not
 * protecting anything; it was truncating the work and the explanation of it.
 */

/** Model round trips per session. */
export const MAX_STEPS = 16

/** Cumulative pixels changed across a whole session. */
export const MAX_SESSION_PIXELS = 2000

/**
 * A larger batch than this in one turn is a bug, not a plan.
 *
 * Raised 12 -> 24 with MAX_STEPS: a capable model composing a drawing from nothing
 * batches far harder than one making a small edit, and calls over the limit are
 * reported as failures to the model rather than dropped — so a low cap spends a
 * whole round trip telling it what it was not allowed to do.
 */
export const MAX_CALLS_PER_TURN = 24

/** Sessions per IP per hour — NOT model calls. */
export const SESSIONS_PER_HOUR = 20

/** Guardrails on what the client may post back to the proxy. */
export const MAX_HISTORY_BYTES = 512 * 1024
export const MAX_HISTORY_TURNS = MAX_STEPS * 3

/**
 * Characters in the agent's own finish summary.
 *
 * Not 200 (lib/ai/limits.ts MAX_SUMMARY, which governs the single-shot validator
 * and is unchanged). A capable model writes 200-400 characters here and the panel
 * has room for it; the old cap turned real explanations into the word "Finished."
 */
export const MAX_AGENT_SUMMARY = 400

/**
 * How many times a turn is retried after an upstream RATE LIMIT — and only a rate
 * limit. See lib/agent/run.ts.
 *
 * A 429 mid-session used to end the run and lose a half-finished drawing. The
 * provider tells us how long to wait; the only reason we were not waiting is that
 * nobody had written this down.
 */
export const RETRY_ON_RATE_LIMIT = 3

/** Cap on a single wait, however long the provider asks for. */
export const MAX_RETRY_WAIT_S = 45

/**
 * How many times a turn is retried after `thinking_exhausted` — the model spent
 * its ENTIRE turn budget reasoning and returned nothing to act on. Deliberately
 * smaller than `RETRY_ON_RATE_LIMIT`: a rate-limit retry is a free wait, this one
 * is a full-price 32,000-output-token attempt every time, so the budget for
 * "try again" is tighter. Measured 25 Aug 2026, `docs/UNITS.md §I.3`: "draw a
 * green frog, sitting, side view" hit this 3 times running and ALSO succeeded
 * once on the identical prompt — the failure is real but not deterministic,
 * which is the whole justification for retrying it at all rather than only
 * reporting it.
 */
export const RETRY_ON_THINKING_EXHAUSTED = 1

/**
 * New palette entries per session.
 *
 * RAISED 4 -> 12, 24 Aug 2026. Four was a guard against runaway palette growth
 * chosen before anything could draw well enough to need colours. Measured: asked
 * for a tree on 32x32, claude-opus-5 produced a good one and then said so in its
 * own summary — "the palette allowance capped me at four colours, so the sky is
 * left transparent and the canopy and grass share one three-tone ramp". A limit
 * the artist has to apologise for in the caption is the wrong limit. The format
 * allows 36 entries; twelve leaves plenty of headroom and still bounds a runaway.
 */
export const MAX_SESSION_COLORS = 12
