# Session handoff — Tessera

**Written:** 12 Aug 2026 · last commit `01ec4e1` (unit **B3** — Paste image) ·
branch `main`, pushed.
**Live:** https://tessera-brown-pi.vercel.app — Vercel project `tessera`,
git-connected to `main`, so every push deploys.
**Green:** 496 tests across 31 files · production build clean · 6 viewports
clean · and **every** browser probe in one run (`npm run probes`) —
`probe-file-menu` 134/134, `probe-canvas-size` 70/70, `probe-layers` 42/42,
`probe-tooltip` 23/23, `probe-agent-ui` 18/18, `probe-crisp` 4/4,
`probe-tools-ui`, `e2e-agent`, `probe-zoom`. Zero runtime errors.

---

## 0. Start here

If you are an agent opening this repo cold, this is the whole instruction:

> Read `docs/HANDOFF.md`, then `docs/UNITS.md`, and build the unit marked
> `NEXT`.

Everything else follows from those two files.

**[`docs/UNITS.md`](./UNITS.md) is the ledger.** It says what is done, what is
next, and carries a ready-to-use prompt for every remaining unit — **including
the next one, so it is not repeated here.** It also carries the finishing
protocol: what an agent must do before it stops, so the next one can start
without asking anything.

The next unit is **C — the code panel**. Its prompt is in `UNITS.md`, in the C
block, directly under "Context handed over".

> This section used to paste that prompt as well, and the copy went stale within
> one unit — it was still asking B2 to decide something B1 had already settled.
> One prompt, one place. If you find a second copy of anything here, delete it
> rather than syncing it.

Before writing code, read `CLAUDE.md` and **§5 of this file** (traps). Every
entry in §5 has already cost this repo an hour and none of them announce what
they actually are.

### The three documents, and which is which

| File | What it is for |
|---|---|
| [`UNITS.md`](./UNITS.md) | **What to do next.** The ledger, the per-unit prompts, the finishing protocol. |
| `HANDOFF.md` (this) | **What you need to know.** The traps, the settled decisions, the repo map, the debt. |
| [`DEFERRED.md`](./DEFERRED.md) | **What looks finished and is not.** Read before assuming a button works. |
| [`PLAN.md`](./PLAN.md) | Why the units are in the order they are. |

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
| Chrome | Top bar, tool rail, zoom bar, palette popover, File menu, dither menu. |
| File menu | Complete — it is now exactly the menu `17 §1` draws. New… (confirms when there is work at stake), Open recent, Open…, Paste image, Duplicate, an Examples disclosure, Download .tessera.json, Export PNG, and Clear — red, undoable, and it says its cost first. `⌘N`/`⌘O`/`⌘V`/`⌘S` wired. **Scored 9/10** three times — `17-file-menu.md §7`, `§8` and `§9`. |
| Paste image | Clipboard or file → fitted (box-average down, integer nearest-neighbour up, centred) → median-cut to ≤36 palette entries, reusing existing ones within a redmean distance of 24 → one undoable command. Reports the colour count. **Scored 9/10** — `17-file-menu.md §9`. |
| Status line | One `role="status"` notice, `useEditorStore.notice` / `setNotice(text, sticky?)`. 6s and click to dismiss; `sticky` for anything about work that could be lost. |
| Naming | The header input renames the document through `doc_rename`, on blur and on Enter. It used to display the name and silently discard what you typed. |
| Responsive | 4 tiers (mobile/tablet/compact/wide), all 6 measured viewports clean (320 was added this session and found a real overflow). |
| Visual identity | "Mosaic" — tiles, one accent from the product's own palette, Geist Mono numerals, two pixel loaders. |
| AI agent | 25 actions, registry-driven, look-act-verify loop, session collapse to one undo, BYOK. **Scored 9/10.** |
| Layers | Active-layer state, 6 layer commands, the panel (add/copy/delete/reorder/rename/hide/select), 4 registry actions. **Scored 9/10** — see §6. |
| Feedback and input | Honest agent outcomes, a capped agent panel, our own tooltip component, proportional zoom buttons. **Scored 9/10** — `docs/specs/15-feedback-and-input.md`. |
| Settings | Tabbed panel, theme tri-state, pixel-grid tri-state, transparency grid, symmetry, and the Canvas tab's size control — presets, W×H, an apply button labelled with the size it produces, and the crop count before the crop. **Scored 9/10** — `docs/specs/16-settings.md`. |
| Persistence | IndexedDB autosave. |

### Not built, and what is next

**[`UNITS.md`](./UNITS.md) is the authority on this** — it is kept current as
part of finishing a unit, and this section is not. In brief: the Code and
Timeline buttons are the last dead controls, Share is built but parked
(`DEFERRED.md`), and units C through F remain.

Dead controls live in `showUnbuilt` in `lib/editor/breakpoint.ts` and are hidden
below 1100px, so a dead control never costs a live one its place. When you build
one, move it out — Layers went to `showLayers`, Share to `showShare`.

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
- **Renaming a control breaks probes that have nothing to do with your unit.**
  B1 renamed `Example — face` to an `Examples` submenu, and `probe-layers` and
  `probe-zoom` both drove the File menu by that label to reach a known starting
  document. Neither mentions the File menu in its name or its purpose, neither
  is in `npm test`, and both failed only when actually run. **Two guards exist
  now, use them:** `lib/__tests__/probe-handles.test.ts` fails `npm test` if a
  probe names an `#id` the app no longer renders, and **`npm run probes`** runs
  every browser probe in one command so you never have to guess your blast
  radius. Prefer an `id` to a label as a probe handle — and for the File menu
  build it with `menuItemDomId` / `exampleDomId`, which also feed the guard's
  allow-list, so the two cannot drift.
- **`AI_PROVIDER=mock` has to be set on the DEV SERVER, not on the probe.** The
  agent runs server-side, so `AI_PROVIDER=mock npx tsx tools/probe-agent-ui.ts`
  sets it on the wrong process: the server still reads `.env.local`, still has a
  real key, and the probe quietly spends the 5-per-minute budget before failing
  on wording it never asked the model for. This wasted a run and some quota.
  `npm run probes` now **skips** those probes unless `MOCK_SERVER=1` says the
  server is in mock mode. The right invocation is at the top of `UNITS.md §0`.
- **`check-responsive.ts` never opens a popover.** It measures the app in its
  resting state, so a panel, menu or submenu can hang 66px off a 390px screen
  while all six viewports report clean — which is exactly what the Settings panel
  was doing until A2 opened it at 390 and 320 and measured the box. If your unit
  adds anything that appears over the app, it is not covered by the responsive
  check and you have to measure it yourself.
- **A "message or nothing" value must be `null`, not `''`.** `pendingSize`
  returns no text when a field is merely blank, and the panel decided whether to
  shout using `note !== null`; an empty string is not null, so clearing the width
  field replaced the helper line with a blank red paragraph. If a `??` chain
  feeds a nullish test, normalise with `|| null` at the boundary.
- **A synthetic `paste` event must be dispatched on `document.activeElement`, not on `window`.**
  `probe-file-menu` drives ⌘V by constructing a `ClipboardEvent` with a `DataTransfer`, which is
  the honest way to test it — the app listens for `paste`, not for a keydown. But dispatching on
  `window` makes `e.target` the window, which is not an `HTMLElement`, so the `isTyping` guard
  returns false for *every* paste and the "typing in the filename field" case silently cannot be
  tested. Dispatch on the focused element, as a real ⌘V does.
- **An LCG modulo a power of two has almost no entropy in its low bits.** A test generator using
  `(s * 1103515245 + 12345) % 2**31` and then `s % 200` produced **32** distinct colours out of 200,
  so a "reduce 200 colours" test was passing without ever reducing anything. Take the high bits:
  `Math.floor(s / 65536) % n`. Any test that generates data owes itself an assertion that the data
  is what it asked for — that is the only reason this was caught.
- **`Math.trunc(-0.5)` is `-0`, and `Object.is(-0, 0)` is false.** Already recorded for A1's resize
  offset; noted again because `fit-image.ts` reuses `resizeOffset` for exactly that reason and the
  next person to write a centring calculation will reach for `Math.floor`.
- **An interactive element must not carry `role="status"`.** A `<button role="status">` loses its
  button semantics, so a screen reader announces the text and never mentions it is clickable. Put
  the live region on a wrapper and the button inside it.
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

## 6. Layers phase 1 — done, 9/10. Kept for the two defects it found.

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

## 7. The remaining work, and the one thing that is deferred

Units A2–F, their order and their reasoning: **[`PLAN.md`](./PLAN.md)**.
Their status and their prompts: **[`UNITS.md`](./UNITS.md)**.
Share, built but switched off: **[`DEFERRED.md`](./DEFERRED.md)**.

**Do not build:** accounts, profiles, Explore, publish-to-community, likes,
comments, feeds. `SPEC.md §0` puts them out permanently and the user confirmed
it on 12 Aug 2026.

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
npm test                          # vitest — 496 tests (3 skip without a .next build)
npm run typecheck
npm run build                     # rm -rf .next first if a dev server has been running

# EVERY browser probe, one server, one command. This is the one to run.
AI_PROVIDER=mock npx next dev --turbopack -p 3100
MOCK_SERVER=1 APP_URL=http://localhost:3100 npm run probes

npx tsx tools/check-responsive.ts # overflow + target size at 6 viewports; exits non-zero
npx tsx tools/probe-tools-ui.ts   # drives every tool with real pointer events
npx tsx tools/probe-layers.ts     # 42 assertions on the layer panel, both themes
npx tsx tools/probe-canvas-size.ts # 70 checks on the Canvas tab: presets, crop count, undo, phones
npx tsx tools/probe-file-menu.ts  # 80 checks on the File menu: structure, submenu, confirms, phones
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
- ~~`openFile()` does not re-fit the viewport.~~ **Fixed in B1**, which owns that
  function. `refitViewport` after `setDoc`, one line, recorded in
  `17-file-menu.md §7.9`.
- ~~`New…` reuses the document's id.~~ **Fixed in B1's follow-up.** New,
  Examples and Duplicate all fork to a fresh id, so the previous drawing keeps
  its own draft — with a guard in `lib/agent/session.ts` so an agent session
  cannot silently drop the id change. `17-file-menu.md §7.11`.
- ~~The E2E script has never been exercised on the mock path.~~ **Done, and it
  did not pass.** It ignored `APP_URL`, and its `Stop` click raced the agent
  panel's aria-live log into a 30s timeout. Both fixed in B1's follow-up; it is
  in `npm run probes` now, so it stays exercised.
- ~~The header's filename input does not write back.~~ **Fixed in B2.** It
  renames through `doc_rename` on blur and on Enter, Escape reverts, and the
  placeholder is a placeholder rather than a value. `17-file-menu.md §8.1`.
- **`listRecent()` has no unit test.** It needs IndexedDB, which `npm test` does
  not have. The ordering, cap and corrupt-record handling are covered through
  `recentRows` (pure) and `probe-file-menu` (real browser), so the behaviour is
  held at both ends — but the function in the middle is only exercised by the
  probe. Same shape as every other persistence path here.
- **F-M5's first rung has never executed.** `lib/editor/clipboard.ts` falls back to a file picker
  when `navigator.clipboard.read()` is missing or refused, which is the Firefox case. Every probe
  here is Chromium, where `read()` exists, so that branch has run in neither CI nor a probe. Faking
  it with a stub would only prove the stub works; it needs a Firefox run, which this repo has never
  had. Same shape as `listRecent`: held at both ends and untested in the middle.
- **The decoded image is capped at 1024 on the long edge** (`MAX_SOURCE_EDGE`), so a 6000px photo is
  pre-reduced by the *browser's* resampler before the pure pipeline sees it. `fit-image` and
  `quantise` are deterministic given their input; the input for a very large image is not
  cross-browser identical. It removes a real `getImageData` failure and costs nothing measurable at
  a 256px destination, but "deterministic" has that footnote.
- **`pasteImageCommand` takes a fifth parameter that exists only because of the cap above** — the
  size the user actually copied, so the message does not quote our own plumbing back at them. It is
  documented at both ends and it is still coupling between a pure module and a browser one.
- **`openFile` is now the only thing that uses `window.alert`.** There is a status channel
  (`setNotice`) and every other failure path goes through it. Worth converting the next time
  something touches that function — not converted here, because B3 does not own it.
- **`copyName` has two import paths.** It lives in `lib/artwork-core/doc-name.ts`
  and `duplicate.ts` re-exports it, so nothing broke when it moved. Pick one
  when something next touches either file.
- **Four hand-built `ActionCtx` objects.** `lib/actions/__tests__/harness.ts`,
  `session.test.ts`, `run.test.ts` and `tools/probe-agent.ts` each construct one
  by hand. Adding a required field to `ActionCtx` means editing all four — which
  is how B1's follow-up found them. They should share the harness; left alone so
  that change did not also become an agent-test refactor.
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
