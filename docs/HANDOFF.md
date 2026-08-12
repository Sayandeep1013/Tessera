# Session handoff — Tessera

**Written:** 12 Aug 2026, end of session.
**Repo:** https://github.com/Sayandeep1013/Tessera · branch `main` · last commit `9065da9`
**Live:** https://tessera-brown-pi.vercel.app — Vercel project `tessera`, git-connected to `main`,
so every push deploys. **`GEMINI_API_KEY` is not set there**, so the live site is BYOK-only until it
is added in the dashboard.
**State:** everything green, committed and pushed. 269 tests across 18 files, production build
clean, 6 measured viewports clean, and five browser probes green: `probe-layers` 42/42,
`probe-tooltip` 23/23, `probe-agent-ui` 18/18, `probe-tools-ui`, `check-responsive`.

---

## 0. The prompt to start the next session with

Paste this verbatim:

> Read `docs/HANDOFF.md` and continue the work.
>
> Start with task **#47 — Phase 4: Animation timeline and frames**. Follow the working loop in §3 of
> the handoff: scope → sub-spec → self-review the spec → implementation plan + task list → build →
> score across six dimensions taking the lowest as the overall, and iterate until ≥ 9/10. Do not
> inflate the score.
>
> Read `docs/specs/14-layers.md §9` first — layers landed last session and that section is the note
> it left for you about where frames and layers touch.
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
| Responsive | 4 tiers (mobile/tablet/compact/wide), all 6 measured viewports clean (320 was added this session and found a real overflow). |
| Visual identity | "Mosaic" — tiles, one accent from the product's own palette, Geist Mono numerals, two pixel loaders. |
| AI agent | 25 actions, registry-driven, look-act-verify loop, session collapse to one undo, BYOK. **Scored 9/10.** |
| Layers | Active-layer state, 6 layer commands, the panel (add/copy/delete/reorder/rename/hide/select), 4 registry actions. **Scored 9/10** — see §6. |
| Feedback and input | Honest agent outcomes, a capped agent panel, our own tooltip component, proportional zoom buttons. **Scored 9/10** — `docs/specs/15-feedback-and-input.md`. |
| Persistence | IndexedDB autosave. |

### Not built

| Control | Why it's dead |
|---|---|
| **Timeline** button | Feature not built → **task #47, next** |
| **Share** button | Needs Supabase backend → task #48 |

These two are hidden below 1100px width already (`showUnbuilt` in `lib/editor/breakpoint.ts`), so
a dead control never costs a live one its place. When you build one, flip it on there — Layers now
sits in `showLayers` instead, which is `tier !== 'mobile'`.

### Open tasks

- **#47 Phase 4: Animation timeline and frames** ← start here, see §7
- **#48 Phase 4: Share via Supabase snapshots** ← chosen as the next feature after this one
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
| **Port 3000 belongs to somebody else** | A *different* project (`D:\Projects\MubiTracker`) was on 3000 this session. Every probe went to it, got a 307 to `/login`, and failed with "waiting for locator('canvas')" — which reads exactly like a broken app. | `Get-NetTCPConnection -LocalPort 3000` and check the command line before assuming it is yours. Do not kill it. Run on another port and set `APP_URL`: `APP_URL=http://localhost:3100 npx tsx tools/probe-layers.ts`. `probe-layers`, `probe-tools-ui`, `check-responsive` and `shoot` all honour it. |

### Application

- **Undefined CSS custom properties fail silently.** No warning, no throw, no typecheck error — they
  resolve to nothing. Eight had accumulated in one panel. `lib/__tests__/tokens.test.ts` guards this
  now; keep it passing.
- **React registers `wheel` listeners as passive**, so `preventDefault` from an `onWheel` prop is
  ignored. Use a native listener with `{ passive: false }`.
- **`getByTitle` no longer works.** Tooltips are ours now (`components/Tooltip.tsx`) and no
  component renders a native `title`, so every probe locator moved to
  `getByRole('button', { name })`. A test in `lib/__tests__/tooltips.test.ts` fails if a `title`
  comes back — two tooltips stacked is worse than either alone.
- **A button with visible text must not be given an `aria-label`.** Adding one to the layer panel's
  `Add`/`Copy`/`Delete` overrode the name a user can see, and `getByRole({ name: 'Add' })` stopped
  matching. The visible text is already the accessible name.
- **A Playwright drag must use artwork coordinates, not element coordinates.** The canvas fills the
  whole area below the header and the artwork is centred inside it, so `box.x + 40` is *outside the
  document* and `onPointerDown` returns at its `isInside` guard. The stroke silently does nothing and
  the probe reports the feature as broken. Always go via `box.x + box.width / 2`. This cost an hour
  chasing a `Canvas.tsx` ordering bug that did not exist.
- **An accessible name comes from text content, not `title`.** `getByRole('button', { name: 'Add a
  layer above this one' })` times out against a button whose label is `Add`. And prefer
  `exact: true` — `{ name: 'Layer 2' }` also matches the eye button labelled "Hide Layer 2", which
  is a strict-mode violation rather than a wrong click, so at least it fails loudly.
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

## 6. Task #46 — Layers. Done, scored 9/10.

Sub-spec: `docs/specs/14-layers.md`. Read it rather than this section if you are changing layers;
this is the summary and the honest score.

### 6.1 What shipped

- **Command schema.** `layer: number` is now **required** on `paint` and `ai_edit`. Required, not
  optional-with-a-default, deliberately: the compiler then enumerated every construction site
  instead of letting one silently keep writing to layer 0.
- **Six new commands** — `layer_add`, `layer_delete`, `layer_move`, `layer_rename`, `layer_visible`,
  and `batch`. Each is its own inverse-table entry; `docs/specs/14-layers.md §2` is that table.
- **`lib/artwork-core/layers.ts`** — `MAX_LAYERS = 16`, `compositeAt`, `clampLayer`, `nextLayerName`,
  `cleanLayerName`.
- **Store.** `useDocStore.layer` + `setLayer`. `commit`, `undo` and `redo` all run `clampLayer`, so
  there is one guard on every write path rather than one per caller.
- **Canvas.** All five `layers[0]` sites use the active index. The eyedropper samples the
  **composite**, not the active layer — sampling the active layer returns transparent whenever the
  pixel under the cursor belongs to another layer, which reads as the tool being broken.
- **Panel** (`components/Layers.tsx`): add, copy, delete, move up/down, double-click to rename,
  eye to hide, click to select. Wide/compact 248px, tablet 224px, withheld on mobile.
- **Four registry actions** — `add_layer`, `select_layer`, `set_layer_visible`, `delete_layer`
  (destructive, so it needs confirmation). `get_state` reports the layer list and the active index.

### 6.2 Two things found on the way, both pre-existing

1. **`invertCommand('ai_edit')` dropped the pixel inverse** whenever the edit added a palette entry —
   it returned the palette pop *instead of* the paint, not as well as. Undoing such an edit left the
   pixels applied. That is silent artwork corruption and it was already shipped. The `batch` command
   exists because of it. Pinned by a test that serialises and reparses the undone document.
2. **The tool rail overflowed at 320px.** Eight 44px buttons need 364px; the rail had
   `overflowX: auto`, so eyedropper and gradient were scrolled off behind an affordance touch devices
   never draw. Found only because this unit added 320×568 to `check-responsive.ts`. Fixed by wrapping.

### 6.3 Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | Everything in `14-layers.md` is built. Opacity, blend modes, merge/flatten and the mobile panel are **declared out of scope in §1**, not dropped. |
| 2 | Correctness | 9 | L-E1..L-E8 all handled and tested. The coarse edge: a multi-layer agent session collapses to `replace_doc` rather than a layer-aware `ai_edit` — correct and tested, but a whole-document undo entry. |
| 3 | Tests | 9 | 253 pass. §8.1–8.9 all covered, plus a 42-check UI probe. The probe needs a running server, so it is not in `npm test` — true of every probe here, but it means panel *wiring* has no CI guard. |
| 4 | Integration | 9 | artwork-core still imports only zod; `commit()` still the only writer; `ctx.ts` still the one bridge; tokens only. One new surface: the dev-only `window.__tessera` read hook, now pinned out of the production bundle by a test. |
| 5 | Design fidelity | 9 | Panel matches `14-layers.md §6` to the measurement, verified by screenshot in both themes, 6 viewports clean. |
| 6 | No regressions | 9 | Full suite, build, `probe-tools-ui`, `check-responsive` all green — and two pre-existing defects are gone. |

**Overall: 9/10.**

### 6.4 Deliberately left out

- **Opacity and blend modes.** Both need a format change (`Layer` has no `o`/`mode` field) and the
  renderer composites with `drawImage`. That is its own unit, not a corner of this one.
- **Merge and flatten.** Easy to add as commands; left out because the panel already carries six
  controls and there was no ask.
- **Per-frame layer divergence.** Layers are per-frame in the format, so adding a layer to frame 0
  does *not* add it to frame 1. There is only one frame today, so it cannot bite — but **task #47
  must decide this deliberately**. `docs/specs/14-layers.md §9` is the note.
- **The mobile panel.** 390px has no room for a 224px panel beside the artwork; it needs a sheet, and
  a sheet is a component this repo does not have.

---

## 7. Tasks #47, #48, #23

### #47 — Animation timeline and frames ← next

Format already supports `frames[]` with per-frame `ms`. Needs frame navigation in the store, a
timeline strip (add, duplicate, delete, reorder, set duration), playback, onion skinning if cheap,
and registry actions. Animated export is out of scope for that unit.

**Settle this in the sub-spec before any UI.** Layers are **per-frame** — `frames[0].layers` and
`frames[1].layers` are independent arrays — so "add a layer" becomes ambiguous the moment a second
frame exists. `docs/specs/14-layers.md §9` lists the three questions it deliberately left open:

- Does adding a layer add it to **every** frame or only the current one? The format permits
  divergence; a timeline that shows layers as rows does not.
- What does the active layer become when the frame changes? `commit` already clamps, so the failure
  mode is a silently-moved selection rather than a crash — but "clamped" is not "correct".
- Should `sameLayerShape` compare across all frames (it does today) or only the active one? The
  strict version is what makes the agent session fallback safe; the loose version may be wanted once
  frames can legitimately differ.

There is a second, cheaper trap: **`frame` and `layer` are already two pieces of store state that
every command carries.** Do not add a third. If you find yourself threading a frame index through
call sites by hand, that is the signal the store should own it.

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
- **`--art-bg` follows the theme** — `#1e1e22` dark, `#ffffff` light, i.e. spec 13 §2.A as
  originally written. It was flat white in both themes for a while; the user asked for it to match
  the theme and that is now the settled answer. Three tokens move with it (`--grid-ink`,
  `--art-edge-*`, `--art-grid`) — the note in spec 13 §2.A explains why each one is not optional.
- **The editor opens on a blank canvas**, not the face starter. The starters are File → Example.
- **Scale: artwork first.** The chrome 1.1× pass is done. Do not grow chrome further without asking.
- **Model is `gemini-3.1-flash-lite`.** 5 requests/minute is the binding limit and one agent session
  is ~5 requests, i.e. about a minute of the whole project's budget.

---

## 9. Commands

```bash
npm run dev                       # localhost:3000 — see §5, it may not be free
npm test                          # vitest — 253 tests (3 skip without a .next build)
npm run typecheck
npm run build                     # rm -rf .next first if a dev server has been running

npx tsx tools/check-responsive.ts # overflow + target size at 6 viewports; exits non-zero
npx tsx tools/probe-tools-ui.ts   # drives every tool with real pointer events
npx tsx tools/probe-layers.ts     # 42 assertions on the layer panel, both themes
npx tsx tools/probe-tooltip.ts    # tooltip appears, places, dismisses; both themes
npx tsx tools/probe-agent-ui.ts   # agent panel geometry + outcome wording (wants AI_PROVIDER=mock)
npx tsx tools/probe-zoom.ts       # measures the zoom gesture; run it before changing zoom
npx tsx tools/check-quota.ts      # is the Gemini key alive? one request, prints no secrets
npx tsx tools/e2e-agent.ts        # agent flow end to end (wants AI_PROVIDER=mock)
npx tsx tools/probe-agent.ts "make it angrier" 32   # live model, real quota, optional canvas size
npx tsx tools/render-probe.ts     # render the last probe result to a PNG and LOOK at it
npx tsx tools/shoot.ts            # screenshot the running app
npx tsx tools/gen-icon.ts         # regenerate app/icon.svg from the logo sprite
```

Probes marked *live model* spend real quota against a 5-per-minute limit. Use them deliberately.

The browser probes need a dev server. They default to `localhost:3000` and honour `APP_URL`:

```bash
npx next dev --turbopack -p 3100
APP_URL=http://localhost:3100 npx tsx tools/probe-layers.ts
```

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
  Layers.tsx           the layer panel
  AgentPanel.tsx       composer, step log, confirm, completion, BYOK modal
  Loaders.tsx          the two pixel loaders + elapsed counter
  icons.tsx            GENERATED by tools/gen-icons.ts — 26 Phosphor icons
lib/
  artwork-core/        document model. imports nothing but zod. no React.
  renderer/            canvas drawing + sprite→SVG. pure.
  editor/              viewport, brush masks, dither, breakpoints
  actions/             the 25-action registry — one definition per capability
  agent/               loop, session, prompt, limits, BYOK
  ai/                  context, prompt, schemas, validator, provider adapter
  store/               zustand. ctx.ts is the ONE bridge from stores to actions.
  persist/             IndexedDB
docs/
  SPEC.md              index + global rules
  WORKFLOW.md          the loop and the scoring rubric
  HANDOFF.md           this file
  PHASE-0-FINDINGS.md  the 0/9 gate failure and the re-test
  specs/01..14         sub-specs. 12 = agent, 13 = visual identity, 14 = layers.
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
- **Panel wiring has no CI guard.** `tools/probe-layers.ts` is thorough — 42 assertions — but it
  needs a running dev server, so `npm test` does not run it. A Duplicate button rewired to the add
  handler would pass the whole suite. True of every probe here; it is the reason to run them.
- **A multi-layer agent session collapses to `replace_doc`**, not to a layer-aware `ai_edit`. Correct
  and tested, and it reuses an escape hatch that already existed rather than inventing a multi-layer
  command — but the undo entry is the whole document. Worth revisiting only if the agent starts
  working across layers routinely.
- **`components/Layers.tsx` has no outside-click closer**, deliberately: the panel is a working
  surface you click away from constantly. Escape and the toolbar button close it. If that turns out
  to be wrong, the fix is `mousedown`, never `click` — see §5.

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
