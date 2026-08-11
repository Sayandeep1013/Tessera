# Session handoff — Tessera

**Written:** 11 Aug 2026, end of session.
**Repo:** https://github.com/Sayandeep1013/Tessera · branch `main` · last commit `0b6ff9c`
**State:** everything green and pushed. 165 tests, 10 test files, production build clean,
5 viewport tiers clean, zero runtime errors.

---

## 0. The prompt to start the next session with

Paste this verbatim:

> Read `docs/HANDOFF.md` and continue the work.
>
> Start with task **#46 — Phase 4: Layers panel**. Follow the working loop in §3 of the handoff:
> scope → sub-spec → self-review the spec → implementation plan + task list → build → score across
> six dimensions taking the lowest as the overall, and iterate until ≥ 9/10. Do not inflate the
> score.
>
> Before writing any code, read `CLAUDE.md`, `docs/WORKFLOW.md`, and §5 (traps) of the handoff —
> §5 will save you an hour of rediscovering things that have already bitten this repo.
>
> Ask me before making decisions that §8 lists as already settled. Everything else, use your
> judgement and tell me what you decided.

---

## 1. What Tessera is

A **code-native pixel-art editor with an AI agent**, built from scratch as a portfolio project,
deployed publicly, **no accounts and no login required to use anything**.

Inspired by [newt.sh](https://newt.sh/), which was verified closed-source three ways — so nothing
here is forked. The UI was cloned 1:1 from *measured* data (Playwright, not screenshots), and then
given its own identity on top.

**The one idea everything else follows from:** one character per pixel. `.` is transparent, `1`–`9`
and `a`–`z` are palette indices, max 36 colours. The **same bytes** are the export format, the
code-panel text, and what the AI reads. There is no second representation of the artwork anywhere.

```json
{ "v": 1, "w": 16, "h": 16,
  "palette": [{ "c": "transparent" }, { "c": "#2d1b00", "n": "outline" }],
  "frames": [{ "ms": 100, "layers": [{ "n": "base", "px": ["................", ".....111111....."] }] }] }
```

---

## 2. Hard rules — do not break these

From `CLAUDE.md`. They override default behaviour.

1. **NEVER add a `Co-Authored-By` trailer, a "Generated with…" line, or any AI/tool attribution** to
   a commit message or PR body. Commits are the author's, full stop. This is the user's explicit,
   repeated instruction.
2. **Never commit secrets.** `.env.local` holds the Gemini key and is gitignored. Check
   `git status` before every commit.
3. **The document is the source of truth.** Never introduce a second one. Never make a rendered
   image the source of truth.
4. **Every document mutation goes through `commit(cmd)`** in `lib/store/editor.ts`. Nothing else
   writes the document — that invariant is what makes undo trustworthy. (An agent session changes
   *what happens to history*, not *who writes*; see `agentDepth`.)
5. **Every AI operation is validated before it touches anything**, and applied to a clone first.
6. **API keys are server-side only.** Enforced by a bundle test that scans the real build.
7. **Never silently discard artwork.** Failed parses, failed saves and rejected AI edits all surface
   with an escape hatch.
8. **Colours come from tokens** in `app/globals.css`. No hard-coded hex in any `.tsx`. Enforced by
   `lib/__tests__/tokens.test.ts`; genuine exceptions carry a `token-exempt:` comment on the line.
9. **Tests ship in the same change as the code they cover.**
10. **When a spec turns out to be wrong, say so and fix the spec** — do not route around it. This has
    already happened four times and each correction is recorded in the spec itself.

---

## 3. The working loop — the user's process, follow it

From `docs/WORKFLOW.md`. The user has restated this several times; it is not optional.

```
scope → sub-spec → review/iterate the spec → implementation plan + task list → build
      → score across six dimensions → iterate until ≥ 9/10
```

- **Keep the task list updated as you go.** Use TaskCreate/TaskUpdate. The user checks it.
- **Score honestly.** Six dimensions, **overall = the lowest, not the average**:

  | # | Dimension | 10 means |
  |---|---|---|
  | 1 | Spec conformance | Every stated requirement implemented, nothing silently dropped |
  | 2 | Correctness | Happy path and every enumerated edge case; no known bugs |
  | 3 | Tests | Every test the spec requires exists, passes, and would catch a regression |
  | 4 | Integration | Module boundaries respected; global rules upheld; no new coupling |
  | 5 | Design fidelity | Matches the design spec to the measurement, both themes, all viewports |
  | 6 | No regressions | Everything that worked still works; full suite green |

- **≥ 9** → done, state what was deliberately left out. **< 9** → list the gaps, fix, re-score.
- Do not inflate. Scoring the agent unit honestly at **5** last session found three real gaps that
  would otherwise have shipped — including a vitest glob that silently excluded an entire directory.

**Verify by measuring and by looking.** Both. The responsive overflow check passed while the zoom
bar was sitting on top of the panel's own text; only a screenshot caught it. Conversely, the grid
looked fine in a screenshot until magnified.

---

## 4. Where things stand

### Built and working

| Area | State |
|---|---|
| Document model (`lib/artwork-core/`) | Complete. Codec, ops, commands, diff, fixtures. Imports nothing but zod. |
| Renderer (`lib/renderer/`) | Full-viewport canvas, DPR capped at 2, difference-blended grid, selection overlay, sprite→SVG. |
| Editor input | 8 tools all working: brush, eraser, fill, shapes, gradient, marquee, select/move, eyedropper. Dither (Bayer 4×4). Scroll pans, pinch zooms. |
| Chrome | Top bar, tool rail, zoom bar, palette popover, File menu (New/Open/Export JSON/Export PNG), dither menu. |
| Responsive | 4 tiers (mobile/tablet/compact/wide), all 5 measured viewports clean. |
| Visual identity | "Mosaic" — tiles, one accent from the product's own palette, Geist Mono numerals, two pixel loaders. |
| AI agent | 21 actions, registry-driven, look-act-verify loop, session collapse to one undo, BYOK. **Scored 9/10.** |
| Persistence | IndexedDB autosave. |

### Not built

| Control | Why it's dead |
|---|---|
| **Layers** button | Feature not built → **task #46, next** |
| **Timeline** button | Feature not built → task #47 |
| **Share** button | Needs Supabase backend → task #48 |

These three are hidden below 1100px width already (`showUnbuilt` in `lib/editor/breakpoint.ts`), so
a dead control never costs a live one its place. When you build one, flip it on there.

### Open tasks

- **#46 Phase 4: Layers panel** ← start here, see §6
- **#47 Phase 4: Animation timeline and frames**
- **#48 Phase 4: Share via Supabase snapshots**
- **#23 Phase 6: AI edit quality** — assessed, honestly still open. See §7.

---

## 5. Traps — read this before touching anything

Every one of these has already cost time in this repo.

### Environment

| Trap | What happens | Do this instead |
|---|---|---|
| **PowerShell + UTF-8** | `Get-Content -Raw` reads UTF-8 as ANSI and `Set-Content` writes a BOM. Round-tripping **mangles every non-ASCII character** (`§` → `Â§`, `—` → `â€"`). It has happened twice. | Use the Edit/Write tools, or Python via the Bash tool. If you must repair mojibake: Windows-1252 round-trip, then strip the leading `?` the BOM becomes. |
| **PowerShell here-strings** | Embedded double quotes break; git receives the message split into pathspecs. | Write commit messages to a scratchpad file and use `git commit -F <file>`. |
| **`page.evaluate` with a function** | `__name is not defined`. tsx/esbuild's `keepNames` injects a helper that does not exist in the browser. | Pass browser code as a **plain string constant**. |
| **…and that string must be an IIFE** | `evaluate` treats a string as an *expression*; a bare arrow function serialises as `undefined`. | `(() => { … })()` |
| **Top-level `await` in a scratch `.ts`** | tsx errors with "not supported with the cjs output format" for files outside the project. | Put probe scripts in `tools/` and wrap in `async function main()`. |
| **`.next` contention** | Running `npm run build` while a dev server is up leaves stale type stubs and both break. | `rm -rf .next` before a build, or stop the dev server. |
| **Dev server already running** | `npm run dev` fails with "Another next dev server is already running" and silently uses port 3001. | Check port 3000 first; it hot-reloads your edits anyway. |

### Application

- **Undefined CSS custom properties fail silently.** No warning, no throw, no typecheck error — they
  resolve to nothing. Eight had accumulated in one panel. `lib/__tests__/tokens.test.ts` guards this
  now; keep it passing.
- **React registers `wheel` listeners as passive**, so `preventDefault` from an `onWheel` prop is
  ignored. Use a native listener with `{ passive: false }`.
- **An outside-click closer must use `mousedown`, not `click`.** The click that opens a menu is
  still propagating when the effect registers, so a `click` listener closes it in the same gesture
  and the menu never appears.
- **The editor does not server-render.** `app/page.tsx` mounts it after hydration. Everything it
  shows comes from somewhere the server cannot see (IndexedDB, localStorage, a measured rect), so
  prerendering produced hydration mismatches on every load. Do not "optimise" this back.
- **Gemini specifics** (all measured, all in `lib/ai/provider/gemini.ts`): no `temperature`/`topP`/
  `topK` (deprecated 2026-07-21); `thinkingBudget: 0` is a 400 on 3.x; `MEDIA_RESOLUTION_ULTRA_HIGH`
  is a 400 on flash-lite; a model listed by `models.list()` can still 404, so probe before trusting.
  The resolved model is cached at module scope because resolution costs a real request against a
  5-per-minute budget.

---

## 6. Task #46 — Layers panel. Start here.

### 6.1 Scope

The document format **already supports** multiple layers per frame
(`Frame = { ms: number; layers: Layer[] }`, `Layer = { n: string; px: Uint8Array; hidden?: boolean }`).
The renderer already draws all of them bottom-to-top and honours `hidden`.

What does not exist: any way to *have* more than one, or to choose which one you are painting on.

**Deliverable:** an active-layer concept, a layer panel, tools that write to the active layer, and
registry actions so the agent gets the capability for free.

### 6.2 The hard part, and it is not the UI

There are **14 places that hardcode `layers[0]`**, and three of them are load-bearing invariants:

```
lib/artwork-core/commands.ts:53,62   ← applyCommand / invertCommand   ⚠ undo correctness
lib/artwork-core/diff.ts:33,34       ← diff()                          ⚠ AI diff + session collapse
lib/artwork-core/ops.ts:171          ← applyOps                        ⚠ every AI operation
lib/ai/context.ts:151                ← what the model reads
lib/actions/catalogue.ts:114,143,423 ← get_grid, get_region, clear_layer
components/Canvas.tsx:143,175,195,241,437
```

**`commands.ts` and `diff.ts` are the risk.** A paint command that does not record *which* layer it
touched cannot be inverted correctly once a second layer exists — undo would write pixels back to
the wrong layer. This is a **format/command-schema decision**, not a UI one, and it must be settled
in the sub-spec before any UI is written.

Suggested shape (validate it yourself, do not just accept it): add `layer: number` to `PaintCommand`
and `AiEditCommand`, defaulting to 0 when absent so existing persisted drafts still load. `parseDoc`
must keep accepting documents without it — **rule 7, never silently discard artwork**.

### 6.3 Sub-spec must cover

- Command schema change + migration for drafts already in IndexedDB.
- Active-layer state: where it lives, what happens when the active layer is deleted, what happens
  when the frame changes (task #47 will interact with this — leave a note, do not build it).
- Panel: add, delete, duplicate, reorder, rename, show/hide, select. Opacity **only if** the format
  and renderer support it without a format change — otherwise say so and leave it out.
- Deleting the last layer must be impossible (`layers.min(1)` is already in the zod schema).
- Registry actions: `add_layer`, `select_layer`, `set_layer_visible`, `delete_layer` (destructive →
  requires confirmation), and `get_state` must report the layer list and which is active.
- `clear_layer` currently clears `layers[0]`; it must clear the active one.
- Where the panel lives at each of the 4 responsive tiers.
- Test requirements — be specific, the way `docs/specs/12-agent-actions.md §10` is.

### 6.4 Implementation order that de-risks it

1. Command schema + `applyCommand`/`invertCommand`/`diff`/`applyOps` take a layer index. **Tests
   first** — an undo that writes to the wrong layer is silent corruption.
2. Store: active layer, and every `layers[0]` in `Canvas.tsx` becomes the active index.
3. Registry actions + declarations.
4. Panel UI, tokens only, all 4 tiers.
5. Score.

### 6.5 Definition of done

`npm test` green · `npm run typecheck` clean · `npm run build` clean ·
`npx tsx tools/check-responsive.ts` clean · a draft saved before the change still opens ·
undo across two layers verified by test · score ≥ 9 with an honest table.

---

## 7. Tasks #47, #48, #23

### #47 — Animation timeline and frames

Format already supports `frames[]` with per-frame `ms`. Needs frame navigation in the store, a
timeline strip (add, duplicate, delete, reorder, set duration), playback, onion skinning if cheap,
and registry actions. **Interacts with #46** — do layers first and leave the frame/layer interaction
noted rather than half-built. Animated export is out of scope for that unit.

### #48 — Share via Supabase snapshots

Publish a read-only snapshot to a short URL, **no login** (there are no accounts, by rule).
Supabase project is already provisioned and there is MCP access to the account. Needs schema + RLS
allowing anonymous insert and public read, a POST route, a `/s/[id]` viewer page, and the Share
button wired. **Think hard about the abuse surface** — an unauthenticated public insert needs a rate
limit and a size cap, and the user should be told what "share" means before their artwork leaves the
browser.

### #23 — AI edit quality (Phase 6, deferred)

Phase 0 failed its gate **0/9** and the user rejected every output. Re-tested last session after the
agent loop landed and at 32×32 (the top-ranked hypothesis): `"give the face a hat"` produced a
recognisable, correctly-placed hat that damaged nothing — see `docs/PHASE-0-FINDINGS.md` and
`docs/shots/probe-ai-result.png`.

**Honest state:** a pass on what failed, not a pass on quality. Still flat and unshaded. The
remaining gap is model capability, not engineering. The user's standing call is *"focus on
toolcalling and that working rather than the actual output… if it can modify that's enough"*, so
**do not sink time here unless asked.**

---

## 8. Decisions already settled — do not relitigate

- **No accounts, no login** to use any functionality.
- **2 free AI tries per browser**, then bring-your-own-key. The counter is `localStorage` and is
  **deliberately bypassable** — "i need courtesy… i just put a general barrier at the start".
  Hardening it would mean fingerprinting or accounts. Do not harden it.
- **User keys** go in `localStorage`, are sent as `x-api-key` per request, used once and discarded.
  Never logged, never persisted. The UI must keep saying so.
- **Visual identity is direction 2.B "Mosaic"** (`docs/specs/13-visual-identity.md`). Chosen by the
  user from three costed options.
- **`--accent` is a state colour only** — focus, active tool, loaders. The primary-action fill is
  `--solid`/`--onsolid` (white-on-black / black-on-white), by explicit user request.
- **`--art-bg` is flat white in both themes.** Spec 13 §2.A says otherwise and is wrong; the
  correction is recorded in that file. Transparent pixels are the ground arbitrary user colours are
  judged against.
- **Scale: artwork first.** The chrome 1.1× pass is done. Do not grow chrome further without asking.
- **Model is `gemini-3.1-flash-lite`.** 5 requests/minute is the binding limit and one agent session
  is ~5 requests, i.e. about a minute of the whole project's budget.

---

## 9. Commands

```bash
npm run dev                       # localhost:3000
npm test                          # vitest — 165 tests
npm run typecheck
npm run build                     # rm -rf .next first if a dev server has been running

npx tsx tools/check-responsive.ts # overflow + target size at 5 viewports; exits non-zero
npx tsx tools/probe-tools-ui.ts   # drives every tool with real pointer events
npx tsx tools/e2e-agent.ts        # agent flow end to end (wants AI_PROVIDER=mock)
npx tsx tools/probe-agent.ts "make it angrier" 32   # live model, real quota, optional canvas size
npx tsx tools/render-probe.ts     # render the last probe result to a PNG and LOOK at it
npx tsx tools/shoot.ts            # screenshot the running app
npx tsx tools/gen-icon.ts         # regenerate app/icon.svg from the logo sprite
```

Probes marked *live model* spend real quota against a 5-per-minute limit. Use them deliberately.

---

## 10. Repo map

```
app/
  globals.css          all design tokens — the ONLY place colours are declared
  layout.tsx           Geist + Geist Mono, theme resolved before paint
  page.tsx             mounts the editor after hydration (see §5)
  icon.svg             GENERATED from the logo sprite by tools/gen-icon.ts
  api/ai/edit/         single-shot proposal route (superseded by the agent, still tested)
  api/ai/agent/        the agent gateway — holds the key, prompt and declarations
components/
  Canvas.tsx           pointer input, all 8 tools, wheel handling
  Chrome.tsx           top bar, tool rail, zoom bar, File menu, palette, dither menu
  AgentPanel.tsx       composer, step log, confirm, completion, BYOK modal
  Loaders.tsx          the two pixel loaders + elapsed counter
  icons.tsx            GENERATED by tools/gen-icons.ts — 23 Phosphor icons
lib/
  artwork-core/        document model. imports nothing but zod. no React.
  renderer/            canvas drawing + sprite→SVG. pure.
  editor/              viewport, brush masks, dither, breakpoints
  actions/             the 21-action registry — one definition per capability
  agent/               loop, session, prompt, limits, BYOK
  ai/                  context, prompt, schemas, validator, provider adapter
  store/               zustand. ctx.ts is the ONE bridge from stores to actions.
  persist/             IndexedDB
docs/
  SPEC.md              index + global rules
  WORKFLOW.md          the loop and the scoring rubric
  HANDOFF.md           this file
  PHASE-0-FINDINGS.md  the 0/9 gate failure and the re-test
  specs/01..13         sub-specs. 12 = agent, 13 = visual identity.
  research/            measured newt data + the UI audit
tools/                 probes, screenshots, generators. not shipped.
```

**Two files are generated — never hand-edit:** `components/icons.tsx`, `app/icon.svg`.

---

## 11. Debt and known-imperfect things

Recorded so they are not rediscovered as surprises.

- `docs/specs/02-design-system.md` §3 is marked superseded and now points at the real token source.
  The rest of that file has not been audited against what shipped.
- `lib/store/ai.ts` and `/api/ai/edit` are the superseded single-shot path. Still tested and
  working; `Canvas.tsx` still reads `useAiStore` for a review state that no longer occurs. Harmless,
  but it is dead weight — remove it as a deliberate unit, not incidentally.
- The artwork's empty margin can sit under the agent panel at the bottom-left. Chrome-derived
  asymmetric margins are specced in `13 §4` and not built; shrinking the canvas was judged worse
  than the overlap.
- `tools/` has ~28 probe scripts, several one-shot. Worth a cull at some point.
- The E2E script passed against the **live** provider because a dev server was already running with
  a real key. The assertions are behaviour-level so they are valid, but the mock path was not
  exercised in that run. Run it with `AI_PROVIDER=mock` on a fresh server to be sure.

---

## 12. How to talk to this user

Observed preferences, worth matching:

- They spot real problems and report them precisely — "only the horizontal pixel lines are visible",
  "2 finger scrolling it zoomed too much". **Every such report last session was a genuine bug.**
  Investigate before explaining.
- They value honesty over polish. Saying "this failed, here is the evidence" landed better than any
  hedge. The 0/9 gate is recorded in the repo permanently.
- They want progress, not permission — but they *do* want to choose direction. Costed options with
  a recommendation worked well; open-ended "what do you think?" did not.
- Keep the task list current. They read it.
- Commit messages: prose, explain *why*, no bullet-point soup, **no AI attribution ever**.
