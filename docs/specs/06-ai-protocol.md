# 06 — AI Protocol

**Owns:** `lib/ai/**`, `app/api/ai/edit/route.ts`, `spike/**`
**Depends on:** [01 — Document Format](./01-document-format.md), [03 — artwork-core](./03-artwork-core.md), [04 — Renderer](./04-renderer.md)

The highest-risk component in the project and the reason it exists. Built and proven in **Phase 0,
before any application scaffolding**.

---

## 1. The bet

A model gets **two views of the same pixels** and a **vocabulary too narrow to express garbage**:

| Input | Supplies | Fails at |
|---|---|---|
| Rendered PNG with a ruled coordinate grid | Semantics — "this is a face, those are eyes" | Exact coordinates |
| Text grid of palette indices | Exact coordinates | Semantics at a glance |

Sending both is cheap at these canvas sizes (~750 tokens combined for 32×32) and they fail in
*different* ways, which is the entire point. The op vocabulary then makes an incoherent result
inexpressible: there is no operation that accepts a raster, a blob, or a free-form matrix.

---

## 2. Request

Single request, forced JSON. **No tool loop in v1** — see §11 for why, and for the upgrade path.

The wire call is owned by the **provider adapter** ([06a](./06a-provider.md)), not by this spec.
Everything here — context construction, the prompt, the vocabulary, and all ten validation gates — is
provider-independent and must remain so.

```ts
// lib/ai/edit.ts — provider-agnostic
const provider = getProvider()                     // AI_PROVIDER, default 'gemini'
const ctx = buildContext(doc, frame)

const result = await provider.generate({
  systemPrompt: SYSTEM_PROMPT,                     // frozen constant, never interpolated
  imagePngBase64: ctx.png,
  userText: `${ctx.grid}\n\n${ctx.legend}\n\n${instructionBlock}`,
  jsonSchema: schemaFor(provider.schemaFlavour),   // strict or loose — see 06a §4
  maxOutputTokens: 8000,
  signal,
})

if (!result.ok) return mapProviderError(result)
return validateResponse(result.raw, doc, frame)    // §5 — the real gate
```

### Configuration rules

| Rule | Why |
|---|---|
| **Default provider is Gemini `gemini-2.5-flash`** | Free tier with genuine vision + structured output: 250 req/day, 10 rpm, 1M context. Sufficient for a 27-run probe matrix and a public demo. |
| `SYSTEM_PROMPT` is a frozen module constant | Never interpolate. Providers with prefix caching lose it on a single changed byte, and a stable prompt is what makes Phase 0 results comparable across runs. |
| Provider-specific tuning stays in the adapter | Sampling parameters, safety settings, and cache directives differ per vendor. Nothing in `lib/ai/` outside `provider/` may reference a vendor. |
| Server-side only | Keys are read from `process.env` in a Node route handler and in the spike. A test asserts no key reference is reachable from the client bundle. |
| **The validator is the gate, not the wire schema** | Providers vary in how faithfully they honour a JSON schema; several cannot express discriminated unions at all ([06a §4](./06a-provider.md)). Correctness rests on §5, which runs identically whatever the provider returned. |

Free-tier quotas change without notice — Google cut Gemini's by 50–80% in December 2025. The adapter
exists so that is a config change, not a rewrite.

---

## 3. Context construction

`lib/ai/context.ts`:

```ts
type AiContext = { png: string; grid: string; legend: string; scale: number }
function buildContext(doc: Doc, frame: number): AiContext
```

### 3.1 The ruled PNG

The current frame rendered through the **same renderer the user sees** ([04](./04-renderer.md)), plus
a coordinate ruler.

- Scale chosen so the long edge lands in **384–768px**: `scale = clamp(round(512 / max(w,h)), 4, 32)`.
  A 16×16 renders at 32× (512px); a 32×32 at 16× (512px); a 128×128 at 4× (512px).
- **Gutter** of `2 × cellSize` on the top and left carrying coordinate labels.
- Labels every 4 cells (`0, 4, 8, 12, …`), drawn with the bundled 3×5 bitmap digit font at 2× —
  no font dependency, deterministic across platforms, so the PNG is byte-reproducible in tests.
- A **major grid line every 4 cells** and a minor line every cell, both above the artwork.
- Checkerboard **off**; transparent cells render as a flat neutral so the model does not mistake
  checker squares for artwork.
- Cost: a 512px square PNG is ~350 image tokens.

### 3.2 The text grid

Byte-identical to the `px` rows in the document ([01 §2](./01-document-format.md)) — the same string
the code panel displays. It is fenced and given a column ruler:

```
CANVAS 16 wide x 16 tall. Rows are listed top to bottom.

     0123456789012345
 0 | ................
 1 | .....111111.....
 2 | ...1122222211...
 3 | ..12222222221...
 ...
15 | ................
```

Row numbers are right-aligned and padded to the width of the largest index, so columns line up for
any canvas size. The header ruler repeats the ones digit of each column index.

### 3.3 The palette legend

```
PALETTE (character = colour):
  . = transparent
  1 = #2d1b00  (outline)
  2 = #f4c430  (skin)
  3 = #1a1a2e  (eye)

Next available index if you add a colour: 4
```

The "next available index" line matters: `add_palette_color` does not take an index, so the model
must know what index its new colour will occupy in order to reference it in a later op.

### 3.4 The instruction block

```
INSTRUCTION: make it angrier

Emit operations that carry out this instruction. Change as little as possible.
```

---

## 4. Operation vocabulary

```ts
type Op =
  | { op: 'set_pixels';        px: Array<[x: number, y: number, i: number]> }
  | { op: 'draw_line';         x1: number; y1: number; x2: number; y2: number; i: number }
  | { op: 'draw_rect';         x: number; y: number; w: number; h: number; i: number; fill: boolean }
  | { op: 'flood_fill';        x: number; y: number; i: number }
  | { op: 'replace_color';     from: number; to: number }
  | { op: 'add_palette_color'; c: string }

type AiEditResponse = { summary: string; operations: Op[] }
```

`set_pixels` uses **positional tuples**, not objects. `[[4,3,1],[5,3,1]]` costs roughly a third of
`[{"x":4,"y":3,"i":1},…]` in output tokens, and a 200-pixel edit is the common case.

Semantics are defined once in [03 §4](./03-artwork-core.md) and implemented once in
`lib/artwork-core/ops.ts` — the AI path and the editor's own tools share the implementation, so a
model-drawn line and a user-drawn line cover identical pixels.

### JSON Schema

Two schemas are generated from the same zod union at module load and frozen, selected by
`schemaFor(provider.schemaFlavour)` ([06a §4](./06a-provider.md)):

- **strict** — the real discriminated union, for providers that support `oneOf`.
- **loose** — a single permissive object shape, for providers that do not (including Gemini).

Either way, only *structural* constraints ride on the wire. The semantic budgets in §5 are **not**
expressible in JSON Schema and are the validator's job — which is why correctness does not depend on
which flavour a provider received.

---

## 5. Validation

`lib/ai/validate.ts`. Nothing reaches a document before passing every gate, in order.

```ts
type ValidationError = { code: ValidationCode; message: string; opIndex?: number }
function validateResponse(raw: unknown, doc: Doc, frame: number): Result<Proposal, ValidationError>
```

| # | Gate | Code |
|---|---|---|
| 1 | zod parse of `AiEditResponse` | `schema` |
| 2 | `summary` is 1–200 chars, non-empty after trim | `bad_summary` |
| 3 | `operations.length` ≥ 1 and ≤ `MAX_OPS` (40) | `too_many_ops` / `no_ops` |
| 4 | Σ `set_pixels[].px.length` ≤ `MAX_PIXELS` (400) | `pixel_budget` |
| 5 | `add_palette_color` count ≤ `MAX_NEW_COLORS` (4); resulting palette ≤ 36 | `too_many_colors` / `palette_full` |
| 6 | Every coordinate within `[0,w) × [0,h)`; rects fully inside | `out_of_bounds` |
| 7 | Every index `< palette.length`, **simulating palette growth in op order** | `palette_range` |
| 8 | `replace_color.from !== to`; `draw_rect.w,h ≥ 1` | `noop` / `bad_rect` |
| 9 | Dry run: `applyOps(doc, ops, frame)` succeeds | `apply_failed` |
| 10 | `diff(doc, preview, frame)` is non-empty | `empty_diff` |

Gate 7 is the subtle one. Ops apply in order, so:

```
[{ op: 'add_palette_color', c: '#ff0000' },   // palette grows 4 → 5, new index is 4
 { op: 'draw_line', ..., i: 4 }]              // valid — but only because op 0 ran first
```

The validator maintains a running `paletteLength` as it walks the array. Validating against the
*original* palette length would reject every legitimate colour-adding edit.

Gate 10 distinguishes "the model proposed nothing" from "the model succeeded" — two very different
messages for the user.

Budgets live in `lib/ai/limits.ts` as named exports. No magic numbers at call sites.

**A rejected response is never partially applied.** Because gate 9 runs against a clone, this is
structural rather than a discipline the code has to maintain.

---

## 6. The system prompt

Frozen text in `lib/ai/prompt.ts`. Reproduced here so the spec and the code can be diffed.

```
You are a pixel-art editing assistant. You edit an existing artwork by emitting a list of
structured operations. You never produce or return images.

## What you receive

Each turn you get three views of the SAME artwork frame:

1. A rendered PNG, scaled up, with a coordinate ruler along the top and left edges and a grid
   line every 4 pixels. Use this to understand what the artwork depicts.
2. A text grid: one character per pixel, one line per row, with row numbers down the left and a
   column ruler across the top. Use this to determine exact coordinates.
3. A palette legend mapping each character to a colour.

The image and the text grid describe identical pixels. Use the image for meaning and the grid for
coordinates. If they appear to disagree, the text grid is authoritative.

## Coordinates

x increases to the right, starting at 0 on the left edge.
y increases downward, starting at 0 on the top edge.
Pixel (0, 0) is the top-left corner.
Always state coordinates as integers inside the canvas bounds.

## Operations you may emit

set_pixels        px: [[x, y, index], ...]        Set individual pixels.
draw_line         x1, y1, x2, y2, i               Bresenham line, endpoints included.
draw_rect         x, y, w, h, i, fill             Rectangle; outline when fill is false.
flood_fill        x, y, i                         4-connected fill from (x, y).
replace_color     from, to                        Replace every pixel of one index with another.
add_palette_color c                               Append a colour, lowercase #rrggbb or #rrggbbaa.

Operations apply in the order you list them. add_palette_color appends to the end of the palette,
so a colour you add becomes available to later operations at the index given in the legend.

There is no operation that accepts an image. Express every change through the list above.

## How to work

Read the image to identify the subject and its parts. Read the grid to find the exact cells those
parts occupy. Then emit the smallest set of operations that carries out the instruction.

Prefer the shape of the edit to brute force: two short lines make an eyebrow better than twelve
individual pixels, and replace_color recolours a garment better than enumerating its cells.

Preserve everything the instruction did not ask you to change. Reuse existing palette colours
where one is close enough; add a colour only when the instruction genuinely needs one that is not
present. Keep the artwork's existing style — its outline weight, its shading convention, and its
level of detail.

Respect the canvas bounds. An operation that reaches outside them fails and your whole edit is
rejected.

## Budgets

At most 40 operations, at most 400 individual pixels across all set_pixels operations, and at most
4 new palette colours per edit. If an instruction cannot be done within these limits, do the most
important part of it and say so in your summary.

## Your response

Return an object with:

summary     One sentence, past tense, describing what you changed, in plain language a person
            who cannot see the operations would understand. For example: "Angled the eyebrows
            down and flattened the mouth into a frown."
operations  The list of operations.

The user reviews your changes as a visual diff and chooses whether to accept them, so describe
what you did honestly, including anything you could not do.
```

### Prompt rules

- **No interpolation.** Any dynamic value belongs in the user message. This is a cache-correctness
  requirement, not a style preference.
- No "CRITICAL:", no "YOU MUST", no shouting. Opus 5 follows the system prompt closely; emphasis
  written for older models causes over-triggering.
- No instruction to verify or double-check its work — Opus 5 self-verifies, and telling it to do so
  causes over-verification.
- Changes to this text invalidate the Phase 0 results. Re-run the probe matrix after any edit.

---

## 7. Proposal lifecycle

```ts
type Proposal = {
  id: string
  instruction: string
  summary: string
  ops: Op[]
  diff: PixelDiff
  preview: Doc        // the result of applying ops to a clone
  frame: number
  createdAt: number
}
```

```
idle ──submit──► pending ──ok──► review ──accept──► applied → idle
                    │                 └──reject──► idle
                    └──error──► error ──retry──► pending
                                     └──dismiss──► idle
```

- **`review`** — the canvas renders `proposal.preview` with the diff overlay above it. The document
  is untouched.
- **`reject`** — discard the object. Nothing was ever mutated, so there is nothing to roll back.
- **`accept`** — build one `ai_edit` command ([03 §5](./03-artwork-core.md)) carrying every changed
  cell's before/after, plus `summary` and `ops` as metadata, and push it onto the history stack.
  **One `⌘Z` reverses the entire AI edit**, because `ai_edit` is the same shape as `paint`.
- Only one proposal can be pending at a time. Submitting again while pending cancels the in-flight
  request first.
- The proposal is **not** persisted. A refresh mid-review discards it; the artwork is untouched.

---

## 8. The route

`app/api/ai/edit/route.ts` — Node runtime, not Edge (the SDK and the PNG builder need Node APIs).

**Request**

```ts
POST /api/ai/edit
{ doc: SerializedDoc, frame: number, instruction: string }
```

**Server sequence**

1. Rate limit (§9). On exceed → `429`.
2. `instruction`: non-empty after trim, ≤ 500 chars → else `400 bad_instruction`.
3. `parseDoc(body.doc)` → else `400` with the `DocError`.
4. Body size ≤ 256KB → else `413`.
5. `buildContext(doc, frame)`.
6. `provider.generate(...)`. Map `ProviderErrorKind` ([06a §2](./06a-provider.md)):
   `rate_limited` → 429 (forwarding `retryAfterMs`), `unavailable` → 503, `bad_response` → 502,
   `config` → 500 (a deploy fault, never surfaced as a failed edit).
7. `refused` → `422 refused`. The adapter has already established this **without** indexing into
   candidate content — a blocked response carries no text, and reading it would throw. That check
   belongs to the adapter so every provider gets it right once.
8. `validateResponse(...)` → on failure `422` with the `ValidationError`.
9. Return `200 { summary, operations, diff, preview }`.

**Never returned to the client:** the raw model response, the system prompt, the API key, token
counts, or internal error stacks.

### Client-facing errors

Every failure has a specific, actionable message. "Something went wrong" is not acceptable.

| Status | Shown to the user |
|---|---|
| 429 (our limit) | `You've used all 20 AI edits for this hour. Try again later.` |
| 429 (upstream) | `The model is busy right now. Try again in a moment.` |
| 422 `refused` | `The model declined this request. Try rephrasing it.` |
| 422 `empty_diff` | `No change was proposed — try being more specific.` |
| 422 `pixel_budget` | `That edit was too large. Try asking for one change at a time.` |
| 422 other | `The proposed edit wasn't valid and was discarded. Nothing changed.` |
| 502/503 | `Couldn't reach the model. Your artwork is safe — try again.` |

---

## 9. Rate limiting and cost

Public endpoint, no auth. **20 requests per IP per hour**, sliding window, in-memory `Map`.

A demo does not need Redis; the tradeoff (limits reset on deploy, per-instance counters) is
acceptable and stated. Entries older than the window are swept on write, so the map cannot grow
without bound.

Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Budget model

The project runs on a **free tier**, so the scarce resource is quota, not dollars.

| Component | Tokens per edit |
|---|---:|
| System prompt | ~2,000 |
| Ruled PNG (512px) | ~350 |
| Text grid + legend + instruction | ~450 |
| Output (ops + summary) | 500–2,000 |
| **Total** | **~3,300–4,800** |

Against Gemini 2.5 Flash's free tier (250 req/day, 10 rpm, 250k TPM):

| Limit | Headroom |
|---|---|
| 250k tokens/minute | ~50 edits/minute — never the binding constraint |
| 10 requests/minute | Fine; edits are user-initiated and one-at-a-time |
| **250 requests/day** | **The binding limit.** A full 27-run probe matrix costs ~11% of a day. |

Our own 20/IP/hour cap sits well inside this. When the daily quota is exhausted the provider returns
`rate_limited`, which surfaces as the 429 message in the table above — the app degrades to a normal
pixel editor rather than breaking.

**Never log artwork content or instructions** — only counts, latency, provider, and outcome.

---

## 10. Phase 0 — the spike

Standalone, under `spike/`. No Next.js, no React, no UI. It loads fixtures, builds context, calls the
API, validates, applies, and writes before/after/diff PNGs plus a report.

```
spike/
  run.ts          probe-matrix runner  (pnpm spike)
  render-png.ts   pngjs renderer + the 3×5 digit font for the ruler
  report.ts       writes spike/results.md
  out/            generated PNGs — gitignored
```

### Probe matrix

Nine instructions × three starter sprites = 27 runs.

| # | Instruction | Class |
|---|---|---|
| 1 | make it angrier | expression |
| 2 | make it happier | expression |
| 3 | make the outline black | recolour |
| 4 | change the shirt to blue | targeted recolour |
| 5 | add a sword | add object |
| 6 | remove the sword | remove object |
| 7 | add a shadow | add detail |
| 8 | make it night | atmosphere / palette |
| 9 | turn it into a Game Boy palette | full palette swap |

### Judgement

Each run is scored by a human looking at the before/after PNGs:

| Verdict | Meaning |
|---|---|
| **pass** | A person would accept this edit for this instruction |
| **weak** | On-target but clumsy — right region, poor execution |
| **fail** | Wrong region, garbled, or no meaningful change |

**Gate: ≥ 6 of 9 instructions reach `pass` on the `face` sprite**, with `weak` not counting.

Also recorded per run: validation outcome, op count, pixel count, latency, and whether the edit
touched regions it should not have.

### Decision gate

The whole point of running this first.

- **≥ 6/9 pass** → proceed to Phase 1 as specified.
- **< 6/9** → **stop and report.** Do not proceed and do not quietly redesign. The options, in
  increasing cost, are: (a) prompt iteration — cheapest, try first; (b) a short tool loop with
  `inspect_region` and `preview` so the model can look before committing; (c) a semantic-region
  pre-pass that labels parts once and lets edits target them by name; (d) narrow the demo to the op
  classes that do work.

Results are written to `spike/results.md` with an embedded image table. They are **not** asserted in
CI — the outputs are non-deterministic.

---

## 11. Why structured output and not a tool loop

A tool loop (`inspect_region` → `set_pixels` → `preview` → `commit`) is the obvious alternative and
is what the source PRD proposed. Structured output wins for v1 on four counts:

1. **One round trip.** A loop is 4–8 calls: 4–8× the latency and cost for a control that must feel
   immediate.
2. **Deterministic parsing.** `output_config.format` guarantees the shape. A loop needs
   loop-termination logic, iteration caps, and partial-progress handling.
3. **The context already contains what `inspect_*` would return.** The model is given the full grid
   and palette up front; at ≤ 256×256 there is nothing more to inspect.
4. **`preview` is not useful without a render.** The model cannot see its own result; the human diff
   review is the verification step, and it is better.

**The upgrade path is real and pre-planned.** If Phase 0 shows the single shot underperforms —
specifically if failures cluster on *localisation* ("edited the wrong region") rather than
*execution* ("right region, ugly result") — switch to a loop with `inspect_region` and `preview`.
`applyOps` and the validator are unchanged by that switch; only `route.ts` and the prompt change.
That is why the decision belongs to Phase 0 data rather than to guesswork now.

---

## 12. Test requirements

**`lib/ai/__tests__/context.test.ts`**
- Grid output is byte-identical to `encodeRows` for every fixture
- Column ruler and row numbers align for 1-, 2-, and 3-digit canvas sizes
- Scale selection: 16×16→32×, 32×32→16×, 128×128→4×, 256×256→4× (clamped)
- The ruled PNG is byte-reproducible across two runs on the same fixture

**`lib/ai/__tests__/validate.test.ts`** — one case per code in §5, each asserting the document is
unchanged. Plus:
- `add_palette_color` followed by an op using the new index **passes**
- An op using the new index **without** the preceding `add_palette_color` fails `palette_range`
- 401 pixels fails; 400 passes
- 41 ops fails; 40 passes
- An op sequence whose net effect is nothing fails `empty_diff`

**`app/api/ai/edit/__tests__/route.test.ts`** — `AI_PROVIDER=mock` ([06a §6](./06a-provider.md)),
no network:
- Happy path (`__ok`) returns a well-formed proposal
- `__refuse` → 422 `refused`; the route never indexes into provider response content
- `__malformed` → 422, nothing applied
- `__ratelimit` → 429 with `retryAfterMs` forwarded
- A `config` error → 500, and is never shown to the user as a failed edit
- Oversized body → 413; empty instruction → 400; 21st request in an hour → 429
- **Bundle test:** the built client output contains no `*_API_KEY` value and no system-prompt text
  (asserted for every provider's key name, not just the default)
