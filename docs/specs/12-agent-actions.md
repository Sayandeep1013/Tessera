# 12 — Agent Actions

**Owns:** `lib/actions/**`, `lib/agent/**`, `app/api/ai/agent/route.ts`, `components/AgentPanel.tsx`
**Depends on:** [03 — artwork-core](./03-artwork-core.md), [05 — Editor](./05-editor.md), [06 — AI Protocol](./06-ai-protocol.md), [06a — Provider](./06a-provider.md)

Gives the AI reach over the whole application: read any state, change any setting,
run any editing operation — by calling the *same functions the UI calls*.

---

## 0. What "done" means here

**This unit is judged on whether the tool loop works, not on whether the artwork
is good.**

| In scope — must pass | Out of scope — explicitly not a gate |
|---|---|
| The model can call an action and it executes | Whether the resulting art is attractive |
| Arguments are validated and errors are recoverable | Whether it interpreted "angrier" the way a human would |
| Multiple actions execute in one turn, in order | Whether the edit is one a person would keep |
| Live canvas updates as it works | |
| The whole session collapses to one undo | |
| Budgets, cancel and confirmation hold | |

Aesthetic quality remains [Phase 6](../PHASE-0-FINDINGS.md) and is tracked separately.
A session that changes the document exactly as instructed but produces ugly art is a
**pass** for this spec. Do not conflate the two — the previous 0/9 was a *model*
result, and this is *plumbing*.

---

## 1. Where the loop runs, and why

**Client-side**, with model calls proxied through our route.

The decisive fact is *location*, not security: tool selection, colour, brush, zoom,
cursor and viewport all live in Zustand in the browser. A server-side loop would have
to mirror that state and stream mutations back — machinery that buys nothing, since
the only real secret is the API key and that stays behind the route either way.

```
 browser                                    server              provider
 ───────                                    ──────              ────────
 lib/agent/run.ts
   build turn (PNG + grid + instruction)
   POST /api/ai/agent  { history } ───────► inject system prompt
                                            + declarations ────► generateContent
                                          ◄─ model turn ◄───────
   execute functionCalls locally
   append results, repeat ──────────────►
```

**The client never sends declarations or the system prompt.** The server derives both
from the registry and prepends them. The client owns only the conversation history.
This is for prompt integrity and quota, not for protecting the user's own document
from the user.

---

## 2. The registry

```ts
// lib/actions/types.ts
export type ActionKind = 'query' | 'view' | 'mutate' | 'destructive'

export type ActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

export type ActionCtx = {
  doc: () => Doc
  frame: () => number
  /** The layer edits land on. Added by 14 — Layers; see that spec for the rules. */
  layer: () => number
  setLayer: (i: number) => void
  /** During a session this is intercepted — see §4. */
  commit: (cmd: EditorCommand) => void
  editor: {
    setTool: (t: Tool) => void
    setColorIndex: (i: number) => void
    setBrushSize: (n: number) => void
    setBrushShape: (s: BrushShape) => void
    setViewport: (vp: Viewport) => void
    toggleGrid: () => void
    state: () => EditorSnapshot
  }
  /** Present only when a confirmation has been granted for this call. */
  confirmed: boolean
}

export type Action<I = unknown> = {
  name: string
  description: string
  input: z.ZodType<I>
  kind: ActionKind
  run: (input: I, ctx: ActionCtx) => ActionResult
}
```

`description` **is** the prompt. There is no separate paragraph enumerating
capabilities — that would go stale the first time an action changed. Write each
description as guidance to the model, including when *not* to use it:

```ts
description:
  'Set the active paint colour to a palette index. Indices come from get_state. ' +
  'Use add_palette_color first if the colour you need is not in the palette.'
```

### Registration

```ts
// lib/actions/registry.ts
export const ACTIONS: ReadonlyMap<string, Action<never>>
export function toDeclarations(): FunctionDeclaration[]   // generated, never hand-written
export function runAction(name: string, args: unknown, ctx: ActionCtx): ActionResult
```

`runAction` zod-parses `args` against the action's schema and returns a *typed error*
rather than throwing — an invalid call is a message back to the model, not a crash.

---

## 3. The catalogue

Names are the wire contract. Do not rename without regenerating declarations.

### query — free to call, never mutates

| Action | Input | Returns |
|---|---|---|
| `get_state` | — | `{ w, h, frame, frames, layers[], activeLayer, palette[], tool, colorIndex, brushSize, brushShape, zoom, undoDepth, redoDepth }` |
| `get_grid` | — | The ACTIVE LAYER's text grid + legend, byte-identical to [06 §3.2](./06-ai-protocol.md). On a frame with more than one layer, plus a flattened `composite` |
| `get_region` | `{ x, y, w, h }` | The same encoding for a sub-rectangle |

**One fat `get_state` beats four thin queries.** At 5 requests/minute, every avoided
round trip is 12 seconds.

### view — changes UI state, applies immediately, not undoable

`select_tool` · `set_color` · `set_brush` · `set_zoom` · `fit_view` · `toggle_grid` ·
`select_layer`

`select_layer` is here rather than in `mutate` for the same reason `select_tool` is: it
changes what the NEXT edit will affect, not the document. See [14 §7.1](./14-layers.md).

These are *not* recorded in the session (§4). They are how the user watches the agent
work, and reverting them on undo would be surprising — undo restores artwork, not
which tool happened to be selected.

### mutate — changes the document, routed through `commit()`

`set_pixels` · `draw_line` · `draw_rect` · `flood_fill` · `replace_color` ·
`add_palette_color` · `edit_palette_color` · `add_layer` · `set_layer_visible` ·
`undo` · `redo`

`set_layer_visible` is a mutation, not a view: `hidden` is serialized, so it *is* the
document.

The five drawing operations reuse `applyOps` from
[03 §4](./03-artwork-core.md) — the agent and the user's own tools share one
implementation, so a model-drawn line covers the same cells as a hand-drawn one.

### destructive — always confirmed, regardless of any other setting

`new_document` · `resize` · `clear_layer` · `delete_layer`

`clear_layer` clears the ACTIVE layer, not the whole frame.

A destructive action whose `ctx.confirmed` is false returns
`{ ok: false, error: 'requires user confirmation' }` **without mutating anything**.
The runner surfaces a modal; on approval it re-runs the same call with
`confirmed: true`. The model sees a normal error and can proceed or ask.

### terminal

| Action | Input | Effect |
|---|---|---|
| `finish` | `{ summary: string }` | Ends the loop cleanly and finalises the session |

Explicit termination beats inferring "it stopped calling tools" from a text reply.

---

## 4. Sessions — how "watch it work, one ⌘Z" is implemented

The mechanic that makes live updates and a single undo entry coexist.

```ts
// lib/agent/session.ts
type AgentSession = {
  id: string
  instruction: string
  before: Doc                 // snapshot at start
  log: Array<{ name: string; args: unknown; result: ActionResult; at: number }>
  pixelsTouched: number
  colorsAdded: number
}
```

**While a session is open, `ctx.commit` is intercepted.** It applies the command to
the live document — so the canvas updates and the user sees the work — but records it
in `session.log` instead of pushing to the history stack.

On `finish` (or Stop, or cap):

1. `diff(session.before, currentDoc, frame)`
2. If the diff is empty → push nothing; report "no change made"
3. Otherwise build **one** `ai_edit` command from the aggregate before/after cells plus
   any added palette entries, and push that
4. Show a completion bar: the summary, the diff counts, and an **Undo** button that
   simply calls `undo()`

Consequences worth stating:

- **Reject and undo are the same gesture.** There is no separate rejection path to
  maintain, and no scratch document to keep in sync.
- The agent's intermediate steps never pollute the undo stack, even if it drew and
  erased the same pixels four times.
- The existing `ai_edit` command type ([03 §5](./03-artwork-core.md)) is reused
  unchanged.

**Only one session may be open at a time.** Starting a new one while a session is
open cancels the first and finalises it.

---

## 5. The loop

```ts
// lib/agent/run.ts
export async function runAgent(opts: {
  instruction: string
  signal?: AbortSignal
  onStep?: (step: AgentStep) => void
}): Promise<AgentOutcome>
```

```
open session, snapshot document
build turn 0:  ruled PNG + text grid + legend + instruction
loop, max MAX_STEPS:
  POST /api/ai/agent { history }
  if response has no functionCalls  -> finalise (model gave up or answered in text)
  for each call, in the order returned:
      if name === 'finish'          -> finalise with its summary
      result = runAction(...)
      onStep(...)                    -> UI log line
  append the model turn + a functionResponse turn carrying every result
finalise
```

### Parallel calls are load-bearing

Gemini may return several `functionCall` parts in one response. **Execute them all, in
order, and return all results in a single `functionResponse` turn.** Splitting them
across turns silently trains the model to stop batching — and at 5 requests/minute
batching is the difference between a 40-second edit and a 90-second one.

> ✅ **Verified on `gemini-3.1-flash-lite`, 11 Aug 2026** (`tools/probe-tools.ts`).
>
> - **3 function calls in a single response**, both when told to batch and — more
>   importantly — with natural phrasing that never mentioned batching:
>   *"Draw a black diagonal across the canvas"* returned
>   `set_color` + `draw_line` + `finish` in **one turn**.
> - The `functionResponse` round trip works: feeding results back produced a correct
>   continuation rather than a repeat.
> - The model reaches for `finish` unprompted, so explicit termination is reliable.
>
> This is better than the budget assumed. A simple edit can be **1–2 round trips**, not
> four. `MAX_STEPS = 6` is generous rather than tight, and should be treated as a
> runaway guard rather than an expected cost.

The runner must still handle a response carrying a **single** call correctly — the
model batches when the steps are independent, and does not when it needs a result
before deciding (test 3: `get_state` alone, then `finish` after seeing the answer).
That sequencing judgement is desirable; do not try to force batching.

A realistic trace:

```
turn 1  get_state + get_grid                       (2 calls, 1 round trip)
turn 2  set_color, draw_line, draw_line, set_pixels (4 calls, 1 round trip)
turn 3  get_grid                                    (verify)
turn 4  finish
```

Four round trips ≈ 50s at free-tier pacing.

### Verification is text-only

After mutations the model re-reads `get_grid`, not a fresh image. Function responses
do not carry images cleanly, and re-uploading a PNG each turn costs ~350 tokens.

**Known limitation, accepted for this unit:** a text grid may be insufficient for the
model to judge *appearance*. Since aesthetic quality is explicitly out of scope here
(§0), this is not a blocker. If it matters later, the lever is to re-attach a rendered
PNG as a user turn every N steps — that is a change to `run.ts` only.

---

## 6. Budgets

`lib/agent/limits.ts`:

| Constant | Value | Rationale |
|---|---|---|
| `MAX_STEPS` | 6 | ~70s at 5 rpm; surfaced as `step 2 of 6` |
| `MAX_SESSION_PIXELS` | 2000 | Cumulative across the session, not per call |
| `MAX_SESSION_COLORS` | 4 | New palette entries per session |
| `MAX_CALLS_PER_TURN` | 12 | A runaway batch is a bug, not a plan |
| `SESSIONS_PER_HOUR` | 20 | **Counts sessions, not model calls** |

The last row matters: counting model calls would let a single 6-step session consume
a third of the hourly budget.

Behaviour on exceeding each, stated so it is not left to the implementer:

| Budget | On exceed |
|---|---|
| `MAX_STEPS` | Finalise the session; report `stopped after N steps`. No further calls. |
| `MAX_SESSION_PIXELS` | The offending action returns `ok:false` with the remaining allowance. Queries and view actions still work, so the model can wrap up. |
| `MAX_SESSION_COLORS` | Same — `add_palette_color` fails, everything else continues. |
| `MAX_CALLS_PER_TURN` | Execute the first 12 in order; the rest return `ok:false` with `too many calls in one turn`. Do not silently drop them — the model must see what did not run. |
| `SESSIONS_PER_HOUR` | 429 before the session opens. Nothing is snapshotted. |

---

## 7. The route

`app/api/ai/agent/route.ts` — Node runtime.

**Request** `{ sessionId: string; history: Turn[] }` — the conversation so far,
client-owned. `sessionId` is a client-generated nanoid, constant for the life of one
session, and is what the rate limiter keys on.

**Server responsibilities**

1. Rate limit by IP; a session is counted on its **first** call only (the client sends
   `sessionId`, and the limiter keys on it).
2. Reject `history` over 512KB, or more than `MAX_STEPS * 3` turns.
3. Prepend the system prompt and `toDeclarations()` — **never** taken from the client.
4. Call the provider with `tools: [{ functionDeclarations }]`.
5. Return the raw model turn (parts array) and usage. No interpretation.

**Never returned:** the API key, the system prompt text, or provider stack traces.

---

## 8. UI

`components/AgentPanel.tsx` replaces the composer while a session runs.

```
┌────────────────────────────────────────┐
│ step 3 of 6                    [ Stop ]│
│                                        │
│  ✓ get_state                           │
│  ✓ set_color   index 3                 │
│  ▸ draw_line   (4,5) → (6,6)           │
└────────────────────────────────────────┘
```

- One line per action: name, the arguments that matter, and a state glyph
  (`✓` done · `▸` running · `✕` failed, with the error inline).
- `view` actions are logged but visually dimmed — they are not the work.
- **Stop** aborts and finalises with whatever landed.
- On completion the panel becomes the summary + diff counts + **Undo**.
- Destructive confirmations raise a modal — the only modal in the app.
- `aria-live="polite"` announces each step.

The canvas updates live throughout; **painting is blocked while a session is open**
(same guard as the existing proposal review) so a user stroke cannot interleave with
agent edits.

---

## 9. Free tries and bring-your-own-key

The deployed app shares **one** free-tier project across every visitor, and the
binding limit is 5 requests per minute for the whole project. Without a gate, three
people trying it at once all get rate-limit errors and conclude it is broken.

**Two free sessions per browser, then bring your own key.**

Measured, 11 Aug 2026, `gemini-3.1-flash-lite`, "make the eyebrows angry" on the
16×16 face: **5 model turns, 7.6s end to end** — `get_state`, `get_grid`,
`set_color`, `set_pixels`, `finish`. So one session is roughly one *minute* of the
project's 5-requests-per-minute budget, and two free sessions is about ten requests.
That is the real reason the free allowance is this small: it is not stinginess, it
is that a single visitor's session already saturates the shared per-minute limit.

Two, not more, is deliberate: the free tries exist to demonstrate that the mechanism
works, not to be a usable allowance. Edit *quality* is luck (see
[PHASE-0-FINDINGS](../PHASE-0-FINDINGS.md)); anyone who wants to actually use it
brings a key. Fewer free sessions also means collisions against the shared 5/min are
rare rather than routine.

### The counter is a courtesy, not a lock

Stored in `localStorage` under `tessera-free-sessions`. Clearing storage or opening a
private window resets it. **This is intended and must not be hardened** — anything
stronger means fingerprinting or accounts, and there are no accounts. The barrier
exists to set an expectation at the door, not to enforce one.

### Key handling

The key lives in `localStorage` under `tessera-api-key` and is sent as an
`x-api-key` header on each agent request. The route uses it for that request and
discards it.

**The key is never logged, never persisted server-side, and never leaves the
request.** The settings UI must state this plainly next to the input, alongside a
link to `aistudio.google.com/apikey`. A promise about someone's credentials that is
not visible in the UI is not a promise.

Precedence in the route:

```
x-api-key header (user's own)  →  process.env.GEMINI_API_KEY (ours, free tries)
```

When the user supplies a key, the free-session counter is not consulted or
incremented — it is their quota being spent.

### The busy state still matters

Even at two tries each, concurrent visitors can exhaust the shared 5/min. A 429 from
our own key must read as an invitation rather than a failure:

> Lots of people are trying this right now. Wait a moment, or add your own key for
> unlimited edits.

Distinguish this from a 429 against a *user-supplied* key, which is their own quota
and needs a different message.

---

## 10. Test requirements

Every test uses `AI_PROVIDER=mock` with scripted function-call sequences. No network.

**`lib/actions/__tests__/registry.test.ts`**
- Every action's `input` schema round-trips a valid example
- `runAction` with an unknown name returns `ok:false`, never throws
- `runAction` with malformed args returns the zod message, and mutates nothing
- `toDeclarations()` emits one declaration per action, with matching names
- A drift test: every registry entry appears in the generated declarations

**`lib/agent/__tests__/session.test.ts`**
- N mutations inside a session push **exactly one** command to history
- That command's inverse restores `session.before` exactly
- `view` actions are not recorded and do not affect the diff
- An empty net change pushes nothing
- Stop mid-session finalises with the work completed so far
- Opening a second session cancels and finalises the first

**`lib/agent/__tests__/run.test.ts`** — the core of this spec
- A scripted `[get_state] → [set_color, draw_line] → [finish]` sequence executes all
  four actions in order and terminates
- **Multiple calls in one turn all execute, in order, and return in one response turn**
- An unknown action returns an error to the model and the loop continues
- Hitting `MAX_STEPS` finalises cleanly and reports the cap
- `AbortSignal` stops the loop and finalises
- A destructive action without confirmation mutates nothing and reports it
- Exceeding `MAX_SESSION_PIXELS` stops further mutation

**`app/api/ai/agent/__tests__/route.test.ts`**
- Declarations come from the registry even when the client sends its own
- Oversized history → 413; malformed → 400
- Session rate limiting counts sessions, not calls
- Bundle test: no key and no system-prompt text in client output

**E2E (Playwright, mock provider)**
- Type an instruction → the panel logs steps → canvas changes → one `⌘Z` reverses it
- Stop mid-run leaves a coherent document and one undo entry
