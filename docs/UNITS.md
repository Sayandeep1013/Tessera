# The unit ledger

**This file is the source of truth for what is done and what is next.**
It is written to be read by the next agent with no human in the loop.

If you are an agent starting a session: read §0, then find the first unit whose
status is `NEXT`, then paste-follow the prompt in its block. Do not ask which
unit to do — the ledger says.

---

## 0. The protocol — read this before anything else

### Starting

1. Read `CLAUDE.md`, then `docs/HANDOFF.md §5` (traps — every one has already
   cost this repo an hour), then this file.
2. Find the first unit marked `NEXT`. That is your unit. There is exactly one.
3. Follow its prompt block. Its spec is linked; read that too.
4. Work the loop in `docs/WORKFLOW.md`: scope → sub-spec → build → score across
   six dimensions taking the **lowest** as the overall → iterate until ≥ 9.

### Finishing — do all of this, in this order, before you stop

This is the part that keeps the chain unbroken. A unit is not done when the code
works; it is done when the next agent can start without asking anything.

1. **Verify.** `npm test` · `npm run typecheck` · `npm run build` ·
   `npx tsx tools/check-responsive.ts` · the probes your unit touched. All green.
2. **Look at it.** Screenshot both themes and actually read the image. Measured
   and looked-at are different checks and this repo has been caught by both.
3. **Score honestly** in the unit's block below. Six dimensions, overall is the
   lowest. Do not inflate — scoring the agent unit at 5 once found three real
   gaps.
4. **Update this file:**
   - Set your unit to `DONE`, with the date, the commit, and the score.
   - Set the next unit to `NEXT`.
   - Fill in that unit's **Context handed over** section — what you learned that
     it needs. Not a summary of your work; the specific things that will
     otherwise be rediscovered the hard way.
   - Add any new trap to `HANDOFF.md §5`.
5. **Update `docs/HANDOFF.md`** — the state line at the top, and §0's prompt.
6. **Commit and push.** Prose message, explain *why*, and **no AI attribution of
   any kind** (`CLAUDE.md` rule 1 — this is absolute).

### The rules that override anything you think is a better idea

`CLAUDE.md` has ten. The four that get broken by accident:

- **Rule 1** — never a `Co-Authored-By` trailer, never "Generated with", never a
  tool name in a commit message.
- **Rule 4** — every document mutation goes through `commit(cmd)`. Nothing else
  writes the document. This is what makes undo trustworthy.
- **Rule 8** — colours come from tokens in `globals.css`. No hex in `.tsx`.
- **Rule 10** — when a spec turns out to be wrong, **say so and fix the spec**.
  Do not route around it. This has happened seven times and every correction is
  recorded in the spec itself. It is a feature of how this repo is built.

---

## 1. State, at a glance

| | Unit | Status | Score | Spec |
|---|---|---|---|---|
| — | Document model, renderer, 8 tools, chrome, agent | DONE | 9 | 01–13 |
| — | Layers phase 1 | DONE | 9 | [14](./specs/14-layers.md) |
| — | Feedback and input (agent honesty, tooltips, zoom) | DONE | 9 | [15](./specs/15-feedback-and-input.md) |
| — | Settings panel (theme, grids, symmetry) | DONE | 9 | [16](./specs/16-settings.md) |
| **A1** | Resize transform + command | **DONE** | 9 | [16 §4](./specs/16-settings.md) |
| **A2** | Canvas tab size UI | **NEXT** | — | [16 §4.1](./specs/16-settings.md) |
| **B1** | File menu, Examples, Duplicate, Clear | TODO | — | [17](./specs/17-file-menu.md) |
| **B2** | Open recent | TODO | — | [17 §2](./specs/17-file-menu.md) |
| **B3** | Paste image | TODO | — | [17 §2](./specs/17-file-menu.md) |
| **C** | Code panel | TODO | — | [07](./specs/07-code-panel.md) |
| **D** | Exporters ×6 | TODO | — | [08](./specs/08-exporters.md) |
| **E** | Layers phase 2 | TODO | — | [14 §6.4](./specs/14-layers.md) |
| **F** | Animation | TODO | — | [10](./specs/10-animation.md) |
| — | Share | **PARKED** | — | [DEFERRED](./DEFERRED.md) |
| — | AI edit quality | **DEFERRED** | — | [HANDOFF §7](./HANDOFF.md) |

**Out of scope permanently, do not build:** accounts, profiles, Explore,
publish-to-community, likes, comments, feeds. `SPEC.md §0`, confirmed by the
user 12 Aug 2026.

---

## A1 — Resize transform and command · DONE

**12 Aug 2026 · `e4ffa2c` · 9/10**

`lib/artwork-core/resize.ts` — `resizeDoc`, `resizeOffset`, `pixelsLostOnResize`.
19 tests in `lib/artwork-core/__tests__/resize.test.ts`.

**Two bugs the tests caught**, both worth knowing because the same shape recurs:
`Math.floor` is not an odd function, so grow and shrink were not inverses and the
artwork walked a pixel per round trip; then `Math.trunc(-0.5)` is `-0`, which is
not `0` under `Object.is`. The fix is `((to - from) / 2) | 0`.

**Spec corrected while building:** §4.2 asked for a new command carrying
`prev: Uint8Array[]`. A `resize` command already existed carrying whole
before/after documents — strictly safer, already tested. Only the transform was
missing.

---

## A2 — Canvas tab size UI · NEXT

### Context handed over

- **The hard part is already done and tested.** `resizeDoc(doc, w, h)` and
  `pixelsLostOnResize(doc, w, h)` exist and are covered by 19 tests. The
  `resize` command already existed in `commands.ts` and inverts by swapping
  whole documents, so undo across a destructive crop already works. **This unit
  is wiring, not algorithm.**
- The panel is `components/Settings.tsx`; the Canvas tab currently renders a
  placeholder that says resizing is not built. Replace that, and delete the
  placeholder text.
- `Segmented` in `components/Segmented.tsx` is **not** the right control here —
  the presets are a 3×3 grid of independent buttons, not one-of-N with a roving
  tabindex. Do not force it.
- Commit through `useDocStore.commit()` with `{ type: 'resize', label, before,
  after }`. Nothing else writes the document.
- Measured layout is in `16 §4.1`, from
  `docs/research/newt/shots/settings-canvas-tab.png`. Look at that image.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/16-settings.md §4`, then build unit **A2**:
> the Canvas tab's size UI.
>
> A 3×3 grid of preset buttons (16, 32, 64, 128, 256, 16:9, Banner, Portrait,
> Custom), paired W×H number inputs, and an apply button that shows the pending
> size — `32×32`, not the word "Apply" — and is disabled while it equals the
> current size. Clicking a preset fills the inputs; typing in the inputs selects
> Custom; nothing resizes until apply is pressed. When a shrink would destroy
> painted pixels, say how many before it happens (`pixelsLostOnResize`, error
> code S-E2).
>
> `resizeDoc` and the `resize` command already exist and are tested — this is
> wiring. Commit through `useDocStore.commit()`.
>
> Verify with `npm test`, `npm run typecheck`, `npm run build`,
> `npx tsx tools/check-responsive.ts`, and screenshot the panel in both themes
> and look at it. Then follow the finishing protocol in `docs/UNITS.md §0`.

### Done when

A dot at the centre of 16×16 is still centred after resizing to 32×32, seen on
screen; a shrink that would crop reports the count before it happens; `⌘Z`
restores a cropped document exactly; six viewports clean.

---

## B1 — File menu · TODO

### Context handed over

- Spec `17-file-menu.md` is written and the account items are already excluded —
  do not add Dashboard, Explore or publish-to-community.
- The menu lives in `components/Chrome.tsx`, in the logo button's popover.
- **Clear must go through `commit`** as a paint command across the frame's
  layers, so `⌘Z` restores it. New… replaces the document and therefore cannot
  be undone — that is why it confirms instead.
- `listStarters()` already returns `['face', 'bird']`; the Examples submenu
  should read from it rather than hard-coding.
- Outside-click closers use `mousedown`, never `click` — `HANDOFF §5`.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/17-file-menu.md`, then build unit **B1**:
> the File menu structure, the Examples submenu, Duplicate, and Clear.
>
> No account items — Dashboard, Explore and publish-to-community are out of
> scope permanently. Clear empties the frame through `commit` so it is undoable,
> is red, and confirms. New… confirms when the document has painted pixels,
> because it replaces the document and cannot be undone. Duplicate forks to a
> new draft with a fresh id.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## B2 — Open recent · TODO

### Context handed over

- **`listDrafts()` already exists in `lib/persist/idb.ts` and nothing calls it.**
  Every document the user has ever autosaved is sitting in IndexedDB
  unreachable. This is a rule-7 problem hiding in plain sight, and it is the
  reason this unit matters more than its size suggests.
- A corrupt record must be shown disabled and **kept**, never deleted.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/17-file-menu.md §2`, then build unit
> **B2**: Open recent.
>
> `listDrafts()` exists and nothing calls it. Surface it as a submenu — newest
> first, capped at 10, name and relative date, a real empty state, and a record
> that no longer parses shown disabled rather than dropped.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## B3 — Paste image · TODO

### Context handed over

- **This is a real algorithm, not wiring.** Three stages, each able to fail
  visibly: clipboard read (needs a gesture and a permission, unavailable in
  Firefox), fit (nearest-neighbour into the current canvas, never resize the
  document), quantise (median cut to ≤ 36 colours, reusing existing palette
  entries where close enough).
- One `paint` command for the whole thing, so it is one undo.
- Report the colour count rather than pretending nothing was lost.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/17-file-menu.md §2`, then build unit
> **B3**: paste image. Treat it as its own unit; it is an algorithm, not wiring.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## C — Code panel · TODO

### Context handed over

- Spec `07-code-panel.md` predates everything built since. **Read it critically
  and correct it under rule 10** rather than implementing something stale.
- The document's `px` rows already **are** the text. The panel renders the
  document; it is never a second source of truth (rule 3).
- The loop guard is where the bugs live: text → document → text must not
  re-enter.
- `</>` is the button, currently in the `showUnbuilt` group in
  `lib/editor/breakpoint.ts`. Move it out when it works, as Layers and Share
  were.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/07-code-panel.md`, then build unit **C**:
> the code panel. Read the spec critically first — it predates layers, settings
> and the agent, and correcting it under rule 10 is part of the unit.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## D — Exporters · TODO

### Context handed over

- `spriteRects` in `lib/renderer/sprite-svg.ts` already merges runs and is
  already shared by the favicon and the share viewer. SVG and CSS build on it
  rather than re-walking pixels.
- **ASCII is nearly free** — the `px` rows are the ASCII. One line, and the best
  demonstration of the whole premise.
- Each exporter consumes `Doc` and nothing else; no exporter imports another.
- Exported React must be pixel-identical to the canvas — that is the Phase 3
  acceptance criterion.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/08-exporters.md`, then build unit **D**:
> SVG, CSS, React, ASCII, JSON and PNG exporters, with a golden test each.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## E — Layers phase 2 · TODO

### Context handed over

- The four things `14-layers.md §6.4` declared out of scope: opacity,
  merge/flatten, blend modes, drag reorder.
- **Opacity is a format change** — `01-document-format.md` moves with it, and
  every existing document must still parse. There is a legacy fixture at
  `lib/artwork-core/fixtures/legacy/` for exactly this.
- Blend modes need the renderer to composite per layer instead of painting
  straight through, which is the largest change in this unit.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/14-layers.md §6.4`, then build unit **E**:
> layers phase 2 — opacity, merge and flatten, blend modes, drag reorder.
> Opacity changes the format, so spec 01 moves with it and old documents must
> still parse.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## F — Animation · TODO

### Context handed over

- **Settle this first, in writing, before any timeline UI exists.** Layers are
  per-frame in the format, so "add a layer" is ambiguous once a second frame
  exists: this frame, or all of them? `14-layers.md §9` states the three open
  questions. Everything else in this unit is downstream of that answer.
- `frame_add`, `frame_delete` and `frame_duration` commands already exist in
  `commands.ts` and are unused.
- The Timeline button is the last member of `showUnbuilt`.

### Prompt

> Read `docs/UNITS.md`, `docs/specs/10-animation.md` and
> `docs/specs/14-layers.md §9`, then build unit **F**: animation.
>
> Before any UI: decide and write down whether a layer belongs to one frame or
> to all of them. That decision is load-bearing and cannot be retrofitted.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## Parked and deferred

**Share** — built, untested, switched off. `docs/DEFERRED.md`. Do not resume
without asking the user.

**AI edit quality** — the agent's toolcalling works; the output is not
artist-grade and that is model capability, not engineering. `HANDOFF §7`. The
standing instruction is to leave it alone.
