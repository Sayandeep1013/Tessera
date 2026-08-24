import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgent, type AgentStep } from '../run'
import { MAX_CALLS_PER_TURN, MAX_RETRY_WAIT_S, MAX_STEPS, RETRY_ON_RATE_LIMIT } from '../limits'
import { createMockProvider } from '../../ai/provider/mock'
import { loadStarter } from '../../artwork-core/create'
import { clampLayer } from '../../artwork-core/layers'
import { applyCommand } from '../../artwork-core/commands'
import type { ActionCtx, EditorSnapshot } from '../../actions/types'
import type { Doc } from '../../artwork-core/schema'

/**
 * The route is a pure pass-through to provider.converse(), so stubbing fetch with
 * the mock provider exercises the real runner against the real declaration set
 * without a network or a key.
 */
function stubFetch(overrides?: { status?: number; body?: unknown }) {
  const provider = createMockProvider()
  return vi.fn(async (_url: string, init: RequestInit) => {
    if (overrides) {
      return {
        ok: (overrides.status ?? 500) < 400,
        status: overrides.status ?? 500,
        json: async () => overrides.body ?? {},
      } as Response
    }
    const { history } = JSON.parse(String(init.body)) as { history: never }
    const res = await provider.converse!({
      systemPrompt: 'x',
      history,
      tools: [],
      maxOutputTokens: 100,
    })
    if (!res.ok) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ code: 'upstream_rate_limited', message: 'busy', retryAfter: 20 }),
      } as Response
    }
    return { ok: true, status: 200, json: async () => ({ parts: res.parts }) } as Response
  })
}

function harness() {
  let doc: Doc = loadStarter('face')
  let layer = 0
  const editor: EditorSnapshot = {
    tool: 'brush',
    colorIndex: 1,
    brushSize: 1,
    brushShape: 'square',
    viewport: { scale: 16, offsetX: 0, offsetY: 0 },
    showGrid: true,
  }

  const ctx: ActionCtx = {
    doc: () => doc,
    frame: () => 0,
    layer: () => layer,
    newId: () => 'forked-id',
    setLayer: (i) => {
      layer = clampLayer(doc, 0, i)
    },
    commit: (cmd) => {
      doc = applyCommand(doc, cmd)
    },
    editor: {
      setTool: (t) => (editor.tool = t),
      setColorIndex: (i) => (editor.colorIndex = i),
      setBrushSize: (n) => (editor.brushSize = n),
      setBrushShape: (s) => (editor.brushShape = s),
      setViewport: (vp) => (editor.viewport = vp),
      toggleGrid: (on) => (editor.showGrid = on ?? !editor.showGrid),
      state: () => ({ ...editor }),
    },
    undo: () => {},
    redo: () => {},
    historyDepth: () => ({ undo: 0, redo: 0 }),
    confirmed: false,
    budget: null,
  }

  const steps: AgentStep[] = []
  const run = (instruction: string, extra: Partial<Parameters<typeof runAgent>[0]> = {}) =>
    runAgent({
      instruction,
      imagePngBase64: '',
      ctx,
      sessionId: 's1',
      currentDoc: () => doc,
      onStep: (s) => steps.push(s),
      // No real sleeping in tests. The retry path is exercised, the wall clock
      // is not — see RunOptions.sleepFn.
      sleepFn: async () => true,
      ...extra,
    })

  return { run, steps, ctx, editor, getDoc: () => doc }
}

const actions = (steps: AgentStep[]) =>
  steps.filter((s): s is Extract<AgentStep, { type: 'action' }> => s.type === 'action')

beforeEach(() => {
  vi.stubGlobal('fetch', stubFetch())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the loop', () => {
  it('executes every call in a parallel turn, in order', async () => {
    const h = harness()
    const out = await h.run('__agent_parallel')

    const names = actions(h.steps).map((s) => s.name)
    expect(names.slice(0, 3)).toEqual(['get_state', 'select_tool', 'set_color'])
    expect(names).toContain('draw_line')
    expect(out.stoppedBy).toBe('finish')
  })

  it('stops on finish and carries the model’s summary out', async () => {
    const h = harness()
    const out = await h.run('__agent_parallel')
    expect(out.summary).toBe('Angled the eyebrows down into a frown.')
  })

  it('collapses the whole session into one command', async () => {
    const h = harness()
    const out = await h.run('__agent_parallel')
    expect(out.command).not.toBeNull()
    expect(out.command!.type).toBe('ai_edit')
    expect(out.changed).toBeGreaterThan(0)
  })

  it('view actions really do move the editor', async () => {
    const h = harness()
    await h.run('__agent_parallel')
    expect(h.editor.tool).toBe('brush')
    expect(h.editor.colorIndex).toBe(1)
  })

  it('treats a prose-only reply as a finished turn, not an error', async () => {
    const h = harness()
    const out = await h.run('__agent_prose')
    expect(out.stoppedBy).toBe('no-calls')
    expect(out.summary).toContain('already looks')
    expect(out.command).toBeNull()
  })

  it('stops at the step cap when the model never finishes', async () => {
    const h = harness()
    const out = await h.run('__agent_runaway')
    expect(out.stoppedBy).toBe('cap')
    const thinking = h.steps.filter((s) => s.type === 'thinking')
    expect(thinking).toHaveLength(MAX_STEPS)
  })
})

describe('failures are fed back, not thrown', () => {
  it('an unknown action name becomes a readable error and the loop continues', async () => {
    const h = harness()
    const out = await h.run('__agent_badname')

    const first = actions(h.steps)[0]!
    expect(first.result.ok).toBe(false)
    expect((first.result as { error: string }).error).toContain('no action called')
    expect(out.stoppedBy).toBe('finish')
  })

  it('malformed arguments become a readable error', async () => {
    const h = harness()
    await h.run('__agent_badargs')
    const first = actions(h.steps)[0]!
    expect(first.result.ok).toBe(false)
    expect((first.result as { error: string }).error).toContain('invalid arguments')
  })

  it('out-of-bounds coordinates are rejected without touching the document', async () => {
    const h = harness()
    const before = Array.from(h.getDoc().frames[0]!.layers[0]!.px)
    const out = await h.run('__agent_oob')

    expect(actions(h.steps)[0]!.result.ok).toBe(false)
    expect(Array.from(h.getDoc().frames[0]!.layers[0]!.px)).toEqual(before)
    expect(out.command).toBeNull()
  })

  it('an upstream error ends the session with the work so far intact', async () => {
    const h = harness()
    const out = await h.run('__agent_ratelimit')
    expect(out.stoppedBy).toBe('error')
    expect(h.steps.some((s) => s.type === 'error')).toBe(true)
  })
})

/**
 * A single upstream 429 used to end the session outright and lose a half-finished
 * drawing the model was minutes into. Measured 24 Aug 2026 (docs/specs/19).
 */
describe('a rate limit is waited out, not fatal', () => {
  it('retries the turn RETRY_ON_RATE_LIMIT times before giving up', async () => {
    const h = harness()
    await h.run('__agent_ratelimit')
    const waits = h.steps.filter((s) => s.type === 'waiting')
    expect(waits).toHaveLength(RETRY_ON_RATE_LIMIT)
  })

  it('tells the user it is waiting rather than going silent', async () => {
    const h = harness()
    await h.run('__agent_ratelimit')
    const first = h.steps.find((s) => s.type === 'waiting') as Extract<
      AgentStep,
      { type: 'waiting' }
    >
    expect(first.seconds).toBeGreaterThan(0)
    expect(first.seconds).toBeLessThanOrEqual(MAX_RETRY_WAIT_S)
    expect(first.attempt).toBe(1)
    expect(first.of).toBe(RETRY_ON_RATE_LIMIT)
  })

  it('does NOT retry a refusal or a bad key — asking again cannot change those', async () => {
    const h = harness()
    await h.run('__agent_prose')
    expect(h.steps.filter((s) => s.type === 'waiting')).toHaveLength(0)
  })

  it('stops waiting when the user aborts', async () => {
    const h = harness()
    const controller = new AbortController()
    const out = await h.run('__agent_ratelimit', {
      signal: controller.signal,
      sleepFn: async () => {
        controller.abort()
        return false
      },
    })
    expect(h.steps.filter((s) => s.type === 'waiting')).toHaveLength(1)
    expect(out.stoppedBy).toBe('error')
  })
})

/**
 * Measured 24 Aug 2026: two live requests were killed by the DEFAULT FETCH
 * DISPATCHER'S 5-minute headersTimeout mid-generation and surfaced as
 * `unavailable` — a transport failure, not a verdict on the request. Fixed at the
 * source in anthropic.ts (a dispatcher with a real timeout); this is the
 * defense-in-depth half, for whatever transient transport failure gets through.
 */
describe('a transient transport failure is retried too', () => {
  function stubUnavailableThenOk(failures: number) {
    const provider = createMockProvider()
    let calls = 0
    return vi.fn(async (_url: string, init: RequestInit) => {
      calls++
      if (calls <= failures) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ code: 'unavailable', message: 'the model is unavailable' }),
        } as Response
      }
      const { history } = JSON.parse(String(init.body)) as { history: never }
      const res = await provider.converse!({ systemPrompt: 'x', history, tools: [], maxOutputTokens: 100 })
      if (!res.ok) throw new Error('unexpected: mock provider itself failed')
      return { ok: true, status: 200, json: async () => ({ parts: res.parts }) } as Response
    })
  }

  it('recovers from a transport failure that clears within the retry budget', async () => {
    vi.stubGlobal('fetch', stubUnavailableThenOk(1))
    const h = harness()
    const out = await h.run('__agent_prose')
    expect(out.stoppedBy).not.toBe('error')
    expect(h.steps.filter((s) => s.type === 'waiting')).toHaveLength(1)
  })

  it('still gives up once RETRY_ON_RATE_LIMIT is exhausted', async () => {
    vi.stubGlobal('fetch', stubUnavailableThenOk(RETRY_ON_RATE_LIMIT + 5))
    const h = harness()
    const out = await h.run('__agent_prose')
    expect(out.stoppedBy).toBe('error')
    expect(h.steps.filter((s) => s.type === 'waiting')).toHaveLength(RETRY_ON_RATE_LIMIT)
  })

  it('does NOT retry a refusal or a bad key — those are not transient', async () => {
    // Neither becomes true by asking again, and retrying would spend the user's
    // quota to arrive at the same rejection more slowly.
    for (const code of ['refused', 'bad_key']) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 422,
          json: async () => ({ code, message: 'no' }),
        })) as unknown as typeof fetch,
      )
      const h = harness()
      const out = await h.run('__agent_prose', {
        sleepFn: async () => {
          throw new Error(`must not sleep for a non-retryable failure (${code})`)
        },
      })
      expect(out.stoppedBy).toBe('error')
      expect(h.steps.filter((s) => s.type === 'waiting')).toHaveLength(0)
    }
  })
})

describe('over-limit calls are reported, not silently dropped', () => {
  it('runs the first MAX_CALLS_PER_TURN and tells the model about the rest', async () => {
    const h = harness()
    await h.run('__agent_flood')

    const ran = actions(h.steps).filter((s) => s.name === 'set_pixels')
    expect(ran).toHaveLength(MAX_CALLS_PER_TURN)
    // the remainder never reach runAction, so they are not recorded as steps —
    // they go back to the model as functionResponses instead
  })
})

describe('destructive actions need a human', () => {
  it('runs when confirmed', async () => {
    const h = harness()
    const out = await h.run('__agent_destructive', { onConfirm: async () => true })

    expect(h.steps.some((s) => s.type === 'needs-confirm')).toBe(true)
    expect(actions(h.steps)[0]!.result.ok).toBe(true)
    expect(out.command!.type).toBe('replace_doc')
  })

  it('is declined by default when no handler is supplied', async () => {
    const h = harness()
    const out = await h.run('__agent_destructive')

    const first = actions(h.steps)[0]!
    expect(first.result.ok).toBe(false)
    expect((first.result as { error: string }).error).toContain('declined')
    expect(out.command).toBeNull()
  })

  it('a decline is a normal outcome — the session still finishes', async () => {
    const h = harness()
    const out = await h.run('__agent_destructive', { onConfirm: async () => false })
    expect(out.stoppedBy).toBe('finish')
  })
})

/**
 * Found by probing the live model, not by reading the code: given spare steps it
 * called undo to second-guess an edit. The session's own commits are never pushed
 * to history, so an unscoped undo would have popped the USER'S last manual edit.
 */
describe('undo is scoped to the session', () => {
  it('reverses the agent’s own change and nothing else', async () => {
    const h = harness()
    const before = Array.from(h.getDoc().frames[0]!.layers[0]!.px)

    const out = await h.run('__agent_undo')
    const undoStep = actions(h.steps).find((s) => s.name === 'undo')!
    expect(undoStep.result.ok).toBe(true)

    // drew a line, then took it back — the net effect is nothing
    expect(Array.from(h.getDoc().frames[0]!.layers[0]!.px)).toEqual(before)
    expect(out.changed).toBe(0)
    expect(out.command).toBeNull()
  })

  it('cannot reach past the session into the user’s history', async () => {
    const h = harness()
    // the store reports real user history, which the agent must not be able to touch
    h.ctx.historyDepth = () => ({ undo: 5, redo: 0 })
    const userUndo = vi.fn()
    h.ctx.undo = userUndo

    await h.run('__agent_undo_empty')

    const undoStep = actions(h.steps).find((s) => s.name === 'undo')!
    expect(undoStep.result.ok).toBe(false)
    expect((undoStep.result as { error: string }).error).toContain('nothing to undo')
    expect(userUndo).not.toHaveBeenCalled()
  })
})

describe('stopping', () => {
  it('an already-aborted signal ends before any call is made', async () => {
    const h = harness()
    const ac = new AbortController()
    ac.abort()

    const out = await h.run('__agent_parallel', { signal: ac.signal })
    expect(out.stoppedBy).toBe('abort')
    expect(actions(h.steps)).toHaveLength(0)
  })
})

describe('bring your own key', () => {
  it('sends the key as a header when one is supplied, and omits it otherwise', async () => {
    const spy = stubFetch()
    vi.stubGlobal('fetch', spy)

    const h = harness()
    await h.run('__agent_prose', { apiKey: 'user-key-123' })
    const withKey = (spy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(withKey['x-api-key']).toBe('user-key-123')

    spy.mockClear()
    await harness().run('__agent_prose')
    const without = (spy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(without['x-api-key']).toBeUndefined()
  })
})

/**
 * G2 drew a complete butterfly, used every step, and reported "122 pixels
 * changed · Finished." outcome.ts only names the cap when nothing changed, so a
 * truncated session that DID draw described itself as a finished one.
 */
describe('a session cut off by the step limit says so', () => {
  it('does not call a truncated session "Finished."', async () => {
    const h = harness()
    const out = await h.run('__agent_runaway keep going forever')
    expect(out.stoppedBy).toBe('cap')
    expect(out.summary).not.toBe('Finished.')
    expect(out.summary).toMatch(/ran out of steps/i)
  })
})
