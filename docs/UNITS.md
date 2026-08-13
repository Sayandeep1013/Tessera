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

1. **Verify.** All green, all four:

   ```bash
   npm test          # no browser needed; the count is in HANDOFF's header
   npm run typecheck
   npm run build     # rm -rf .next first if a dev server has been running

   # every browser probe, against one server, in one command
   AI_PROVIDER=mock npx next dev --turbopack -p 3100
   MOCK_SERVER=1 APP_URL=http://localhost:3100 npm run probes
   ```

   **Run all of the probes, not the ones you think you touched.** B1 renamed a
   File-menu item and broke `probe-layers` and `probe-zoom`, which are about
   neither files nor menus. Nobody would have chosen to run them. `npm run
   probes` exists so the choice is not yours to get wrong — and it is how
   `e2e-agent` was found never to have passed in mock mode at all.

   Start the server with `AI_PROVIDER=mock`: the agent runs **server-side**, so
   setting it on the probe leaves the real key in play, spends the 5-per-minute
   budget and fails on wording the model was never asked for. Without
   `MOCK_SERVER=1` the runner skips those two rather than burning quota.
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
| **B2** | Open recent, rename, shortcuts | **DONE** | 9 | [17 §2, §3, §8](./specs/17-file-menu.md) |
| **B3** | Paste image | **DONE** | 9 | [17 §9](./specs/17-file-menu.md) |
| **C** | Code panel | **DONE** | 9 | [07 §9](./specs/07-code-panel.md) |
| **D** | Exporters ×6 | **DONE** | 9 | [08](./specs/08-exporters.md) |
| **E** | Layers phase 2 | **DONE** | 9 | [14 §12](./specs/14-layers.md) |
| **F** | Animation | **NEXT** | — | [10](./specs/10-animation.md) |
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

**12 Aug 2026 · `0029cbb` + `5f47938` (the follow-up) · 9/10**

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
   drawing exactly.
3. **§2's "the old drawing stays in recent" was not true**, because
   `new_document` and `loadExample` both reused the document's id and were
   autosaved over the drawing they replaced. **Now fixed** — see the follow-up
   below.

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

### The follow-up — the two things B1 first shipped as caveats

B1's first pass named two problems and handed them on. Both are now fixed, in
the same unit, because a caveat handed forward is a caveat nobody owns. Recorded
in `17-file-menu.md §7.11` and `§7.12`.

**1. Replacing the document now forks to a new draft.** Drafts are keyed by
`doc.id`, so `new_document` and `loadExample` reusing it meant the replacement
was autosaved straight over the drawing it replaced. The rule is now uniform —
*anything that replaces the whole document with a different artwork takes a
fresh id* — and it covers New…, Examples and Duplicate. All three still go
through `commit()`, so undo restores the previous document **including its id**:
both recoveries, not a choice between them.

The reason B1 would not do this alone was real, and it is now the guard that
makes it safe. `lib/agent/session.ts` collapsed a session by comparing
dimensions and layer shape and nothing else, so a *same-size* `new_document`
inside an agent session would have collapsed to an `ai_edit` carrying pixels
only — undo restoring the artwork under the **new** id and orphaning the old
draft. One line, `if (current.id !== this.before.id) return replaceDoc()`,
pinned by a test that fails without it.

Two consequences: New… no longer carries the old name onto a blank canvas, and
its confirm stopped being red. It now promises something the code keeps, so it
gets `--solid` and Clear keeps `--diff-remove` — a red button that never costs
anything is how a red button stops meaning anything.

**2. Probe rot is now caught, twice.** `lib/__tests__/probe-handles.test.ts`
statically asserts every `#id` selector in `tools/` still exists in the app; the
File menu's handles are built by functions that also feed the test's allow-list,
so the component and the check cannot drift. Verified by breaking it on purpose
— it named all three affected probes. And `npm run probes` runs every browser
probe against one server in one command, which is the answer to a protocol step
that used to require guessing your own blast radius.

**The runner paid for itself on its first run**, finding two pre-existing
problems neither of which is about this unit:

- `probe-agent-ui` and `e2e-agent` need `AI_PROVIDER=mock` on the **dev server**,
  not the probe process — the agent runs server-side, so the old invocation left
  the server on a real key, spent quota, and failed on wording it never asked
  the model for. The runner now skips them unless `MOCK_SERVER=1`.
- **`e2e-agent` had never actually passed in mock mode** (HANDOFF §11 suspected
  as much and nobody had checked). It ignored `APP_URL`, and its `Stop` click
  raced the agent panel's own aria-live log into a 30-second timeout. Both
  fixed, and that block now asserts the run really stopped instead of passing
  vacuously when the click was swallowed.

### Score — six dimensions, overall is the lowest

Scored after the follow-up. The first pass scored the same 9 overall, but on
weaker lines — correctness carried a caveat about New overwriting the previous
draft, and regressions carried two probes broken by a rename.

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | Every item in §6 step 1 is built; four spec errors corrected and nine gaps filled in §7, including §2's "stays in recent", which is now true rather than explained away. Not 10: the menu on screen is not yet the menu §1 draws — Open recent and Paste image are absent by §6's own ordering, and the shortcut hints §1 shows are withheld until step 3 wires the keys. |
| 2 | Correctness | 9 | F-M1 handled both ways; Clear is one batch, undoes byte-exactly, clears hidden layers and leaves other frames alone; New, Examples and Duplicate all fork, all verified against real IndexedDB records, and all still undoable including their ids. Not 10: the header's filename input still does not write back, so Duplicate copies whatever name the document loaded with — pre-existing, and it makes `untitled copy` the common case. |
| 3 | Tests | 9 | 52 unit tests on the new modules plus the id fork and its session guard, 80 browser checks on the wiring in both themes and at 390 and 320, and a static guard that fails `npm test` when a probe names an element that no longer exists. Not 10: that guard catches ids, not labels or flow — a probe can still rot in ways only running it will show, which is what `npm run probes` is for and why it is now in the protocol. |
| 4 | Integration | 9 | `commit()` is still the only writer of the open document; the fork goes through `replace_doc` rather than around it; ids are injected through `ActionCtx.newId` so artwork-core and the catalogue stay pure and deterministic under test; the menu is data plus an exhaustive `Record<FileMenuItemId, …>`; tokens only. Not 10: adding a required `ActionCtx` field showed there are four near-identical hand-built contexts in the repo, and I updated all four rather than consolidating them — noted as debt. |
| 5 | Design fidelity | 9 | Read in both themes and at both phone widths, with the submenu expanded and both confirms open. The two confirms are now painted by what they cost — red only where work is destroyed. The one divergence from §1 is the disclosure instead of the flyout, and it is a divergence because the flyout does not fit — measured, §7.1. |
| 6 | No regressions | 9 | 385 tests, clean build, six viewports, and **every** browser probe green in one run — including `e2e-agent`, which had never actually passed in mock mode before. Two probes this unit broke are fixed, and two `HANDOFF §11` debt items are gone. |

**Overall: 9/10.**

### Deliberately left out

- **Open recent and Paste image.** B2 and B3 by §6's own ordering. Their rows are
  absent rather than disabled — a control that looks live and is not is worse
  than no control, which is the same rule that keeps the account items out.
- **`⌘N`, `⌘O`, `⌘V`.** Step 3 of §6. Two of them are the browser's own and need
  §3's conditional `preventDefault`, which is the whole reason shortcuts are a
  separate step.
- **Renaming the document from the header.** The filename input still does not
  write back (a pre-existing gap, noted in `Chrome.tsx`), so Duplicate copies
  whatever name the document loaded with — `untitled copy` for a fresh canvas.
  It is a small unit of its own and B2 will feel it first, because Open recent
  lists documents by name.
- **Consolidating the four hand-built `ActionCtx` objects.** Adding `newId` made
  the compiler name all four — `lib/actions/__tests__/harness.ts`,
  `session.test.ts`, `run.test.ts`, `tools/probe-agent.ts`. They should share
  the harness. Left alone deliberately: it touches the agent's tests and this
  change was already reaching into the agent for the session guard.
- **A probe guard for labels and flow.** `probe-handles.test.ts` catches a probe
  naming a dead id, which is the common rot. A probe can still break on a
  changed label or an extra confirm step, and only running it will show that —
  hence `npm run probes` in the protocol.

---

## B2 — Open recent, rename, shortcuts · DONE

**12 Aug 2026 · `793a8b8` · 9/10**

`lib/artwork-core/doc-name.ts` (`cleanDocName`, `copyName`, `renameCommand`),
the `doc_rename` command, `listRecent()` in `lib/persist/idb.ts`,
`lib/editor/recent.ts` (the cap, the exclusion, relative dates, the thumbnail
rule, every string), `lib/editor/keys.ts`, and the menu work in
`components/Chrome.tsx`. 34 new unit tests, and the probe grew from 80 checks to
112. Decisions in `17-file-menu.md §8`.

**Two things were folded in, and both were load-bearing.**

*Shortcuts had no owner.* §6 lists them as step 3 but the ledger only had B2 and
B3, so nothing claimed them and they would quietly never have happened. `⌘N` and
`⌘O` are wired; **not `⌘V`**, because Paste image is B3 and a key that does
nothing is the same broken promise as a hint for a key that does nothing. The
hint column B1 built now has three entries and a test that pins the set exactly.

*Rename is what makes a recent list worth having.* Every draft was called
nothing, because the header's filename input **displayed** `doc.name` and
silently discarded anything typed into it — no handler at all. It also carried
the word `untitled` as a *value*, so the moment a handler existed, focusing and
blurring the empty field would have renamed the document to "untitled". It is a
placeholder now, which is what it always meant.

**`doc_rename` is a real command**, not a `replace_doc`: rule 4 has no
metadata carve-out, but cloning every pixel to record a changed string makes the
undo stack expensive for nothing. Committed on blur and on Enter rather than per
keystroke — per-keystroke would be one undo entry per character. Escape needs no
"cancelled" flag, because putting the document's name back in the field makes
`renameCommand` return null.

**Three decisions §2 left open**, now in §8:

- **The open document is not in the recent list.** It is always the most
  recently saved, so it would always be row one and choosing it would do
  nothing. The list means "documents you can go back to".
- **Thumbnails, measured rather than assumed.** §2 said "if it is cheap —
  measure". `spriteRects` merges runs, so a starter is tens of rects and a dense
  256×256 is thousands; ten of those is a rendering job on the click that opens
  a menu. Drawn up to 64×64, a size label above it.
- **The list loads when the disclosure is expanded**, not when the menu opens —
  otherwise reaching for Export PNG parses ten documents. `null` rows means
  "still reading" and is a distinct state from empty, because showing "Nothing
  saved yet." before IndexedDB answers is a lie about the user's work.

**An existing guard caught a real mistake.** I put the parse error on the corrupt
row as a native `title`, and `lib/__tests__/tooltips.test.ts` failed — tooltips
are ours, and two stacked is worse than either. The row says "Can't be read —
kept, not deleted" in the slot where a date would be, which is the labelling
F-M4 asks for; the parse error is developer detail.

### Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | §2's recent list, §3's shortcuts and F-M4 all built; three gaps in §2 filled in §8. Not 10: §2 also offers a thumbnail "per row" without qualification, and the measured answer is "up to 64×64" — a divergence, recorded, but a divergence. |
| 2 | Correctness | 9 | Ordering, the cap, the exclusion, corrupt-kept-and-disabled, the flush before switching, the refit after; rename commits once, undoes, and cannot be committed by a blur that changed nothing. Not 10: the list is read once per expansion, so a draft saved in another tab while the menu is open is not reflected until it is reopened. |
| 3 | Tests | 9 | 419 unit tests and 112 browser checks; `Ctrl+O` is asserted through Playwright's filechooser event rather than assumed. Not 10: `listRecent` itself has no unit test — it needs IndexedDB, so the ordering and cap are covered through `recentRows` and the probe instead. |
| 4 | Integration | 9 | `commit()` still the only writer; `setDoc` only where a different document is opened; `doc_rename` is one more entry in the same inverse table; the `isTyping` guard is shared rather than copied, per §3. Not 10: `copyName` moved to `doc-name.ts` and `duplicate.ts` re-exports it, so there are two import paths for one function until something forces the choice. |
| 5 | Design fidelity | 9 | Read in both themes and at both phone widths. Rows carry a thumbnail, a name and a relative date, aligned with the Examples rows above them. Not 10: three rows reading "untitled · just now" is still what a fresh browser shows, and only real use will tell whether rename fixes that in practice. |
| 6 | No regressions | 9 | 419 tests, clean build, six viewports, all ten probes green in one run. The `Examples` disclosure generalised to two without changing its behaviour, and the tooltips guard caught the one mistake this unit made. |

**Overall: 9/10.**

### Deliberately left out

- **`⌘V`.** B3, along with the hint.
- **Deleting a draft from the list.** The whole unit exists because artwork was
  unreachable; adding a delete button to the fix is how you get back to the
  problem. Wait until it is asked for.
- **Renaming from a recent row.** The header renames the open document. A second
  rename affordance is a second source of truth for a name.
- **Live-updating the list.** Read once per expansion. A menu is open for
  seconds.

---

## B2 — the original handover, kept for reference

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

**There will already be drafts to list, and that is deliberate:**

- **`New…`, `Examples` and `Duplicate` all fork to a fresh document id** as of
  B1's follow-up (`17-file-menu.md §7.11`), so every one of them leaves the
  previous drawing in IndexedDB under its own key. Open recent is what makes
  that reachable — the plumbing is done and this unit is the surface.
- **The rule is written down**: *anything that replaces the whole document with
  a different artwork takes a fresh id*. If you add such a command, it forks,
  and `lib/agent/session.ts` already falls back to `replace_doc` on an id change
  so a session cannot silently drop it.
- **Names are the weak spot.** The header's filename input does not write back
  to the document, so most drafts are called nothing and show as `untitled`.
  A recent list of eight `untitled` rows is a bad list. Either wire the input as
  part of this unit or lean on the relative date and a thumbnail — decide
  deliberately and say which.

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
> Most drafts have no name, because the header's filename input does not write
> back to the document. Decide whether wiring it belongs in this unit or whether
> the date and a thumbnail carry the list, and say which.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## B3 — Paste image · DONE

**12 Aug 2026 · `01ec4e1` · 9/10**

`lib/artwork-core/fit-image.ts` (placement and resampling),
`quantise.ts` (redmean distance, median cut, palette reuse), `paste-image.ts`
(the two composed into one command), `lib/editor/paste.ts` (every sentence),
`lib/editor/clipboard.ts` (the three ways an image arrives), the `notice`
channel in `useEditorStore`, and the menu row plus the `paste` listener in
`Chrome.tsx`. 77 new unit tests — 419 to **496** — and the probe grew from 112
checks to **134**. Decisions in `17-file-menu.md §9`.

**§2 was wrong in two places and both are fixed there, not routed around**
(rule 10):

1. **"Nearest-neighbour" is right for enlarging and wrong for reducing.** A
   1000×500 photo into a 32×16 document is a 31:1 reduction — nearest-neighbour
   keeps one source pixel in every 961 and throws away the other 960, so the
   result is a sample of noise rather than a small version of the picture.
   Reduction box-averages, premultiplied so the transparent side of an edge does
   not bleed its colour into the visible side. Enlargement stays
   nearest-neighbour **and is by a whole number or not at all**: 13×13 into
   32×32 is drawn at 2×, not 2.46×, because a fractional nearest-neighbour
   enlargement gives some source rows three destination rows and their
   neighbours two, and that unevenness is how a pasted image announces that
   software mangled it.
2. **The fallback ladder is upside down.** §2 and F-M5 say to use
   `navigator.clipboard.read()` and fall back to a paste event. Measured, the
   paste event is the *good* path — it carries `clipboardData` on the gesture
   itself, so no permission, no prompt, and no missing implementation in
   Firefox, which is precisely where `clipboard.read()` is absent. So `⌘V` is a
   `paste` listener and the **menu row** is what has to use the API, with a file
   picker under it.

**There is no `⌘V` keydown handler and that is the design.** §3 made conditional
`preventDefault` the whole reason shortcuts were their own step; the paste event
deletes the question, because the browser already routes `⌘V` in a text field to
the text field. `isTyping` is still checked, for the one case the browser cannot
decide for us — pasting *text* into the filename input must never be read as
pasting an *image* into the canvas. The probe drives both.

**Four things §2 left to the code, decided in §9 instead:**

- **"Close enough" is 24 on a redmean scale of 0–765** — about eight levels per
  channel; `#808080` against `#888888` is exactly 24, and a test pins that
  sentence. Deliberately small, because reuse silently changes the image the
  user pasted, so it may only happen where the change is invisible. Plain
  Euclidean RGB was rejected: it claims two blues 40 apart are as different as
  two greens 40 apart, and a threshold built on that is either too eager in
  green or useless in blue.
- **Alpha is a cutoff at 128, not a channel.** Palette entries *can* be
  `#rrggbbaa`, so honouring partial alpha would mean one entry per (colour,
  alpha) pair and the soft edge of one PNG would eat the whole 36-slot budget.
- **A paste composites; it cannot erase.** Transparent cells are mapped to index
  0 as §2 requires and then *not written*, so a logo with a transparent
  background lands over the drawing instead of punching a rectangular hole in
  it. The consequence is stated rather than discovered: pasting a smaller image
  over a larger one leaves the larger one showing around it.
- **The report is a sentence with the number in it**, per F-M3 —
  *"Pasted 480×320 as 32×21. Reduced from 540 colours to 23."*

**The notice channel is new, and it is a consolidation rather than a second
mechanism.** F-M2, F-M3 and F-M5 are all "never go silent" requirements, and a
blocking `window.alert` after a *successful* paste is not an acceptable way to
meet them. `app/page.tsx` already had a `role="status"` line, reachable only by
the corrupt-draft notice it was written for; it moved into `useEditorStore`.
**Giving it a timer would have quietly weakened a rule-7 surface** — "your last
drawing is still saved" is not a message to take away after six seconds — so the
timer is opt-out and the boot notice is sticky.

**The undo test is the one that matters and it is there because this repo has
been burned by it.** `invertCommand('ai_edit')` once returned the palette pop
*instead of* the pixel inverse, shipping documents whose pixels referenced a
palette entry undo had removed (`14-layers.md §0.2`). Paste is the second
command that adds colours and pixels together, so it gets the same check:
serialise the undone document and parse it back. The probe asserts it too, in a
real browser, palette included.

### Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | All three stages of §2 built, both of its errors corrected in §9, four gaps it left filled there, and every item in §5's test list covered. The menu is now exactly the menu §1 draws — the first time that has been true. Not 10: F-M5's *first* rung is unproven. Headless Chromium has `clipboard.read()`, so the "this browser won't hand over the clipboard" path has never actually executed. |
| 2 | Correctness | 9 | F-M2/F-M3/F-M5 handled; one command, one undo, byte-exact including the palette and pinned by a reparse; determinism tested three ways; the 36-entry cap held under a 200-colour paste; composite and alpha-cutoff rules tested; total on a missing layer. Not 10: the decode is capped at 1024 on the long edge, so a 6000px photo is pre-reduced by the *browser's* resampler — the pipeline is deterministic given its input, but two browsers could hand it marginally different input. Documented, not eliminated. |
| 3 | Tests | 9 | 77 unit tests on the algorithm and the wording, and 22 new browser checks driving a real `ClipboardEvent` carrying a real PNG — the paste, the report, the palette growth, one Ctrl+Z taking all of it back out, F-M2, and the filename-field case. Not 10: `clipboard.ts` has no unit test. It is all browser API, and only its paste-event path is exercised; `readClipboardImage` and `pickImageFile` have never run in CI or in a probe. Same shape as `listRecent` in B2. |
| 4 | Integration | 9 | `commit()` still the only writer; artwork-core still imports nothing but zod; the browser layer is thin and one-way; tokens only; the notice consolidated page-local state rather than adding a channel; the new dev-hook read is pinned out of the production bundle by the existing test. Not 10: `pasteImageCommand` now takes a fifth parameter that exists solely because the browser layer caps its decode. Documented coupling is still coupling. |
| 5 | Design fidelity | 9 | Read in both themes and at 390 and 320, and the *result* looked at in both themes with a real gradient rather than four flat squares — the reduction is smooth, the aspect is preserved and centred, and the hard edge stays hard. Not 10: measured at 320, the notice sits over the zoom pill for its six seconds. Every alternative placement covers the artwork or the agent panel instead, so it stands — but it was found by measuring, not by choosing. |
| 6 | No regressions | 9 | 496 tests, clean build, six viewports, all ten probes green in one run. The one behaviour this unit changed outside itself — the boot notice gaining a timer — was caught while scoring and given `sticky` rather than shipped. |

**Overall: 9/10.**

### Deliberately left out

- **A floating paste you can drag before committing.** The marquee and
  Select/Move already own moving pixels; pasting then moving is two undoable
  steps rather than a new mode.
- **Dithered quantisation.** Floyd–Steinberg carries more apparent colour
  through a small palette, and it does it by scattering pixels — the opposite of
  what pixel art is. The dither brush is a deliberate tool here, not a side
  effect of importing.
- **Reading a URL or an `<img>` off the clipboard.** `text/uri-list` would mean
  fetching a cross-origin image and tainting a canvas. A file, a bitmap, or
  nothing.
- **Pasting at 1:1 with a crop.** Honouring the source size on an image larger
  than the canvas needs somewhere to put the overflow, and the only answers are
  a crop or a resize — both of which §2 rules out.
- **A test for the file-picker rung.** It needs a browser without
  `clipboard.read()`, which is a Firefox run, and this repo's probes are
  Chromium. Recorded in `HANDOFF §11` rather than faked with a stub that would
  only prove the stub works.

---

## B3 — the original handover, kept for reference

### Context handed over

- **This is a real algorithm, not wiring.** Three stages, each able to fail
  visibly: clipboard read (needs a gesture and a permission, unavailable in
  Firefox), fit (nearest-neighbour into the current canvas, never resize the
  document), quantise (median cut to ≤ 36 colours, reusing existing palette
  entries where close enough).
- One `paint` command for the whole thing, so it is one undo.
- Report the colour count rather than pretending nothing was lost.

**From B1 and B2 — the menu is built and has a shape. Do not fight it:**

- **Add the row to `FILE_MENU` in `lib/editor/file-menu.ts`, not to the JSX.**
  The menu renders from that array, and the handler table in `Chrome.tsx` is an
  exhaustive `Record<FileMenuItemId, () => void>`, so adding an id makes the
  compiler name the missing handler instead of letting the row render dead.
  `paste` goes in the first group, after `open` — that is where §1 draws it.
- **Add the `Ctrl V` hint in the same change as the key, and not before.**
  `file-menu.test.ts` asserts the hinted set *exactly* and currently asserts
  that no item promises `V`; that test moves with your unit rather than being
  deleted. The shortcut itself belongs in the `useEffect` in `TopBar` next to
  `Ctrl+N`/`Ctrl+O`, and must go through `isTyping` from `lib/editor/keys.ts` —
  stealing `⌘V` inside the filename field would be its own bug, and that field
  is now a real input that people type into.
- **`lib/__tests__/probe-handles.test.ts` will fail if a probe names an id you
  removed.** Build handles with `menuItemDomId`, never by hand.
- **Extend `tools/probe-file-menu.ts`** (112 checks) rather than writing a
  second probe, and **run `npm run probes`**, not just yours — see §0.
- **Never a native `title`.** `lib/__tests__/tooltips.test.ts` fails on one; it
  caught B2 doing exactly that. Use `components/Tooltip.tsx`.

**The shape of the work itself:**

- **Quantising belongs in `artwork-core`** — pure, deterministic, imports
  nothing but zod. `lib/artwork-core/quantise.ts`. The clipboard read is the
  only part that touches the browser, and it should be the thinnest possible
  layer around it so the algorithm stays testable in node.
- **The palette is the hard constraint, not the pixels.** A document holds at
  most 36 entries and the current one may already have 16. Reuse before adding,
  and the "close enough" threshold is a decision the spec does not make — make
  it, write it down, and test it.
- **Say the cost before or with the action** — the shape A2 and B1 both landed
  on. *"Reduced to 18 colours."* F-M3.

### Prompt

> Read `docs/UNITS.md` and `docs/specs/17-file-menu.md` (§2, §4 and §8), then
> build unit **B3**: paste image. Treat it as its own unit; it is an algorithm,
> not wiring.
>
> Put the quantiser in `artwork-core` — pure, deterministic, testable in node —
> and keep the clipboard read as a thin layer around it. One `paint` command for
> the whole paste, so it is one undo. Reuse existing palette entries before
> adding new ones, and decide and write down what "close enough" means. Report
> the colour count rather than pretending nothing was lost.
>
> Add the row to `FILE_MENU` and the `Ctrl V` hint in the same change as the
> key — `file-menu.test.ts` asserts the hinted set exactly and currently asserts
> that nothing promises V.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## C — Code panel · DONE

**12 Aug 2026 · `437b66b` + `9e1f983` (the follow-up) · 9/10**

`lib/editor/json-locate.ts` (a position-tracking JSON scanner),
`lib/editor/code-panel.ts` (widths, debounces, the coalescing policy, the caret
mapping, every string), `components/CodePanel.tsx`, `recentreViewport` in
`viewport.ts`, `commit(cmd, coalesce)` in the doc store, and
`tools/probe-code-panel.ts`. 68 new unit tests — 496 to **564** — and a new
probe of **74** browser checks. Decisions in `07-code-panel.md §9`.

**The spec predated everything and reading it critically was most of the unit.**
Four corrections and four gaps, all recorded in §9 rather than routed around:

**1. No CodeMirror (§9.1).** §1 asked for CodeMirror 6 with a themed JSON mode
and `next/dynamic` to keep its ~200KB out of the bundle — and asked for it with
folding, autocomplete and bracket-closing all switched off, because "all three
fight hand-editing a pixel grid". What is left is line numbers, colouring, and a
diagnostic at a position, on a file that is 90% pixel rows where colouring
braces tells the reader nothing. §3's *"CodeMirror's syntax tree, not a regex"*
is also a false choice: the third option is a 200-line position-tracking scanner
that is pure, has no DOM, costs no dependency, and — the part that decided it —
**`npm test` can reach it**, where anything built on an editor widget would have
been probe-only. This repo has written its own codec, tooltip, dither and
quantiser on exactly that reasoning.

What replaces the colouring is better aimed: an overlay `<pre>` behind a
transparent textarea, holding the *same string*, marking the two ranges that
mean something right now — the parse error, and the character under the canvas
cursor. Three text nodes and two marks, so a 256×256 document costs what a
16×16 one does.

**2. The ladder of error surfaces (§9.2).** No CodeMirror means no inline
diagnostic, so the mark is the overlay's range and the message is the status
line's alone. §3's degradation rule survives intact and is the part that
matters: a path that will not resolve still shows its message. Added: the status
line says **where the caret is as a pixel** — `row 12 · char 7 → pixel (7, 12)`
— which is the sentence that makes "code underneath" literal, and costs one
lookup against ranges the overlay already computed.

**3. Opening a split has to re-centre the view (§9.3), and the spec says
nothing about it.** `offsetX` is measured from the canvas element's left edge,
so taking 460px off the right leaves the artwork where it was and the panel
arrives on top of half of it. Re-fitting is the wrong fix — it throws away the
pan and zoom of somebody mid-detail-work, the cost `refit.ts` names and `17
§7.3` already refused. `recentreViewport` keeps the scale and moves the offset
by half the change. **It fixed something older on the way:** resizing the
browser window had the same defect and nobody had noticed, because it drifts a
little at a time.

**4. Coalescing needed the store's help (§9.4).** §5 says consecutive edits
replace the top of the history stack; nothing could do that, because `commit()`
only ever pushed. It takes a second argument now, and merges while keeping the
*original* `before` — ten keystrokes undo to where the typing started, not to
the ninth keystroke. Rule 4 is intact: this changes what happens to history, not
who writes, the same distinction `agentDepth` draws. The 2-second window stays
in a pure module, so the policy is tested in node rather than by typing into a
browser.

**Running it found the rest.** Twelve probe checks failed on the first run and
three were real:

- **⌘Z inside the panel undid the *textarea*, not the document** — which then
  parsed and committed, so "undo" pushed a new command instead of reversing one
  and §5 was quietly false wherever the caret was. There is one history and it
  belongs to the document.
- **⌘/ was behind `isTyping`**, which made the panel's own textarea the one
  place the shortcut that closes the panel did not work. The guard exists for
  keys a field *needs* — ⌘N, ⌘O, ⌘V — and a slash chord is not one. §9.6 states
  the rule now that there are four of them.
- **`check-responsive` failed at 320** the moment the button existed: 38px off
  the edge. The wordmark beside the logo is ~70px of decoration and the mark
  alone still opens the menu, so it goes on a phone. Same rule as the dead
  controls, one step further — a live control does not lose its place to a word.

**And one thing only looking found.** Every check passed while the overlay was
*translated* rather than scrolled — `transform` moves an element's box, so its
bottom edge rose with the content and `overflow: hidden` clipped the last three
pixel rows of a 16×16 document while the gutter cheerfully numbered them. The
screenshot found it; the probe now has three geometry checks that would.

### The follow-up — the two gaps C first shipped as caveats, and one arithmetic error

C's first pass recorded two honest gaps and moved on. Both are closed now, in
the same unit, because a caveat handed forward is a caveat nobody owns — the
same reason B1's follow-up exists. Recorded in `07-code-panel.md §9.8` and
`§9.9`.

**1. §9.1 was wrong about its own cost, and rule 10 applies to a spec written an
hour earlier.** It said colouring would price "a span per token on a 70KB
string" and treated that as prohibitive. **The number was never checked and it
is wrong by two orders of magnitude:** a pixel row is a *single string token*,
so a 256×256 document — the largest this editor makes — tokenizes to about 400
spans, and a 32×32 one to under a hundred. Colouring was cheap all along.

It is built, and aimed at this document rather than at JSON in general.
Punctuation and whitespace get no span at all, keys recede to `--muted`, and the
pixel rows are `--fg` — the artwork is the most legible thing on the screen,
which is the opposite of what a generic JSON theme does. **The palette draws
itself:** each colour value carries a 2px bar in its own colour. Three
constraints forced the exact treatment — the near-black end of a palette is
unreadable *as text* on a dark panel, a colour close to the panel's own is a
swatch you cannot find (hence a hairline beneath the bar), and nothing may
change a glyph's advance or every mark slides off its character. The probe
measures that advance across every coloured run and fails if any differs.

**2. ⌘Z on an invalid buffer no longer discards what was typed in silence.** The
first press now undoes *the typing* — which is what ⌘Z plainly means when the
most recent thing that happened was typing — and says so through the notice
channel. The document's history is one more press away. That was the only place
in the app where text a user typed could vanish without a message.

**3. Closing the panel applies a pending valid edit**, which §7 asks for and the
first pass did not do. The debounce is 300ms, so typing a character and reaching
straight for Close dropped it. It flushes on unmount, so Escape and ⌘/ get it as
well as the button.

**And the alignment guard C said it would need.** Its first pass checked the two
layers only at the top and the bottom of the buffer and recorded the gap
"worth doing if anything ever touches `TEXT_BOX`". Adding coloured spans is
exactly that change, so the probe now checks five scroll positions and the
per-character advance of every run — 74 checks became **96**.

**Rule 8's guard caught the one mistake this follow-up made:** a hex literal in
a *comment* explaining why a near-black colour would be unreadable as text.
`tokens.test.ts` cannot tell prose from a value, which is the right way round
for a guard to be wrong; the sentence lost its literal.

### Score — six dimensions, overall is the lowest

Scored after the follow-up. The first pass scored the same 9 overall on weaker
lines — spec conformance carried a missing feature, correctness carried a silent
loss of typed text, and tests carried an alignment gap the unit had named itself.

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | Everything §1–§8 asks for is built, including §1's colouring and §7's "Done applies any pending valid edit", which the first pass missed. Four mechanisms replaced and six gaps filled, in §9. Not 10: what is coloured is chosen for this document rather than being generic JSON highlighting — a deliberate divergence from §1, recorded, but a divergence. |
| 2 | Correctness | 9 | Both sync directions, the origin guard, an invalid buffer that changes nothing, a one-character mark on the one wrong character, coalescing that undoes to the start of a burst, ⌘Z ownership settled, and neither of the two silent losses left. Not 10: an unapplied edit that has been undone cannot be redone — deliberate, and it still means a keystroke sequence exists that loses text a user typed, just not a silent one. |
| 3 | Tests | 9 | 92 unit tests and 96 browser checks. `locate` is driven by the paths `parseDoc` really emits; the swatch check asserts each bar is painted *exactly the colour it names*; the alignment check measures five scroll positions and every run's advance. Not 10: those alignment checks are spot checks, and they were written after a screenshot found the bug rather than before. |
| 4 | Integration | 9 | `commit()` is still the only writer; artwork-core untouched but for one path made more specific; every decision is in three pure modules; `skipString` is shared rather than reimplemented so the two scanners cannot disagree about escapes; ids feed `probe-handles.test.ts`; tokens only, with the one artwork colour marked `token-exempt` as `Chrome.tsx` already does. Not 10: `codeWidth` and `codeCell` are two more fields on an editor store that is getting long. |
| 5 | Design fidelity | 9 | Read in both themes before and after the swatch change, at both phone widths as a sheet, and with the caret in a pixel row so both directions of §4 show at once. Six viewports clean. Not 10: the three layers agree because they share one style object and one font — a convention with a spot check under it, not a mechanism. |
| 6 | No regressions | 9 | 588 tests, clean build, six viewports, all eleven probes green in one run. Three pre-existing things are better: the window-resize drift, `palette_range`'s path, and the header at 320. |

**Overall: 9/10.**

### Deliberately left out

- **Generic JSON colouring.** Braces and quotes tell the reader nothing they did
  not know about a file that is 90% pixel rows. What is coloured is chosen for
  this document — `07 §9.8`.
- **A `Format` button.** The text is canonical every time the document writes
  it; a button that re-canonicalises somebody's in-progress typing is a button
  that moves their caret.
- **Editing anything but the whole document.** A "just the pixels" view would be
  a second representation, which is rule 3.
- **Column-accurate `Go to error` scrolling.** It scrolls to the line and lets
  the browser keep the caret visible, which is right for a 16-wide row and
  approximate for a 256-wide one.
- **Redo of an unapplied edit.** ⌘Z on an invalid buffer reverts the typing and
  says so; there is no way back to it, on purpose, exactly as with an undone
  brush stroke.

---

## C — the original handover, kept for reference

### Context handed over

- Spec `07-code-panel.md` predates everything built since. **Read it critically
  and correct it under rule 10** rather than implementing something stale. It
  was written before layers, before settings, before the agent and before the
  File menu; every unit since B1 has found at least one sentence in its own spec
  that was no longer true, and this spec has had four more units happen to it
  than any of them.
- The document's `px` rows already **are** the text. The panel renders the
  document; it is never a second source of truth (rule 3).
- The loop guard is where the bugs live: text → document → text must not
  re-enter.
- `</>` is the button, currently in the `showUnbuilt` group in
  `lib/editor/breakpoint.ts`. Move it out when it works, as Layers and Share
  were. **Timeline is then the last member**, and if `showUnbuilt` ends up with
  one entry it is worth asking whether the group still earns its name.

**Things B3 built that this unit will want:**

- **There is a status channel now.** `useEditorStore.notice` / `setNotice(text,
  sticky?)`, rendered by `<Notice/>` in `app/page.tsx` as one `role="status"`
  line. Transient by default (`NOTICE_MS`, 6s, click to dismiss), `sticky` for
  anything about work that might be lost. A code panel that fails to parse what
  someone typed has exactly that problem, and it should not invent a second
  mechanism — **and it must not use `window.alert`**, which is still what
  `openFile` does and is now the odd one out.
- **`parseDoc` already returns a `DocError` with a `code`, a `message` and a
  `path`** (`lib/artwork-core/codec.ts`). `path` is `frames.0.layers.0.px[3][7]`
  shaped, which is the raw material for pointing at the offending line. Nothing
  currently uses `path`. That is the difference between "invalid document" and a
  cursor on the bad character.
- **Measured, at 320px: the notice overlaps the zoom pill** for its six seconds.
  Anything else you float over the canvas has the same problem and
  `check-responsive.ts` will not see it — it measures the app at rest. Measure
  it yourself in the probe, the way `probe-file-menu` now does.

**Things that will bite regardless:**

- **`spriteRects`, `serializeDoc` and `encodeRows` are all already the text.**
  `serializeDoc` gives stable key order, 2-space indent and one line per pixel
  row — the code panel's job is closer to "show this string and accept edits to
  it" than to formatting anything.
- **Every mutation still goes through `commit(cmd)`.** A code-panel edit is a
  `replace_doc` at worst; think hard before it is one per keystroke, which is
  the mistake `doc_rename` avoided by committing on blur (§8.1).
- **`lib/__tests__/probe-handles.test.ts` will fail `npm test`** if a probe names
  an `#id` you removed, and **`npm run probes`** is how you find the rest. B1
  broke two probes that had nothing to do with its unit; do not assume your
  blast radius.

### Prompt

### Prompt

> Read `docs/UNITS.md` and `docs/specs/07-code-panel.md`, then build unit **C**:
> the code panel. Read the spec critically first — it predates layers, settings
> and the agent, and correcting it under rule 10 is part of the unit.
>
> Then follow the finishing protocol in `docs/UNITS.md §0`.

---

## D — Exporters · DONE

**13 Aug 2026 · `cea7495` · 9/10**

`lib/exporters/` — `geometry.ts` (`horizontalRuns`, `flattenFrame`), `types.ts`
(`ExportResult`/`ExportOk`/`Exporter<O>`), and one file per format: `svg.ts`,
`css.ts`, `react.ts`, `json.ts`, `ascii.ts`, `png.ts`. `lib/editor/export-menu.ts`
(the popover's rows, wording, DOM ids) and `lib/editor/save-export.ts` (the one
place any of it touches the DOM). `components/ExportPopover.tsx`, wired from a
new `Export` button in the code panel's header. 68 new unit tests and a new
68-check browser probe, `tools/probe-export.ts`. Decisions in `08-exporters.md
§12`.

**The spec had four real problems, corrected there rather than routed around**
(rule 10):

1. **§1's contract had no way to fail.** §4 requires the CSS exporter to return
   an error above 16,384 painted pixels, but `{ filename, mime, data }` has
   nowhere to put one. `ExportResult` now reuses `artwork-core`'s own
   `Result<T, E>` — the shape every other fallible function in this codebase
   already speaks — rather than inventing a sixth one, or smuggling an error
   string into `data` where a caller would have to sniff for it.
2. **ASCII was named in this unit's own handover and never given a section.**
   Added as §7: reuses `encodeRows`, the same character mapping `serializeDoc`
   uses, over the frame flattened to what is actually visible. No second
   encoding of a pixel to a character anywhere in the codebase.
3. **No exporter had a way to flatten layers**, because the spec predates
   layers phase 1. `flattenFrame` in `geometry.ts` composites with
   `compositeAt` — the same topmost-non-transparent-wins rule the eyedropper
   already samples by, not a full alpha blend. Deliberate: layers phase 1 has
   no opacity field, so the two can only disagree once one exists — **E's
   problem, flagged below, not solved here.**
4. **The PNG encoder decision needed one more turn than "use pngjs."** A
   `<canvas>` fails rule 1 outright (DOM, cannot run in the Node test process).
   `pngjs/browser` is a self-contained browserified build that runs unmodified
   in both — genuinely one encoder, not two — but it is heavy enough
   (`bitpacker`, its own bundled zlib) that a naive `next/dynamic` around the
   whole popover still shipped it in the page's initial script list on this
   app's single static route. **Measured with a real network trace, not
   assumed**: a plain `import('@/lib/exporters/png')` inside the click handler
   (in both `ExportPopover.tsx` and the File menu's PNG row) is what actually
   defers it — confirmed by zero requests for pngjs's real internals before
   Export is opened, and exactly one the moment PNG is clicked.

**Two more decisions the spec left to the code, in §12.5 and §12.6:** the
Export trigger lives in the code panel's own header, not the top bar — the
handover already named this as the safe spot, and it held at 320px after one
fix (below); and CSS's illustrative `transform: scale(16)` behind a 1px `--p`
became `--p` set directly to the pixel size, which draws the same picture with
one fewer moving part.

**One real bug, and it is the reason the acceptance test exists.** The Export
popover, first wired with its trigger in its own 28px-wide wrapper, opened
7px off the left edge of a 320px sheet — `right: 0` was anchored to the
trigger, not to the header, and the trigger sits well inside it (Close is to
its right). `probe-export.ts` caught it on the first run, at exactly the
viewport `check-responsive.ts` cannot see (HANDOFF §5: it never opens a
popover). Fixed by anchoring to the header instead.

**§5's own acceptance test — "the exported component, rendered, is
pixel-identical to the canvas" — is built for real, not approximated.** No JSX
runtime is instantiated; instead the probe decodes the exported `.tsx`'s
`<rect>` props back into real DOM `<rect>` elements (a mounted JSX `<rect>` and
a hand-built DOM `<rect>` with the same attributes are the same node — React's
runtime is not what makes two rects the same colour, the numbers are),
rasterises that real, browser-rendered SVG to a canvas, and compares it pixel
for pixel against the app's own live canvas at its own viewport transform,
read through `window.__tessera.viewport()`. Only painted cells are compared —
transparent cells are the exporter's business by design (§1.4), not the
canvas's, which paints a flat backdrop there instead.

**The CSS pixel cap is exercised through the real UI, not the dev hook.** The
probe resizes the canvas to 200×200 through the Canvas tab and flood-fills it
with one click of the Fill tool — 40,000 painted cells, over `CSS_ERROR_PIXELS`
— then asserts nothing downloads and the popover shows why, inline, never a
toast (§10).

### Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | Every Phase 3 exporter is built plus ASCII, which the spec never named; the Export UI matches §10's mockup with ASCII added to it, recorded. GIF and sprite sheet are Phase 5 and declared out of scope by the spec itself. Not 10: the CSS exporter's `--p`/`transform:scale` divergence from §4's illustration, though behaviour-equivalent, is still a divergence. |
| 2 | Correctness | 9 | Nine of §11's ten test requirements met — the tenth is GIF's, not yet applicable, Phase 5 — including the ones that needed a real browser: SVG's `optimize` true/false pixel-equivalence, CSS's shadow-count-equals-painted-pixels and hard error above the cap, React's TS/JS validity via the TypeScript compiler API, PNG's alpha and 1×1 and all-transparent cases, and — the one this unit could not have claimed without building it — React's pixel-identity against the live canvas, genuinely rendered and sampled. Not 10: `flattenFrame`'s topmost-wins compositing is a documented simplification against a true alpha blend, correct today because no layer has opacity yet, and a coarse edge for E to inherit knowingly rather than rediscover. |
| 3 | Tests | 9 | 68 unit tests in node (golden snapshots for SVG/CSS/React/ASCII, exact byte assertions for PNG via `pngjs` decode, a module-graph walk proving no exporter imports another) plus 68 browser checks across both themes, two phone widths, and one large document built through real UI actions for the CSS cap. Not 10: the golden fixtures are `face`/`bird`/`logo` plus hand-built edge cases rather than the fuller fixture set `03-artwork-core.md §8` describes (`knight`, `tile`, the `edge/*` set) — most of those files do not exist on disk yet, a pre-existing gap this unit did not create and chose not to expand its scope to close. |
| 4 | Integration | 9 | Every exporter is a pure function of `(doc, opts)`; the module-graph test enforces the no-cross-import rule rather than trusting it; `commit()` is untouched — no exporter ever writes the document; the one DOM boundary (`save-export.ts`) is a single small module; `tokens.test.ts` extended with the same `token-exempt` mechanism it already had, rather than a parallel allowlist, to cover a CSS exporter that legitimately emits `var(--p)` for a file that is not this app's own stylesheet. Not 10: `ExportPopover.tsx` necessarily treats PNG's dynamic import differently from the other five exporters' static ones — documented coupling between a UI decision and a dependency's weight, the same shape HANDOFF §11 already tracks for `pasteImageCommand`. |
| 5 | Design fidelity | 9 | Matches §10's popover to the mockup, read in both themes and at 390 and 320 after the anchor fix, with the CSS failure state shown inline rather than imagined. Not 10: PNG's own row doubles as a 1× shortcut alongside its four scale buttons, which the mockup does not distinguish either way — a reasonable reading, not a measured one. |
| 6 | No regressions | 9 | 657 tests (588 → 657), clean build, and all twelve browser probes green in one `npm run probes` run, including the new one. The File menu's PNG row now goes through the same pure exporter as the popover — one encoder, confirmed not to duplicate the pngjs weight across two code paths. |

**Overall: 9/10.**

### Deliberately left out

- **GIF and sprite sheet.** Phase 5 by the spec's own header, and the unit's
  prompt named six exporters, not eight.
- **React's `animated` option and CSS's Phase-5 hooks.** Both wait on frames
  existing to animate, which is unit F.
- **Expanding `artwork-core/fixtures/` to the full set `03 §8` describes.**
  Real debt, not this unit's to close incidentally — noted in HANDOFF §11.
- **A GUI-driven equivalent check for SVG/CSS/ASCII the way React got one.**
  React's is the spec's named acceptance test; the other four are covered by
  golden snapshots and, for the UI wiring specifically, real downloads read
  back and asserted in the browser probe — a lighter but still real check.

---

## Between D and E — the symmetry axis line

**Not a lettered unit** — a small, user-requested addition to already-shipped
Settings work, done between finishing D and starting E. Recorded here so nothing
between the two is invisible to whoever reads this file next; **E is still
`NEXT`** and its own block below is unchanged and still the thing to read next.

**13 Aug 2026 · `c9fa7f7` · 9/10**

The request: while `Symmetry` is on, show the mirror line(s) on the canvas —
the reference product does, and without one, "where does a stroke mirror
across" is a question you can only answer by testing a stroke and watching
where the second mark lands. `docs/specs/16-settings.md §3` (the existing
symmetry spec) said nothing about this; it is entirely view state, so it
belongs next to the grid rather than as a document field. Added as `16
§3.1`, marked as an addition rather than a correction — the original spec
simply never considered it, there was nothing wrong to route around.

**Built:** `drawSymmetryAxes` in `lib/renderer/canvas.ts`, called from
`renderDoc`'s own pipeline (a new step 4.5, between the grid and the border)
via a `symmetry` field added to `RenderOptions` — the same plumbing shape
`gridMode` and `transparencyGrid` already use, not a second draw call bolted
on from `Canvas.tsx`. `H`'s axis is the *vertical* line at `x = w/2` (it
mirrors left-right); `V`'s is the *horizontal* line at `y = h/2`; `Both`
draws the pair. `difference` composite against `--accent`, not the grid's
`--grid-ink` — same contrast-guarantee technique, deliberately a different
colour cast so the axis reads as "a guide" and not "one more grid line"
(confirmed by eye against real, multi-colour artwork, not just a blank
canvas). Dashed, 2px, and drawn at **every** zoom, unlike the grid — the axis
matters most zoomed out, mid-stroke, exactly where the grid stays silent.

**A new browser probe, `tools/probe-symmetry.ts` (20 checks, both themes),**
because there is no golden-image harness for `lib/renderer/canvas.ts` and
`window.__tessera` already exposes what it needs (`viewport()`, `size()`).
**It found a real methodology trap on its first run, not a product bug**: at
the default 32×32 document, `w/2` and `h/2` are both 16 — an even document's
axis position is *always* an integer doc coordinate, which is exactly where a
regular interior grid line already sits. Sampling that pixel with the pixel
grid still on meant every "off" and every "wrong axis" check was reading a
line that would have been there regardless of this feature, and every check
passed even though nothing had been verified. Fixed by disabling the pixel
grid as part of the probe's own setup — recorded as a trap in `HANDOFF.md §5`
so the next thing that samples canvas pixels near a document's midpoint does
not lose an afternoon to it.

### Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | The one requirement — show the axis, like the reference does — is built and documented as a genuine addition to `16 §3`, not routed around. Not 10: there is no measured reference data for this (`VISUAL-SPEC.md` never covered it), so the treatment is this app's own judgement, not a verified match to the reference's actual pixels. |
| 2 | Correctness | 9 | Right axis for each mode, correct for both odd and even dimensions (the mirror maths already handles both; the axis position is simply `w/2` in continuous space either way), on at every zoom, gone when switched off, confirmed legible against real varied-colour artwork and not just a blank canvas. Not 10: no automated check that the axis repositions correctly after a resize — plausible from the code (it derives from `doc.w`/`doc.h` on every render) but not exercised. |
| 3 | Tests | 9 | 20 browser checks, both themes, driven through the real Settings UI rather than the dev hook, with the grid-confound trap found and fixed rather than shipped. Not 10: no unit test exists or can cheaply exist — `drawSymmetryAxes` takes a `CanvasRenderingContext2D`, and this repo has no canvas shim (`04-renderer.md §8`'s golden-image harness was never built); the browser probe is the whole test surface. |
| 4 | Integration | 9 | Plumbed through `RenderOptions` exactly like the two options beside it; `renderDoc` stays a pure function of its arguments; no store read inside the renderer; tokens only (`--accent`, already declared). Not 10: `Canvas.tsx` now destructures one more field off `useEditorStore.getState()` in the render loop — trivial, but it is one more thing that function knows about. |
| 5 | Design fidelity | 9 | Reads clearly in both themes, against a blank canvas and against real multi-colour artwork, at a zoom level where the grid itself stays hidden. Not 10: "like newt does" was not measured, so fidelity to the actual reference is unverifiable — this is a good-faith, independently-designed guide in the same visual family as the grid and selection overlays, not a confirmed match. |
| 6 | No regressions | 9 | 657 tests, clean build, all 13 browser probes green in one run including the two new ones. |

**Overall: 9/10.**

### Deliberately left out

- **A colour or line-style option for the axis.** One treatment, matching how
  the grid itself has exactly one look. Worth revisiting only if someone
  reports it clashing with a specific palette.
- **A small centre marker/hub where `Both`'s two lines cross.** The dash
  phase of each line is independent, so at some document sizes the exact
  centre pixel can fall in a gap on both lines at once — cosmetic, not
  functional (the mirror still works; nothing reads the drawing to find the
  centre), and not worth a special case for.

---

## E — Layers phase 2 · DONE

**13 Aug 2026 · `ceab238` · 9/10**

Opacity and blend mode on `Layer` (`o?: number`, `mode?: BlendMode`, eight
modes), the renderer compositing per layer (`ctx.globalAlpha` +
`ctx.globalCompositeOperation`, save/restore around each layer's draw loop),
`lib/artwork-core/blend.ts` (a pure `compositeStack` implementing the CSS
Compositing spec's alpha-over-with-blend-function formula, used by nothing the
renderer touches — it exists so merge/flatten can compute a result without a
DOM), `lib/artwork-core/merge-layers.ts` (`mergeDownCommand`, `flattenCommand`,
both composing existing primitives — `quantise`, `palette_add`, `paint`,
`layer_delete` — into one `batch` rather than inventing a new command shape),
two new commands (`layer_opacity`, `layer_blend_mode`), and a rewritten
`components/Layers.tsx` — an opacity slider and blend-mode select for the
active layer, Merge down / Flatten buttons, and drag-to-reorder rows. 24 new
unit tests (`blend.test.ts`, `merge-layers.test.ts`, plus extensions to
`codec.test.ts` and `commands.test.ts`) and a new 24-check browser probe,
`tools/probe-merge.ts`. Decisions in `14-layers.md §12`.

**No format-version bump**, per §12.2's argument: `o` and `mode` are omitted
from serialized output at their defaults (100, `'normal'`), exactly the
precedent `hidden` already set for `layer_visible` — a legacy document with
neither field parses and reads as if both were present at their defaults, and
a document written by this unit round-trips through an old build's schema
undamaged wherever every layer happens to sit at the defaults.

**The exporters question D flagged is answered, not deferred again** — §12.4,
also recorded in `08-exporters.md` after §12.1: `flattenFrame` **stays** the
topmost-non-transparent-wins approximation. Giving every exporter a true
alpha-blend compositor would mean six formats each re-deriving what "visible
here" means, RGBA in a domain that is otherwise entirely palette indices, and
CSS/React losing the one property that makes them worth having — real DOM
layers a browser still composites, rather than a flattened raster. Merge and
flatten are the escape hatch: quantise pixels down before export represents
the exact rendered pixel exactly, using the same compositor the renderer's own
correctness is checked against (see below). The gap this leaves — a
semi-transparent or blended overlap in an *unflattened* export can show the
wrong colour, silently — is now a documented, deliberate cost rather than an
unnoticed one.

**Three real bugs, all found by actually running the probe, not by
typechecking or the unit suite:**

1. **Drag reorder did nothing after the first pointer move.** The grip button
   held `setPointerCapture`, and every `pointermove` triggered a state update
   that re-rendered and re-ordered the row list — the captured element was no
   longer in the same place in the DOM the next event needed to reach. Fixed
   by dropping `setPointerCapture` for window-level `pointermove`/`pointerup`
   listeners registered in a `useEffect`, reading the latest drag state
   through a ref to dodge the stale closure the listener would otherwise
   capture.
2. **A simulated opacity drag reported "committed" at 100 no matter what the
   probe set the slider to.** Not a bug in the panel — the *probe* was setting
   `el.value` directly, which a React-controlled `<input>` cannot see, since
   React shadows the native setter to detect real changes. Fixed in the probe
   with the standard workaround (the native prototype's setter, called
   explicitly, before dispatching `input`). The panel's own commit-on-blur
   behaviour was correct throughout.
3. **Merge down looked permanently disabled after a drag-then-undo sequence**,
   which read like a bug and is not one: active-layer selection is UI state,
   not document history (the same design `select_layer` already has), so
   undoing a reorder can legitimately leave the bottom layer selected, where
   Merge down is correctly disabled. Fixed the probe to select a known
   non-bottom layer before asserting on the button.

**The renderer and the standalone compositor are cross-checked against each
other, not just against hand-computed values.** `probe-merge.ts` samples a
real rendered canvas pixel and compares it — within a two-unit rounding slack
— to `compositeStack()` run in Node against the same layer data, imported
directly rather than reimplemented for the check. This is the one place in
the unit that could have shipped two blend implementations that quietly
disagreed, and it is the check that would have caught it.

### Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | All four items §6.4 deferred are built: opacity, blend modes (all eight CSS Compositing modes), merge/flatten, drag reorder. The exporters question D left open is answered in §12.4 rather than carried forward again. Not 10: mobile still withholds the layer panel entirely (a phase-1 decision, unchanged, but phase 2 adds more controls to a panel that still has no small-screen form). |
| 2 | Correctness | 9 | The renderer's per-layer compositing and the standalone `compositeStack` agree on a real rendered pixel, not just on paper; merge/flatten produce byte-identical round-trips through undo including the palette; hidden layers about to be consumed by a merge are revealed first, in the same batch, so the visible result cannot change; opacity and blend-mode commits are exactly one undo entry regardless of how many intermediate slider events fired. Not 10: `flattenFrame`'s exporter approximation (§12.4) is a known, accepted gap on unflattened multi-layer exports with opacity or a non-normal blend mode — documented, not eliminated. |
| 3 | Tests | 9 | 24 new unit tests covering the blend math (hand-computed per mode, hidden/transparent no-ops, an opacity half-mix) and merge/flatten (null cases, hidden-layer reveal, round-trip, undo restoring layer position), plus schema/codec/commands extensions for the new fields, plus 24 browser checks across both themes exercising every control including the cross-check against the real canvas. Not 10: the eight blend modes are each checked at one colour pair; a wider matrix would catch a transposed formula sooner, though the CSS spec formula being shared code means all eight fail together if it were wrong, not silently apart. |
| 4 | Integration | 9 | `commit()` is still the only writer — merge/flatten are `batch` commands composed from existing primitives, not a new mutation path; `artwork-core/blend.ts` imports nothing but the schema and `parseHex` from `quantise.ts`, no DOM; the renderer's compositing is `save`/`restore`-scoped so it cannot leak `globalAlpha` onto layers it does not own; tokens only. Not 10: `Layers.tsx` grew substantially — active-layer strip, drag state, two footer rows — and is now the largest single component change layers has had; it works and is tested, but it is one more thing to reason about as a whole. |
| 5 | Design fidelity | 9 | Opacity slider, blend-mode select, and the second footer row read cleanly in both themes at the screenshot check, and the merge notice ("Merged 1 layer.") renders as the same `role="status"` line every other notice uses. Not 10: no reference measurement exists for this panel's phase-2 layout (there was nothing to measure against — newt's own layers panel was not part of the original audit), so the layout is this app's own judgement rather than a confirmed match. |
| 6 | No regressions | 9 | 681 tests (657 → 681), clean production build, six viewports clean, and every gating probe green in one `npm run probes` run — including `probe-layers.ts`, unchanged since phase 1 and re-run specifically because `Layers.tsx` was rewritten under it. `probe-agent-ui` and `e2e-agent` each failed once on this run and passed clean on an immediate re-run with no code change in between — a pre-existing timing flake in the mock-agent probes, confirmed unrelated to this unit by rerunning in isolation. |

**Overall: 9/10.**

### Deliberately left out

- **A mobile layers panel.** Unchanged from phase 1's decision (`14-layers.md
  §6.4`, `HANDOFF §6.4`) — still withheld below the tablet breakpoint, and
  phase 2 makes the panel taller, not smaller, so the gap did not close.
- **Per-blend-mode preview thumbnails or a visual mode picker.** A `<select>`
  matches every other control in this panel's register; a swatch grid is a
  bigger design commitment than this unit's four deferred items asked for.
- **Locking a layer independent of hiding it.** Not asked for in §6.4 or §12,
  and hide already prevents accidental edits to a layer you are not looking
  at.
- **A confirm dialog before Merge down or Flatten.** Both are undoable in one
  press, the same reasoning A2 already settled for the resize apply button —
  the count of what changes is visible in the panel before the click, and one
  undo is the escape hatch rather than a second modal.

---

## F — Animation · NEXT

### Context handed over

- **Settle this first, in writing, before any timeline UI exists.** Layers are
  per-frame in the format, so "add a layer" is ambiguous once a second frame
  exists: this frame, or all of them? `14-layers.md §9` states the three open
  questions. Everything else in this unit is downstream of that answer.
- `frame_add`, `frame_delete` and `frame_duration` commands already exist in
  `commands.ts` and are unused.
- The Timeline button is the last member of `showUnbuilt`.
- **From E — layers now carry opacity and a blend mode, and whatever the
  per-frame-vs-shared decision turns out to be, both fields travel with the
  layer either way.** `layerAlpha`/`layerBlendMode` in
  `lib/artwork-core/layers.ts` read a layer's own fields with the same
  default-when-absent pattern `hidden` and now `o`/`mode` all share; nothing
  about them assumes one frame. If the decision lands on "layers are shared
  across frames," a frame-independent opacity is free. If it lands on
  "per-frame," `mergeDownCommand`/`flattenCommand` in
  `lib/artwork-core/merge-layers.ts` are the worked example of composing a
  multi-layer result into one `batch` — the same shape a per-frame flatten (if
  animation ever wants one, e.g. for a thumbnail) would need.
- **`compositeStack` (`lib/artwork-core/blend.ts`) is the real compositor now,
  separate from the renderer's own `drawLayer` loop and separate from
  `lib/exporters/geometry.ts`'s `flattenFrame` approximation.** If a frame
  thumbnail or timeline preview needs a flattened raster of one frame's
  layers, `compositeStack` is the correct one to reach for — it is the one
  proven, by `probe-merge.ts`'s cross-check, to agree with what the canvas
  actually renders.

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
