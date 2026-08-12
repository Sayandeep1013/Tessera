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
| **A2** | Canvas tab size UI | **DONE** | 9 | [16 §4.1](./specs/16-settings.md) |
| **B1** | File menu, Examples, Duplicate, Clear | **DONE** | 9 | [17](./specs/17-file-menu.md) |
| **B2** | Open recent | **NEXT** | — | [17 §2](./specs/17-file-menu.md) |
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

## A2 — Canvas tab size UI · DONE

**12 Aug 2026 · `3e06f6a` · 9/10**

`lib/editor/canvas-size.ts` (presets, parsing, the pending-size state machine,
the wording), the Canvas tab in `components/Settings.tsx`,
`lib/editor/refit.ts`, and `tools/probe-canvas-size.ts` — 26 unit tests and 70
browser checks across both themes and two phone widths.

**It was wiring, and the wiring is where both defects were.** Neither is an
algorithm bug and neither could have been found by a unit test of `resizeDoc`:

1. **`?? ` treated an empty message as a message.** `pendingSize` returns no text
   for a blank field, deliberately — backspacing over the width is mid-keystroke,
   not a mistake — and the panel decided "is there a note" with `!== null`. So
   the helper line became a blank red paragraph the moment a field was cleared.
   Found by the probe asserting the *helpful* text was still there, not by
   asserting the error was absent.
2. **The whole panel ran off a phone.** 256px anchored under a button 140px into
   the header is 66px off a 390 screen. Six viewports had been reporting clean
   for weeks, because `check-responsive.ts` never opens a popover. Spec §5 said
   to decide the mobile question by measuring; measuring is what found it.

**Three decisions the spec did not contain**, now written into `16 §4.1`: what
`Custom` does (focuses the width field — it is a derived state, not a size), that
the selected preset is derived from the fields rather than stored, and that the
view is re-fitted after a resize. The last is the one that would have hurt:
without it, growing 16×16 to 256×256 leaves the artwork off the corner of the
screen at the old scale, which reads as the resize having eaten it.

**Two spec corrections under rule 10**, both recorded in `16 §5` and `§6`: there
is no confirm dialog for S-E1/S-E2 and there should not be — the apply button is
already the second, deliberate press, and the count is on screen before it. And
the panel is not withheld on mobile; it spans the screen with an 8px inset,
because the thing that did not fit was its placement, not its content.

### Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | Every requirement in §4.1 is built. Three gaps in the spec were filled and two errors in it corrected, rather than routed around. |
| 2 | Correctness | 9 | S-E1 and S-E2 handled; centring, the promised crop count and byte-exact undo all verified against a real document. The coarse edge: `pixelsLostOnResize` counts canvas *positions*, so a 3-layer document losing the same cell three times says "1 pixel". That is the intended reading and A1 tested it, but the wording is doing some work. |
| 3 | Tests | 9 | 26 unit tests on the panel's decisions, 70 browser checks on its wiring. Still the repo-wide condition: the probe needs a dev server, so `npm test` cannot guard panel wiring. |
| 4 | Integration | 9 | `commit()` is still the only writer; artwork-core untouched; the new module imports only the schema and the transform; the viewport refit was extracted from `loadExample` rather than copied; tokens only. One new dev-only read on `window.__tessera`. |
| 5 | Design fidelity | 9 | Matches §4.1's measured layout, read in both themes, clean at six viewports plus two with the panel open. Radius is `--r-lg` rather than the reference's full pill — our identity is tiles, and that is a deliberate divergence rather than a miss. |
| 6 | No regressions | 9 | 327 tests, clean build, `probe-layers` 42/42, `probe-tools-ui`, `probe-tooltip`, `check-responsive` all green — and a mobile overflow that predates this unit is gone. |

**Overall: 9/10.**

### Deliberately left out

- **Arrow-key increment on the number fields.** Not specced, and `type="text"`
  gives it up. Worth adding if anyone asks for nudging a size by one.
- **`openFile()` still does not re-fit the view**, though `refitViewport` now
  exists and is one line. Same bug class, different unit; recorded in
  `HANDOFF §11` rather than fixed incidentally.
- **A typed-but-unapplied size is discarded** when the document's size changes
  underneath it (i.e. on undo). Deliberate: the panel remounts from the document,
  because a control offering 32×32 over a 16×16 document is a second source of
  truth for its size.

---

## B1 — File menu · DONE

**12 Aug 2026 · `PENDING` · 9/10**

`lib/artwork-core/clear.ts` (`paintedCellCount`, `clearFrameCommand`),
`lib/artwork-core/duplicate.ts` (`copyName`, `duplicateDoc`),
`lib/editor/file-menu.ts` (the menu as data, `needsNewConfirm`, both confirm
strings), a rewritten `FileMenu` in `components/Chrome.tsx`, and
`tools/probe-file-menu.ts` — 49 unit tests and 80 browser checks across both
themes and two phone widths. Corrections are recorded in `17-file-menu.md §7`.

**Three things in the spec were wrong and are now fixed there, not routed
around** (rule 10):

1. **`Examples ›` cannot be a flyout.** The menu is 232px anchored at x=12, so a
   flyout needing 160px ends at 404 — off a 390px phone — and flipping it left
   lands on its own parent. It is a disclosure that expands in place, one code
   path at every tier. §5's "Escape closes one level at a time" still holds and
   is still tested.
2. **New… *is* undoable.** §2 says it is not. `new_document` commits a
   `replace_doc` carrying the whole previous document, so Ctrl+Z restores the
   drawing exactly. What is not recoverable is a **reload** — the blank canvas
   keeps the same document id, autosave writes over the draft, and history is
   memory-only. The confirm says that and no more.
3. **§2's "the old drawing stays in recent" is not true today**, for the same
   reason. See the note handed to B2 below; the fix belongs there and is not
   safe here.

**Four decisions the spec did not contain**, all in §7: the shortcut column
shows `Ctrl S` only, because that is the only key wired and a hint is a promise;
Clear is *disabled* on an empty frame rather than confirming its way to a no-op;
both confirms are inline and replace the menu's body, because this repo has no
dialog component and B1 is not the unit to invent one; and Duplicate awaits
`flushSave()` before switching, without which a duplicate within 500ms of a
stroke saves the stroke to the *copy* and not to the original.

**The handover was wrong about `refitViewport` and measuring found it.** It said
New…, Examples and Duplicate all change the document's dimensions. Only Examples
does. New… is "at the current size" by §2, and a duplicate is the same picture —
re-fitting it would throw away the pan and zoom of somebody mid-detail-work and
buy nothing. Examples and New… re-fit because they are a *different artwork*;
Duplicate does not. §7.3 is the table.

**One debt item closed on the way:** `openFile()` now re-fits the viewport
(`HANDOFF §11`). It is one line, it is the same defect A2 fixed elsewhere, and
this is the unit that owns that function.

### Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | Every item in §6 step 1 is built, three spec errors corrected and seven gaps filled in §7. Not 10: the menu on screen is not yet the menu §1 draws — Open recent and Paste image are absent by §6's own ordering, and the shortcut hints §1 shows are withheld until step 3 wires the keys. |
| 2 | Correctness | 9 | F-M1 handled both ways; Clear is one batch, undoes byte-exactly, clears hidden layers and leaves other frames alone; Duplicate's flush-then-fork verified against real IndexedDB records. The coarse edge, stated rather than hidden: New reuses the document id, so the previous drawing does not survive a reload. The confirm says so; the fix is B2's, and §7.2 of this table says why it is not safe here. |
| 3 | Tests | 9 | 49 unit tests on the three new modules, 80 browser checks on the wiring, in both themes and at 390 and 320. Still the repo-wide condition: the probe needs a dev server, so `npm test` cannot guard menu wiring — which is exactly how the rename silently broke two unrelated probes. |
| 4 | Integration | 9 | `commit()` is still the only writer of the open document; `setDoc` is used only where `openFile` already used it, for "a different document is now open"; artwork-core still imports nothing but zod; the menu is data plus an exhaustive `Record<FileMenuItemId, …>`, so a new item cannot render dead; tokens only. One new read on the dev-only `window.__tessera`. |
| 5 | Design fidelity | 9 | Read in both themes and at both phone widths, with the submenu expanded and with the confirm open. The one divergence from §1 is the disclosure instead of the flyout, and it is a divergence because the flyout does not fit — measured, §7.1. |
| 6 | No regressions | 9 | 376 tests, clean build, six viewports, `probe-layers`, `probe-tools-ui`, `probe-tooltip`, `probe-canvas-size` 70/70 and `probe-zoom` all green. Two probes the rename broke are fixed in this same change, and a `HANDOFF §11` debt item is gone. |

**Overall: 9/10.**

### Deliberately left out

- **Open recent and Paste image.** B2 and B3 by §6's own ordering. Their rows are
  absent rather than disabled — a control that looks live and is not is worse
  than no control, which is the same rule that keeps the account items out.
- **`⌘N`, `⌘O`, `⌘V`.** Step 3 of §6. Two of them are the browser's own and need
  §3's conditional `preventDefault`, which is the whole reason shortcuts are a
  separate step.
- **Giving New… a fresh document id.** It would make §2's "stays in recent" true,
  and it is three lines — but `lib/agent/session.ts` collapses a session by
  comparing dimensions and layer shape, *not* ids, so a same-size
  `new_document` inside an agent session would collapse to an `ai_edit` that
  silently drops the id change. B2 is where the fix pays off and where the guard
  can move with it.
- **Renaming the document from the header.** The filename input still does not
  write back (a pre-existing gap, noted in `Chrome.tsx`), so Duplicate copies
  whatever name the document loaded with — `untitled copy` for a fresh canvas.

---

## B2 — Open recent · NEXT

### Context handed over

- **`listDrafts()` already exists in `lib/persist/idb.ts` and nothing calls it.**
  Every document the user has ever autosaved is sitting in IndexedDB
  unreachable. This is a rule-7 problem hiding in plain sight, and it is the
  reason this unit matters more than its size suggests.
- A corrupt record must be shown disabled and **kept**, never deleted.

**From B1 — the menu you are adding to already exists and has a shape:**

- **Add a row by adding it to `FILE_MENU` in `lib/editor/file-menu.ts`, not to
  the JSX.** The menu renders from that array, and the handler table in
  `Chrome.tsx` is an exhaustive `Record<FileMenuItemId, () => void>` — add an id
  and the compiler names the missing handler rather than letting the row render
  dead. `open-recent` belongs in the first group, after `open`.
  `file-menu.test.ts` will hold you to no-empty-groups and unique ids.
- **The submenu pattern is already built and is a disclosure, not a flyout.**
  `Examples` expands in place with `aria-expanded` and a rotated `CaretDownSmall`;
  §7.1 explains why a flyout does not fit a 390px phone at this anchor. Open
  recent is a longer list, so reuse it rather than reopening the question — and
  the menu already has `maxHeight` + `overflowY`, so ten rows will scroll rather
  than run off the bottom.
- **Every row has an `id` of the form `file-<itemId>`, and the starters are
  `file-example-<name>`.** That is deliberate (`HANDOFF §5`): a probe needs a
  handle that is not the label when the label is the thing under test. Give the
  recent rows the same treatment — their labels carry a *relative date*, which
  changes.
- **`tools/probe-file-menu.ts` is the probe to extend**, not to duplicate. It
  reads IndexedDB directly (the `DRAFTS` constant) to prove Duplicate leaves the
  original behind; the same read is what you need to seed and assert a recent
  list. It also covers the 390/320 geometry that `check-responsive` cannot see.
- **B1 already proved two drafts survive a Duplicate**, so there is real data to
  list on day one.

**The decision this unit should make, which B1 deliberately did not:**

- **Should `New…` mint a fresh document id?** §2 promises "the old drawing stays
  in recent" and it does not: `new_document` reuses `doc.id`, so autosave writes
  over the previous draft and only in-session undo brings it back. B1's confirm
  is honest about that rather than papering over it (`§7`, `newConfirm`). The fix
  is three lines in `lib/actions/catalogue.ts` — **but do not make it without
  also fixing `lib/agent/session.ts`**, which collapses a session by comparing
  dimensions and layer shape and *not* ids. A same-size `new_document` inside an
  agent session would otherwise collapse to an `ai_edit` that silently drops the
  id change. That is the silent-corruption class the whole command design exists
  to avoid, so it is a guard plus a test, not a one-liner.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/17-file-menu.md` (§2 and §7), then build
> unit **B2**: Open recent.
>
> `listDrafts()` exists and nothing calls it. Surface it as a submenu — newest
> first, capped at 10, name and relative date, a real empty state, and a record
> that no longer parses shown disabled rather than dropped. Add the row to
> `FILE_MENU` in `lib/editor/file-menu.ts`; the menu renders from that array and
> the handler table is exhaustive, so the compiler will name what you missed.
> Reuse the Examples disclosure rather than building a flyout, and extend
> `tools/probe-file-menu.ts` rather than writing a second probe.
>
> Decide, in writing, whether `New…` should take a fresh document id so that
> "the old drawing stays in recent" becomes true — and if it should, fix
> `lib/agent/session.ts` in the same change, because it compares dimensions and
> layer shape but not ids.
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
