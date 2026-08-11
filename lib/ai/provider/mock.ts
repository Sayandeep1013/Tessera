/**
 * Mock provider — every automated test uses this. See docs/specs/06a-provider.md §6.
 * No network, no key, deterministic.
 */

import type { AiProvider, EditRequest, EditResult } from './types'

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
  }
}
