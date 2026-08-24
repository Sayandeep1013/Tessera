# 18 — Anthropic-compatible provider and public BYOK

**Owns:** `lib/ai/provider/anthropic.ts`, `lib/ai/provider/config.ts`, `lib/agent/byok.ts`,
the key dialog in `components/AgentPanel.tsx`, `app/api/ai/models/route.ts`
**Extends:** [06a — Model Provider Adapter](./06a-provider.md) §2, §5, §7 ·
[12 — Agent Actions](./12-agent-actions.md) §9
**Unit:** I · **Written:** 24 Aug 2026

---

## 0. What this unit is for, and what it is not

Tessera's agent works. Its **edits** are mediocre, and
[`PHASE-0-FINDINGS.md`](../PHASE-0-FINDINGS.md) recorded the reason as model capability rather
than engineering: `gemini-3.1-flash-lite` on a free tier is the best model the project could
reach without asking anyone for money. That finding was correct **given the premise that the
only reachable model is a free Gemini one.**

The premise has changed. This unit removes it.

**In scope:** one Anthropic-compatible adapter reachable at any base URL, the Gemini↔Anthropic
turn translation, the config plumbing that lets a visitor bring their own provider as well as
their own key, the safety gates that come with accepting a URL from a browser, the UI, and a
**measured** re-test of edit quality against Claude.

**Out of scope:** rewriting the action catalogue, changing the validator, changing the loop's
shape, and OpenRouter. The agent's architecture is not on trial here — only which model is on
the other end of it.

**Explicitly not assumed:** that Claude will be better. §8 is a measurement, not a formality.
If the edits are still not artist-grade, that is the finding and it gets written down the same
way the last one did.

---

## 1. The shape of the change

Today the browser sends a key and the server decides everything else:

```
browser  ──x-api-key──▶  /api/ai/agent  ──▶  getProvider(undefined, key)  ──▶  gemini
```

After this unit the browser sends a key *and* the configuration that key belongs to, and the
server decides whether to honour it:

```
browser  ──x-api-key + body.provider──▶  /api/ai/agent
                                             │
                                     resolveProvider()   ← §4, the gates live here
                                             │
                              ┌──────────────┴──────────────┐
                        gemini (ours)              anthropic (theirs)
                                                   any base URL that passes §4.2
```

The deployment's own free tier stays **Gemini**, unchanged. Nothing in this unit spends the
project's money or changes what a visitor gets for free.

---

## 2. The adapter

`lib/ai/provider/anthropic.ts`, built on `fetch`. **No `@anthropic-ai/sdk` dependency.**

> [06a §2](./06a-provider.md) said the Anthropic adapter was "not built by default — it requires
> `@anthropic-ai/sdk`, which is deliberately not a dependency." The *conclusion* stands and the
> *reason* is now wrong: this adapter needs byte-level control of its request headers (§3), which
> is the one thing an SDK exists to take away from you. `fetch` is not a compromise here, it is
> the requirement. 06a §2 is amended to point at this spec.

### 2.1 Endpoint and request

```
POST {baseUrl}/v1/messages
```

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-api-key` | the user's key |
| `authorization` | `Bearer {key}` — sent **as well**, see §3.2 |
| `anthropic-version` | `2023-06-01` |
| `user-agent` | per the client profile, §3 |

Body: `model`, `max_tokens`, `system` (the frozen prompt, top-level — never a message),
`messages`, and for `converse()` a `tools` array.

`max_tokens` is **required** by the API. A missing one is a 400, not a default.

### 2.2 `schemaFlavour: 'strict'`

Gemini needed the loose wire schema because its `responseSchema` cannot express a discriminated
union ([06a §4](./06a-provider.md)). Anthropic can: `generate()` sends the strict schema as a
tool's `input_schema` and forces the call.

```jsonc
"tools": [{ "name": "propose_edit", "input_schema": <strict schema> }],
"tool_choice": { "type": "tool", "name": "propose_edit" }
```

The result is read out of the `tool_use` block's `input` and returned as `raw`. **The ten gates
in [06 §5](./06-ai-protocol.md) still run on it, unchanged.** A stricter wire schema moves where
a malformed op is caught; it does not move whether it is caught. Nothing about the validator
becomes optional because a better model is on the other end.

---

## 3. Client identity, and the AgentRouter problem

### 3.1 What was measured

Probed live, 24 Aug 2026, against `https://agentrouter.org` with a deliberately invalid key:

| Request | Response |
|---|---|
| `POST /v1/messages`, no identity headers | `401` · `{"type":"unauthorized_client_error"}` — *"unauthorized client detected"* |
| `POST /v1/chat/completions`, no identity headers | the same `401` |
| `POST /v1/messages`, `user-agent: tessera/1.0` | the same `401` |
| `POST /v1/messages`, `user-agent: claude-cli/2.0.14 (external, cli)` | `401` · `{"message":"无效的令牌","type":"new_api_error"}` — *invalid token* |

Two facts fall out of this, and they matter separately:

1. **AgentRouter speaks the Anthropic Messages API.** The fourth row reached token validation,
   which means the request was routed, parsed and understood. It is a `new-api`-class gateway
   exposing both `/v1/messages` and `/v1/chat/completions`. The adapter in §2 is the right
   adapter for it.
2. **AgentRouter gates on client identity before it ever looks at the key.** It answers Claude
   Code and refuses everything else, including an honest `tessera/1.0`. The error text points at
   a Discord for support, which reads as an allowlist someone maintains by hand.

### 3.2 The decision

Reaching AgentRouter at all means sending a user-agent that says Claude Code. That is a
misrepresentation of what the client is, and this spec is not going to describe it as anything
else.

**It is therefore never Tessera's default, never automatic, and never applied to the
deployment's own requests.** It exists as a *named profile the user selects for their own key,
against their own account, on a relay whose own documentation tells them to point Claude Code at
it.*

```ts
export type ClientProfile = 'standard' | 'claude-code'
```

| Profile | `user-agent` | When |
|---|---|---|
| `standard` | `tessera/{version} (+https://github.com/Sayandeep1013/Tessera)` | Default. Everything. |
| `claude-code` | `claude-cli/2.0.14 (external, cli)` plus `x-app: cli` | **Only** when the user picks the AgentRouter preset, or ticks compatibility mode on a custom URL. |

Rules, all testable:

- The profile is only ever read from **user-supplied** configuration. A request with no
  `x-api-key` cannot select one (§4.1 makes this structural, not a check).
- The UI states what the profile does, in the dialog, in plain words — same standard the
  credential promise in `AgentPanel` already meets. A user turning this on must know they are
  turning it on. §7.3 has the wording.
- The `unauthorized_client_error` response maps to a **specific** message naming the fix, not a
  generic "bad key". A user whose only mistake was leaving a checkbox unticked should be told
  which checkbox (§5, `bad_client`).
- **We ask.** Opening a request with AgentRouter to allowlist Tessera as a client is part of this
  unit's follow-up, recorded in `DEFERRED.md`. If they allowlist us, the profile is deleted and
  `standard` works everywhere — that is the outcome to aim at.

---

## 4. Configuration from the browser

### 4.1 Transport

The key stays a header. Everything else is a body field.

```jsonc
// POST /api/ai/agent
{ "sessionId": "...", "history": [...],
  "provider": { "id": "anthropic", "baseUrl": "https://agentrouter.org",
                "model": "claude-opus-4-5-20250929", "profile": "claude-code" } }
```

The key is never a body field: bodies are the thing most likely to end up in a log line, and
`route.ts` already reads `req.text()` whole.

**The hard rule that makes the rest of this safe:**

> If there is no `x-api-key` header, `body.provider` is **ignored entirely** and the
> deployment's own env configuration is used.

The deployment's key must never be sent to a host a browser chose. Without this rule, a crafted
`baseUrl` collects our Gemini key on the first request. This is not defence in depth; it is the
whole defence, and it is one `if`.

### 4.2 `baseUrl` is attacker-controlled — gate it

The server makes an outbound request to this URL. `lib/ai/provider/config.ts` validates before
anything is constructed, and returns `kind:'config'` rather than throwing:

| Gate | Rejects |
|---|---|
| 1 | Anything that is not a valid absolute URL |
| 2 | Any scheme but `https:` |
| 3 | Credentials in the URL (`https://user:pass@…`) |
| 4 | **Any** IP-literal host, v4 or v6, private or not — a real model provider has a hostname |
| 5 | `localhost`, and any name ending `.localhost` / `.internal` / `.local` / `.home.arpa` |
| 6 | A non-empty path, a query, or a fragment — the base URL is a host, and `/v1/messages` is ours to append |
| 7 | A URL longer than 200 characters |

Known hosts (`api.anthropic.com`, `agentrouter.org`) skip nothing — they pass the same gates.
There is no allowlist bypass, because an allowlist that can be bypassed is a comment.

**What these gates do not do.** They are syntactic. A hostname that *resolves* to a private
address still passes, and DNS rebinding between the check and the request is not defended
against — pinning a resolved IP through the fetch means a custom agent, and that is more machinery
than this earns. The reason it is acceptable is §4.1 and nothing else: a client-supplied URL is
only ever reachable on a request that carried a user's own key, so the worst case is a visitor
making our server issue an authenticated request, with their own credential, to a host they could
have reached from their own browser. **If §4.1 is ever relaxed, these gates become inadequate the
same day.** That sentence is the reason this paragraph exists.

`model` is likewise untrusted: `^[a-zA-Z0-9._:-]{1,64}$`, no path traversal, no slashes.

### 4.3 What the client stores

`lib/agent/byok.ts` grows from one key to a small record, still `localStorage`, still a courtesy,
still never sent anywhere but our own route:

```ts
type ByokConfig = {
  providerId: 'gemini' | 'anthropic'
  apiKey: string
  baseUrl?: string
  model?: string
  profile?: ClientProfile
}
```

Migration: an existing bare `tessera-api-key` string is read as
`{ providerId: 'gemini', apiKey }`. **Nobody's saved key is invalidated by this unit** —
rule 7's spirit applied to credentials rather than artwork.

---

## 5. Error mapping

Extends the table in [06a §3](./06a-provider.md). Anthropic's own errors, plus the two
AgentRouter-specific shapes measured in §3.1:

| Upstream | `kind` | Route code | What the user reads |
|---|---|---|---|
| `401`/`403` `authentication_error`, `permission_error` | `config` | `bad_key` | "That API key was rejected. Check it and try again." |
| `401` `unauthorized_client_error` | `config` | **`bad_client`** | "This relay only accepts requests from approved clients. Turn on AgentRouter compatibility in the key dialog and try again." |
| `401` `new_api_error` (`无效的令牌`) | `config` | `bad_key` | as `bad_key` |
| `404` `not_found_error` | `config` | `bad_model` | "That model isn't available on this key. Pick another." |
| `429` `rate_limit_error` | `rate_limited` | `upstream_rate_limited` | existing message; `retry-after` header parsed to `retryAfterMs` |
| `400` `invalid_request_error` | `config` | `bad_request` | the upstream message, truncated to 200 chars |
| `529` `overloaded_error`, any `5xx` | `unavailable` | `unavailable` | existing message |
| `stop_reason: 'max_tokens'` | `bad_response` | `bad_response` | existing message |
| `stop_reason: 'refusal'`, or a `refusal` block | `refused` | `refused` | existing message |

`bad_client` is the row that earns its keep: without it the single most likely first-run failure
reports itself as a bad key, and the user re-types a key that was fine.

**Read `stop_reason` before indexing into `content`.** The same class of bug as
[06a §3](./06a-provider.md)'s `checkFinish`: a refusal has no content block to read.

---

## 6. The translation, and the one hard part

`ConversePart` is Gemini-shaped by an explicit decision in
[12 §5](./12-agent-actions.md). This adapter translates both directions.

| `ConversePart` | Anthropic content block |
|---|---|
| `{ text }` | `{ type: 'text', text }` |
| `{ inlineData: { mimeType, data } }` | `{ type: 'image', source: { type: 'base64', media_type, data } }` |
| `{ functionCall: { name, args } }` | `{ type: 'tool_use', id, name, input: args ?? {} }` |
| `{ functionResponse: { name, response } }` | `{ type: 'tool_result', tool_use_id, content: JSON.stringify(response) }` |

Role `'model'` → `'assistant'`. Tools translate `{name, description, parameters}` →
`{name, description, input_schema}`.

### 6.1 `tool_use_id` — where this would go wrong

Gemini matches a function response to its call **by name**. Anthropic matches **by id**, and
rejects a `tool_result` whose `tool_use_id` does not correspond to a `tool_use` in the
immediately preceding assistant message. Our history carries no ids, and the adapter is
constructed fresh on every request (BYOK sends a different key each time), so it cannot remember
any it invented last turn.

**Resolution: derive the id from position, deterministically.** The whole history is sent every
turn, so the same call occupies the same coordinates in every request of a session:

```ts
const toolUseId = (turnIndex: number, partIndex: number) => `toolu_${turnIndex}_${partIndex}`
```

A `functionResponse` at turn *t* pairs with the *n*-th `functionCall` of turn *t−1*, matched in
order. Pure function of the history, no state, stable across requests. Get this wrong and every
multi-step session dies on turn two with a 400 — which is exactly the failure the tests in §9
exist to catch.

Two ordering facts that are not optional:

- **All `tool_result` blocks for one turn go in a single user message**, in call order. Our
  runner already produces exactly one `functionResponse` turn per model turn
  ([12 §5](./12-agent-actions.md), "parallel calls are load-bearing"), so this holds — but it
  holds by luck unless a test pins it.
- A `tool_result` must be the **first** content in its user message.

---

## 7. UI

### 7.1 The dialog

The existing "Use your own API key" dialog grows a provider picker above the input. The
credential promise, the mask, and Remove are unchanged — they are already right.

```
Use your own API key
┌────────────────────────────────────────────┐
│ Provider   [ Gemini · free ▾ ]             │
│            [ Claude · Anthropic  ]         │
│            [ Claude · AgentRouter ]        │
│            [ Anthropic-compatible… ]       │
├────────────────────────────────────────────┤
│ Key        [ ••••••••••••••••  ]           │
│ Model      [ claude-opus-4-5-… ▾ ]         │
└────────────────────────────────────────────┘
Stored in this browser only. Sent with each request, used
once, and discarded — never logged and never saved on our
server. Remove it any time.                Get a key ↗
```

- Placeholder and "Get a key" link follow the provider: `AIza…` →
  `aistudio.google.com/apikey`, `sk-ant-…` → `console.anthropic.com`, `sk-…` →
  `agentrouter.org`.
- **Anthropic-compatible…** reveals a base-URL field and the compatibility checkbox. Selecting
  the AgentRouter preset fills the URL and ticks the box; the user can see both.
- The model field is a combo, not a dropdown-only: §7.2 populates it, and a key whose catalogue
  cannot be read must still be usable by typing an id.

### 7.2 `GET /api/ai/models`

A new route, key in `x-api-key`, config in the query, proxying the provider's own model list so
the dialog can offer what the key actually has rather than a list this repo will fail to keep
current. Same §4.2 gates on the base URL, same rule that no key means no client config. Returns
`{ models: string[] }`, or an empty array on any failure — an unreadable catalogue is a
degraded dialog, never a blocked one.

Called on save, not on keystroke.

### 7.3 The compatibility checkbox says what it does

Not "compatibility mode". This:

> **AgentRouter compatibility**
> AgentRouter only answers clients it recognises, so Tessera identifies itself as Claude Code
> when talking to it. Your key, your account, your call — leave this off for any other provider.

Same reasoning as the credential promise already in this dialog: a thing worth writing in a spec
that the user never reads is worth writing where they do.

---

## 8. The measurement — the actual point of the unit

Nothing above improves a single pixel. This does.

1. Re-run the Phase 0 probe matrix (`npm run spike`) against Claude at the same sizes, with the
   same artwork and the same instructions used in
   [`PHASE-0-FINDINGS.md`](../PHASE-0-FINDINGS.md). Same prompts, so the numbers are comparable.
2. Render every result and **look at it** (`npx tsx tools/render-probe.ts`) — the gate that
   Phase 0 failed 0/9 was a visual one and it stays a visual one.
3. Record the result in `PHASE-0-FINDINGS.md` as a dated second section. **If Claude also fails
   the gate, that is the finding**, and it gets written down as plainly as the first one.
4. **Only then** consider prompt changes. `AGENT_SYSTEM_PROMPT` is a frozen constant and is
   shared across providers; changing it per-provider makes every comparison in this repo
   meaningless. Any change is measured before and after, or it does not land.

Two levers stay on the shelf until the measurement says they are needed, so this unit cannot
quietly turn into four:

- **Re-attaching a rendered PNG every N steps.** [12 §5](./12-agent-actions.md) already names
  this as the lever for "text grid may be insufficient to judge appearance" and notes it is a
  change to `run.ts` only. It was unaffordable at 5 rpm. It may be affordable now. It is not in
  this unit unless §8.2 shows the model failing specifically at judging appearance.
- **Raising `MAX_STEPS`.** Six was a runaway guard chosen against a free tier's pacing.

---

## 9. Test requirements

Mock `fetch`. No test in this repo reaches a real provider ([06a §6](./06a-provider.md)).

**`provider/__tests__/anthropic.test.ts`**
- The request puts the system prompt in `system`, not in `messages`
- `max_tokens` is always present
- Every row of §5's error table maps to the right `kind` **and** route code
- A `refusal` stop reason maps to `refused` without indexing into `content`
- `retry-after` becomes `retryAfterMs`
- A 200 whose body is not JSON maps to `bad_response`
- `generate()` forces the `propose_edit` tool and returns its `input` as `raw`

**`provider/__tests__/translate.test.ts`** — the §6 table, both directions, plus:
- Two `functionCall` parts in one model turn produce two `tool_use` blocks with **distinct** ids
- The following `functionResponse` turn produces `tool_result` blocks whose `tool_use_id`s match
  those ids, in order
- Ids are **identical** when the same history is translated twice (the determinism §6.1 depends on)
- All `tool_result` blocks for a turn land in one user message, first in its content
- `role: 'model'` becomes `role: 'assistant'`

**`provider/__tests__/config.test.ts`** — every gate in §4.2, one case each, including
`http://`, `https://127.0.0.1`, `https://[::1]`, `https://foo.internal`, an IP literal, a URL
with a path, a URL with credentials, an over-long URL, and a model id containing `/`.

**`api/ai/agent/__tests__/route.test.ts`** (extended)
- **A request with no `x-api-key` ignores `body.provider` completely** — asserted by the
  provider that gets constructed, not by the response text. This is §4.1's rule and it is the
  most important test in the unit.
- A request with a key and a valid config constructs the anthropic provider with that base URL
- A request with a key and a rejected base URL returns `config`, and **never** makes an outbound
  request
- `profile: 'claude-code'` is only ever set on a provider built from a user-supplied key

**`agent/__tests__/byok.test.ts`** (extended)
- A legacy bare-string key migrates to `{ providerId: 'gemini', apiKey }`
- Config round-trips through `localStorage`
- `localStorage` throwing (private mode) still yields a usable default

**`app/api/ai/agent/__tests__/route.test.ts` → `describe('bundle safety')`** — extended here.

> **Corrected, 24 Aug 2026.** A first pass on this spec claimed the bundle guard did not exist. It
> does — it lives in the agent route's own test file rather than in a `lib/__tests__/bundle.test.ts`,
> which is why a search by filename missed it. What is true is narrower and worse:
>
> 1. It scanned for exactly **one** literal, `GEMINI_API_KEY`, while [06a §7](./06a-provider.md)
>    describes it as covering `process.env.*_API_KEY` generally. Unit I adds two more names.
> 2. 06a §7 also promises "no key value appears in build output". **Nothing checked that.**
> 3. Worst: all three guards are `skipIf(!existsSafe('.next/static'))`, and `UNITS.md §0.2` ran
>    `npm test` at step 3 with `rm -rf .next && npm run build` at step 5. **In the documented
>    verification sequence they skipped every single time** — reporting green having checked
>    nothing. Hard rule 6 has been documented as enforced by a guard that, in the sequence the
>    repo actually follows, had never executed.
>
> §0.2 now re-runs the suite after the build, and the guards say so out loud when they cannot run.

- Every `*_API_KEY` name, plus a `process.env.*API_KEY` pattern so the next provider is covered
  without editing a list
- No value from `.env.local` appears anywhere in `.next/static/**` after a real build — reported
  by file, never by printing the secret
- The check runs over the **built output**, not the source tree — a re-export chain that pulls a
  server module into the client graph is exactly the failure a source-level grep misses

**Browser probe: `tools/probe-byok.ts`** — drives the dialog in both themes: each provider
choice shows the right placeholder and link, the custom option reveals the URL field, the
checkbox carries §7.3's wording, a saved key masks, Remove clears, and the whole dialog fits at
320 px.

---

## 10. Definition of done

- [ ] `anthropic.ts` passes the shared provider contract suite ([06a §8](./06a-provider.md))
- [ ] A real Claude key drives a complete multi-step agent session end to end — verified by hand,
      with the screenshot in `docs/shots/`
- [ ] Gemini still works with no key at all, two free sessions, unchanged
- [ ] Every test in §9 exists and passes; `npm run probes` is green in full
- [ ] `PHASE-0-FINDINGS.md` carries a dated §2 with the measured verdict, whatever it is
- [ ] `06a-provider.md` §2 amended to point here; `.env.example` documents the new vars
- [ ] The bundle secret-scan test in §9 exists and passes, and `06a-provider.md` §7 +
      `HANDOFF.md` §2 no longer claim an enforcement that was not there
- [ ] `DEFERRED.md` records the AgentRouter allowlist request as outstanding
- [ ] Scored across the six dimensions, lowest taken, ≥ 9
