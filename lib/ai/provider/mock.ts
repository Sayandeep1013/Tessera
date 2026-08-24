/**
 * Mock provider — every automated test uses this. See docs/specs/06a-provider.md §6.
 * No network, no key, deterministic.
 */

import { MAX_CALLS_PER_TURN } from '../../agent/limits'
import type {
  AiProvider,
  ConversePart,
  ConverseRequest,
  ConverseResult,
  EditRequest,
  EditResult,
} from './types'

const CANNED: Record<string, () => EditResult> = {
  __ok: () => ({
    ok: true,
    model: 'mock',
    latencyMs: 1,
    raw: {
      summary: 'Angled the eyebrows down into a frown.',
      operations: [
        { op: 'draw_line', x1: 4, y1: 5, x2: 6, y2: 6, i: 1 },
        { op: 'draw_line', x1: 11, y1: 5, x2: 9, y2: 6, i: 1 },
      ],
    },
  }),
  __refuse: () => ({ ok: false, kind: 'refused', message: 'the model declined this request' }),
  __ratelimit: () => ({
    ok: false,
    kind: 'rate_limited',
    message: 'the model is rate limited right now',
    retryAfterMs: 60_000,
  }),
  __unavailable: () => ({ ok: false, kind: 'unavailable', message: 'could not reach the model' }),
  __config: () => ({ ok: false, kind: 'config', message: 'the API key is not set' }),
  __malformed: () => ({ ok: true, model: 'mock', latencyMs: 1, raw: { nonsense: true } }),
  __oob: () => ({
    ok: true,
    model: 'mock',
    latencyMs: 1,
    raw: {
      summary: 'Drew outside the canvas.',
      operations: [{ op: 'set_pixels', px: [[999, 999, 1]] }],
    },
  }),
  __budget: () => ({
    ok: true,
    model: 'mock',
    latencyMs: 1,
    raw: {
      summary: 'Touched far too many pixels.',
      operations: [
        { op: 'set_pixels', px: Array.from({ length: 401 }, (_, n) => [n % 16, (n / 16) | 0, 1]) },
      ],
    },
  }),
  __empty: () => ({
    ok: true,
    model: 'mock',
    latencyMs: 1,
    raw: {
      summary: 'Did nothing at all.',
      operations: [{ op: 'replace_color', from: 9, to: 9 }],
    },
  }),
}

// ─── scripted agent turns ────────────────────────────────────────────────────

const call = (name: string, args: Record<string, unknown> = {}): ConversePart => ({
  functionCall: { name, args },
})

/**
 * Each script is indexed by how many turns the model has already taken, so a
 * single token drives a whole multi-step session deterministically. Running off
 * the end of a script means the model said nothing — which the runner reads as a
 * finished turn.
 */
const SCRIPTS: Record<string, ConversePart[][]> = {
  // the shape we verified against the real model: independent calls batched
  __agent_parallel: [
    [call('get_state'), call('select_tool', { tool: 'brush' }), call('set_color', { index: 1 })],
    [call('draw_line', { x1: 4, y1: 5, x2: 6, y2: 6, i: 1 })],
    [call('finish', { summary: 'Angled the eyebrows down into a frown.' })],
  ],
  __agent_destructive: [
    [call('new_document', { width: 8, height: 8 })],
    [call('finish', { summary: 'Started a new 8x8 canvas.' })],
  ],
  // answers in prose without calling anything — a legitimate way to stop
  __agent_prose: [[{ text: 'That artwork already looks the way you described.' }]],
  // never calls finish — proves the step cap ends the session
  __agent_runaway: Array.from({ length: 20 }, () => [call('get_state')]),
  __agent_badname: [
    [call('summon_dragon', { size: 'large' })],
    [call('finish', { summary: 'Could not do that.' })],
  ],
  __agent_badargs: [
    [call('draw_line', { x1: 'left', y1: 1, x2: 6, y2: 1, i: 1 })],
    [call('finish', { summary: 'Could not do that.' })],
  ],
  __agent_oob: [
    [call('set_pixels', { px: [[999, 999, 1]] })],
    [call('finish', { summary: 'Tried to draw off the canvas.' })],
  ],
  // More calls in one turn than MAX_CALLS_PER_TURN allows. DERIVED from the
  // constant, not a literal: it was 20 against a cap of 12, and raising the cap to
  // 24 in unit I turned the flood fixture into a non-flood — the test failed
  // loudly, which is the good case, but the next change might not.
  __agent_flood: [
    Array.from({ length: MAX_CALLS_PER_TURN + 5 }, (_, n) =>
      call('set_pixels', { px: [[n % 16, 0, 1]] }),
    ),
    [call('finish', { summary: 'Drew a lot at once.' })],
  ],
  // draws, then thinks better of it — the shape the live model actually produced
  __agent_undo: [
    [call('draw_line', { x1: 2, y1: 2, x2: 10, y2: 2, i: 1 })],
    [call('undo')],
    [call('finish', { summary: 'Drew a line and took it back.' })],
  ],
  // tries to undo before doing anything — must not reach the user's own history
  __agent_undo_empty: [
    [call('undo')],
    [call('finish', { summary: 'Nothing to undo.' })],
  ],
  __agent_ratelimit: [],
}

/** Longest first, so __agent_undo_empty is not swallowed by __agent_undo. */
const TOKENS = Object.keys(SCRIPTS).sort((a, b) => b.length - a.length)

function scriptFor(history: ConverseRequest['history']): { token: string; turn: number } {
  const first = history[0]?.parts.map((p) => ('text' in p ? p.text : '')).join(' ') ?? ''
  const token = TOKENS.find((t) => first.includes(t)) ?? '__agent_default'
  return { token, turn: history.filter((h) => h.role === 'model').length }
}

export function createMockProvider(): AiProvider {
  return {
    id: 'mock',
    schemaFlavour: 'strict',
    model: async () => 'mock',
    generate: async (req: EditRequest): Promise<EditResult> => {
      for (const [token, make] of Object.entries(CANNED)) {
        if (req.userText.includes(token)) return make()
      }
      return CANNED.__ok!()
    },
    converse: async (req: ConverseRequest): Promise<ConverseResult> => {
      const { token, turn } = scriptFor(req.history)

      if (token === '__agent_ratelimit') {
        return {
          ok: false,
          kind: 'rate_limited',
          message: 'the model is rate limited right now',
          retryAfterMs: 20_000,
        }
      }

      const script = SCRIPTS[token] ?? [
        [call('set_pixels', { px: [[4, 5, 1]] })],
        [call('finish', { summary: 'Darkened one pixel.' })],
      ]

      return {
        ok: true,
        parts: script[turn] ?? [],
        model: 'mock',
        latencyMs: 1,
      }
    },
  }
}
