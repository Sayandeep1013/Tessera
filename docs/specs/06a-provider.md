# 06a — Model Provider Adapter

**Owns:** `lib/ai/provider/**`
**Depends on:** [06 — AI Protocol](./06-ai-protocol.md)

The AI protocol in [06](./06-ai-protocol.md) — context construction, the system prompt, the operation
vocabulary, and all ten validation gates — is **provider-independent**. This spec covers the thin
layer that actually talks to a model.

---

## 1. Why an adapter

The project runs on free API tiers, and free tiers are unstable: Google cut Gemini free quotas 50–80%
in December 2025 without notice, and Groq cut its free RPD from 14,400 to ~1,000 in 2026. A portfolio
project that hard-codes one vendor's SDK breaks when that happens.

The adapter also makes the Phase 0 spike genuinely useful: the same 27-run probe matrix can be
executed against two providers and compared, rather than proving only that one specific model works.

**Scope discipline:** the adapter handles *transport and response shape only*. It does not build
context, does not own the prompt, and does not validate. Everything a provider swap must not change
stays in [06](./06-ai-protocol.md).

---

## 2. The interface

`lib/ai/provider/types.ts`:

```ts
export type EditRequest = {
  systemPrompt: string        // frozen constant from lib/ai/prompt.ts
  imagePngBase64: string      // the ruled PNG, no data: prefix
  userText: string            // grid + legend + instruction
  jsonSchema: JsonSchema      // the loose schema — see §4
  maxOutputTokens: number
  signal?: AbortSignal
}

export type ProviderUsage = { inputTokens?: number; outputTokens?: number }

export type EditResult =
  | { ok: true; raw: unknown; usage?: ProviderUsage; model: string }
  | { ok: false; kind: ProviderErrorKind; message: string; retryAfterMs?: number }

export type ProviderErrorKind =
  | 'refused'       // safety/policy decline — do not retry as-is
  | 'rate_limited'  // quota; retryAfterMs when the provider tells us
  | 'unavailable'   // 5xx, timeout, network
  | 'bad_response'  // 200 but unparseable as JSON
  | 'config'        // missing key, bad model id — a deploy error, not a user error

export interface AiProvider {
  readonly id: string
  readonly model: string
  generate(req: EditRequest): Promise<EditResult>
}
```

`generate` returns `raw: unknown` — **the parsed JSON and nothing more.** Interpreting it is
[06 §5](./06-ai-protocol.md)'s job. A provider that tried to be helpful by reshaping the payload would
silently break the validator's guarantees.

**`generate` never throws.** Every failure is an `EditResult`. This mirrors the `Result` discipline in
[03 §2](./03-artwork-core.md).

### Selection

```ts
// lib/ai/provider/index.ts
export function getProvider(): AiProvider   // reads AI_PROVIDER, defaults to 'gemini'
```

| `AI_PROVIDER` | Module | Env var needed |
|---|---|---|
| `gemini` *(default)* | `gemini.ts` | `GEMINI_API_KEY` |
| `openrouter` | `openrouter.ts` | `OPENROUTER_API_KEY` |
| `anthropic` *(optional)* | `anthropic.ts` | `ANTHROPIC_API_KEY` |
| `mock` | `mock.ts` | — (tests only) |

**Only `gemini`, `openrouter`, and `mock` are installed dependencies.** `gemini` uses
`@google/genai`; `openrouter` and `mock` use `fetch` and need no package at all. The `anthropic`
adapter is **not built by default** — it requires `@anthropic-ai/sdk`, which is deliberately not a
dependency of this project. If it is ever wanted, add the package and the module together; until
then, selecting `AI_PROVIDER=anthropic` returns `kind: 'config'` with
`"the anthropic adapter is not installed"`.

A missing key returns `kind: 'config'` at construction, surfaced as a 500 with a deploy-facing
message. It must never be reported to the user as a failed edit.

---

## 3. Gemini (default)

**Model: `gemini-3.1-flash-lite`.**

> **Measured 11 Aug 2026 against a real key** (`tools/probe-gemini.ts`, `probe-limits.ts`,
> `probe-config.ts`). This section has now been wrong twice; both drafts are recorded so the
> corrections are auditable.
>
> - **Draft 1 said `gemini-2.5-flash`, 250 req/day.** That model is **closed to new keys** — it
>   returns `404 … no longer available to new users` while still appearing in `models.list()`.
> - **Draft 2 said `gemini-flash-latest` (→ `gemini-3.6-flash`).** Also wrong: Google cut the **Flash**
>   line to ~20 requests/day in Dec 2025, and the surviving free quota sits in the **Flash-Lite**
>   line. Measuring the per-minute wall on Flash hid the daily one entirely.
> - **The per-minute quota is 5**, as `GenerateRequestsPerMinutePerProjectPerModel-FreeTier`, with a
>   `retryDelay` of ~20s.

Measured on the real task — 16×16 sprite, ruled PNG + text grid, `"make it angrier"`:

| | `gemini-3.6-flash` | **`gemini-3.1-flash-lite`** |
|---|---:|---:|
| Latency | 16,618 ms | **2,201 ms** ⟵ 7.5× faster |
| Thinking tokens | 2,906 | **0** |
| Total tokens | 4,500 | **1,962** |
| Free daily quota | ~20 (cut) | **headroom — 6/6 paced calls clean** |
| Coordinate accuracy | 4/4 in bounds | 12/12 in bounds |

Flash-Lite wins on every axis that matters here. The Flash line's extended thinking bought nothing on
this task: 2,906 thinking tokens produced a *worse* result than 0.

| Limit | Measured | Our worst case |
|---|---|---|
| **Requests / minute** | **5** ⟵ binding | 1 — edits are user-initiated and serialised |
| Requests / day | no cap reached in testing | 27 per full probe run |
| Latency, real task | **~2.2s** | acceptable for the money shot |
| Tokens, real task | ~1,960 | |
| Context window | 1,000,000 | ~3,000 |

**Always resolve the model at startup** rather than hard-coding one:

```ts
const PREFERENCE = [
  'gemini-flash-latest',      // alias — never 404s
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
]
```

Walk the list against `models.list()`, take the first that answers a trivial probe, cache it for the
process lifetime. The adapter logs which model it resolved.

### 3.1 Request parameters — what is and is not accepted

Verified by 400s against the live API, not by documentation:

| Parameter | Status |
|---|---|
| `temperature`, `topP`, `topK` | **Deprecated 2026-07-21.** Ignored on current models, `400` on future ones. **Do not send them.** Push determinism into the system instruction instead. |
| `thinkingConfig: { thinkingBudget: 0 }` | **`400 INVALID_ARGUMENT`** on Gemini 3.x. Thinking cannot be switched off — choose a model that does not think instead, which is what Flash-Lite is. |
| `mediaResolution: 'MEDIA_RESOLUTION_ULTRA_HIGH'` | **`400`** on `gemini-3.1-flash-lite` — the enum value is rejected. `ultra_high` appears to be Flash-line only. Try `MEDIA_RESOLUTION_HIGH` and measure; do not assume it helps. |
| `responseMimeType` + `responseSchema` | Works. The loose schema (§4) is required. |
| `systemInstruction` | Works, and is where behavioural steering belongs now that sampling parameters are gone. |

### 3.2 Latency is solved; do not regress it

At **~2.2s** the AI edit is comfortably inside what a proposal-review interaction can absorb. This is
a property of the model choice, so:

- **Any model change must re-measure latency.** A switch back to the Flash line would take this from
  2.2s to 16.6s and silently ruin the core interaction.
- The composer still shows a busy state with a cancel affordance — 2.2s is fast, not instant.
- Streaming is **not** required at this latency. Do not build it speculatively.

Phase 0 records latency per probe alongside the pass/weak/fail verdict; model choice is made on both
axes together.

### 3.3 Probe-matrix pacing

27 runs at 5 rpm is **~6 minutes with pacing**. `spike/run.ts` sleeps to stay under the limit and
honours the `retryDelay` from any 429 rather than retrying blindly.


### Request shape

SDK `@google/genai`. System prompt goes in `systemInstruction`, **not** as a leading user turn — the
latter would defeat any prefix caching and muddles the role separation.

```ts
const res = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{
    role: 'user',
    parts: [
      { inlineData: { mimeType: 'image/png', data: req.imagePngBase64 } },
      { text: req.userText },
    ],
  }],
  config: {
    systemInstruction: req.systemPrompt,
    responseMimeType: 'application/json',
    responseSchema: req.jsonSchema,
    maxOutputTokens: req.maxOutputTokens,
    temperature: 0.4,
  },
})
```

**Image before text.** Gemini attends better to an image that precedes the prompt referring to it;
this also matches the ordering used in [06 §2](./06-ai-protocol.md).

`temperature: 0.4` — low enough for coordinate discipline, high enough that a retry after a rejected
proposal isn't byte-identical. Unlike Opus 5, Gemini accepts sampling parameters.

### Error mapping

| Condition | `kind` |
|---|---|
| HTTP 429, or `RESOURCE_EXHAUSTED` | `rate_limited` (parse `retryDelay` when present) |
| `promptFeedback.blockReason`, or `finishReason` of `SAFETY` / `PROHIBITED_CONTENT` | `refused` |
| `finishReason: 'MAX_TOKENS'` | `bad_response` — truncated JSON is unparseable |
| HTTP 5xx, network error, timeout | `unavailable` |
| 200 but `JSON.parse` fails | `bad_response` |
| Missing/invalid key, unknown model | `config` |

**Check `finishReason` before reading the text.** A blocked response has no candidate text and
indexing into it throws — the same class of bug as reading `content[0]` on an Anthropic refusal.

---

## 4. The schema problem

Gemini's `responseSchema` is a **subset of OpenAPI 3.0**. It does not reliably support `oneOf`,
discriminated unions, or `additionalProperties: false`. Our `Op` type is a discriminated union on
`op`, so the strict schema from [06 §4](./06-ai-protocol.md) cannot be sent as-is.

**Resolution: a loose wire schema, a strict validator.**

```jsonc
{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "operations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "op": { "type": "string",
                  "enum": ["set_pixels","draw_line","draw_rect","flood_fill",
                           "replace_color","add_palette_color"] },
          "px": { "type": "array",
                  "items": { "type": "array", "items": { "type": "integer" } } },
          "x":  { "type": "integer" }, "y":  { "type": "integer" },
          "x1": { "type": "integer" }, "y1": { "type": "integer" },
          "x2": { "type": "integer" }, "y2": { "type": "integer" },
          "w":  { "type": "integer" }, "h":  { "type": "integer" },
          "i":  { "type": "integer" },
          "from": { "type": "integer" }, "to": { "type": "integer" },
          "fill": { "type": "boolean" },
          "c": { "type": "string" }
        },
        "required": ["op"]
      }
    }
  },
  "required": ["summary", "operations"]
}
```

Every field is optional except `op`. The schema's job is only to get well-formed JSON with the right
outer shape and a valid `op` value out of the model.

**This costs nothing in safety.** All ten gates in [06 §5](./06-ai-protocol.md) run on the result
regardless of how it arrived, and gate 1 is a strict zod parse of the real discriminated union. A
`draw_line` missing `y2` fails there, exactly as it would have failed a strict wire schema — the only
difference is where the rejection happens.

The loose schema is generated **from** the zod union by `lib/ai/opSchema.ts`, so the two cannot drift:
adding an op or a field updates both. A test asserts every field across every union member appears in
the generated wire schema.

Providers whose structured-output support does handle unions (Anthropic's `json_schema`) receive the
strict schema. `AiProvider` therefore declares which it wants:

```ts
readonly schemaFlavour: 'strict' | 'loose'
```

---

## 5. OpenRouter (fallback)

One key, many models, useful for comparing candidates without new accounts. OpenAI-compatible
`/chat/completions`, so the image goes as an `image_url` part with a `data:` URI, and structured
output uses `response_format: { type: 'json_schema', json_schema: { schema, strict: true } }`.

Caveats to design around, not discover later:

- Free (`:free`) models carry tight and changing per-model limits, and vision support varies. The
  model id is env-configurable (`OPENROUTER_MODEL`) rather than hard-coded.
- Not every routed backend honours `strict: true`. This provider declares `schemaFlavour: 'loose'` and
  relies on the validator, as above.
- `X-Title` and `HTTP-Referer` headers should be set — some backends deprioritise requests without
  them.

---

## 6. Mock (tests)

`mock.ts` returns canned responses selected by the instruction text, so the route, validator, and
proposal lifecycle are all testable with **no network and no key**:

| Instruction contains | Returns |
|---|---|
| `__ok` | A valid two-op edit |
| `__refuse` | `{ kind: 'refused' }` |
| `__ratelimit` | `{ kind: 'rate_limited', retryAfterMs: 60000 }` |
| `__malformed` | `{ ok: true, raw: { nonsense: true } }` |
| `__oob` | Ops with out-of-bounds coordinates |
| `__budget` | 401 pixels in one `set_pixels` |
| `__empty` | Ops whose net effect is no change |

**Every automated test uses `mock`.** Only the spike and manual runs hit a real provider — a rule that
keeps CI free, fast, and deterministic.

---

## 7. Configuration

```bash
# .env.local — never committed
AI_PROVIDER=gemini
GEMINI_API_KEY=...
# OPENROUTER_API_KEY=...
# OPENROUTER_MODEL=meta-llama/llama-4-scout:free
# ANTHROPIC_API_KEY=...
```

`.env.example` is committed with the keys blank and a comment pointing at
`https://aistudio.google.com/apikey`.

Keys are read **only** in server modules — the route handler and the spike. A test asserts no
`process.env.*_API_KEY` reference exists in any file reachable from the client bundle, and that no key
value appears in build output.

---

## 8. Test requirements

**`provider/__tests__/selection.test.ts`** — `getProvider()` honours `AI_PROVIDER`, defaults to
`gemini`, and returns `kind: 'config'` (never throws) when the key is absent.

**`provider/__tests__/gemini.test.ts`** — `fetch` mocked:
- Request body places the image part before the text part and puts the prompt in `systemInstruction`
- Each row of the §3 error-mapping table produces the right `kind`
- A `SAFETY`-blocked response maps to `refused` **without** indexing into candidate text
- `retryDelay` is parsed into `retryAfterMs`
- A 200 with non-JSON text maps to `bad_response`

**`provider/__tests__/schema.test.ts`**
- The generated loose schema contains every field of every op variant
- Adding a field to the zod union without regenerating fails the test (drift guard)
- The strict schema round-trips a valid `AiEditResponse`

**`provider/__tests__/contract.test.ts`** — one shared suite run against every implementation:
`generate` never throws on any mocked failure; a successful result always carries `raw` and `model`;
an aborted `signal` resolves to `unavailable` rather than rejecting.
