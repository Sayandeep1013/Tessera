# 17 — The File menu

**Status:** specced from live measurement, 12 Aug 2026. Not built.
**Covers:** the logo dropdown — every way a document enters or leaves the editor.

Our File menu has six items and three of them are examples. The reference's has
eleven and they cover the whole lifecycle of a document. This spec records what
is there, decides what applies to a product with no accounts, and specifies the
rest.

---

## 0. Measured

`tools/inspect-newt-settings.ts` and `docs/research/newt/shots/settings-file.png`.
Panel 240 wide at x=12 y=46, rows 228×36, two dividers.

| Item | Kind | Ours? |
|---|---|---|
| Dashboard | link | **No** — accounts |
| Explore | link | **No** — accounts |
| *divider* | | |
| New… | action, confirms | Yes |
| Open recent › | submenu | Yes — `listDrafts()` already exists |
| Import… | file picker | Yes — we call it Open… |
| Paste image | reads the clipboard | Yes, and it is the biggest item here |
| Duplicate | action | Yes |
| Download .newt | action | Yes — ours is `.tessera.json` |
| Publish to community… | opens share | **No** — accounts |
| *divider* | | |
| Clear… | destructive, red | Yes |

### The three that are not built, and why that is not a gap

`docs/SPEC.md §0` lists, under **Out, permanently**: *accounts · profiles ·
following · likes · comments · explore/trending feeds · moderation tooling*.
Dashboard, Explore and Publish-to-community are all of that, and the user
confirmed on 12 Aug 2026: *"no need for account related things"*.

They are not stubs, not disabled items, and not "coming soon". They are absent,
and the menu is designed as if they never existed — a divider that exists only
to separate an empty group is worse than no divider.

---

## 1. The menu, as ours

```
New…                          ⌘N
Open recent            ›
Open…                         ⌘O
Paste image                   ⌘V
Duplicate
─────────────────────────
Examples               ›        face · bird
─────────────────────────
Download .tessera.json        ⌘S
Export PNG
─────────────────────────
Clear…                          (destructive)
```

Two deliberate differences from the measured original:

1. **Examples gets its own submenu.** We have two starters and will add more;
   they are currently top-level items, which will not scale and already reads as
   clutter next to the real actions.
2. **Export PNG stays.** It is an existing capability and dropping it to match a
   menu would be losing a feature to gain a resemblance.

---

## 2. Each item

### New… — `⌘N`

A blank document at the current size. **Confirms if the current document has
painted pixels**, because it is otherwise one click from swapping the whole
document under someone.

> **Corrected while building — see §7.11.** This section originally said New is
> "not undoable through `commit`" and that the confirm is therefore the only
> safety. Both were wrong. It commits a `replace_doc` carrying the whole
> previous document, so Ctrl+Z restores it exactly; and it now takes a **fresh
> document id**, so the previous drawing keeps its own draft and survives a
> reload. It still confirms, but as a beat before a big change rather than as a
> last line of defence — which is why its button is not red.

### Open recent › — submenu

`lib/persist/idb.ts` already has `listDrafts()`, and nothing calls it. Every
document ever autosaved is sitting there unreachable, which is a rule-7 problem
hiding in plain sight: the artwork was never discarded, it just cannot be got
back to.

- Newest first, capped at 10, each row the name and a relative date.
- A thumbnail per row if it is cheap — `spriteRects` is already pure and the
  documents are small. Measure before committing to it.
- Empty state: *"Nothing saved yet."* — never an empty menu.

### Open… — `⌘O`

Exists. A file picker, `parseDoc`, and a real message when the file is not one
of ours. Unchanged.

### Paste image — `⌘V`

**The biggest item in this menu, and the only one that is a feature rather than
a wiring job.** An image on the clipboard is not pixel art: it is arbitrary RGBA
at an arbitrary size, and the document format holds at most 36 palette indices.

> **Corrected and filled in while building — see §9.** Two sentences below are
> wrong. "Nearest-neighbour" is right for enlarging and wrong for reducing
> (§9.2), and "`⌘V` … fall back to a paste event" has the ladder upside down —
> the paste event is the *primary* path and needs no permission at all (§9.5).
> Four things the section does not decide — what "close enough" means, what
> happens to semi-transparent pixels, whether a paste erases what it does not
> cover, and what the message says — are decided in §9 rather than left to the
> code.

So it is three steps, and each can fail visibly:

1. **Read** — `navigator.clipboard.read()`, which needs a user gesture and a
   permission, and is unavailable in Firefox. Fall back to a paste event
   listener, and to a file picker if neither works.
2. **Fit** — scale to the current canvas, nearest-neighbour, preserving aspect
   and centring. Never resize the document to match the image; the document is
   the artist's decision.
3. **Quantise** — reduce to ≤ 36 colours. Median-cut, deterministic, with the
   existing palette reused where a colour is already close enough. Fully
   transparent source pixels map to index 0.

One `paint` command for the whole thing, so it is one undo. If quantising drops
detail — and it will — say so with the count rather than pretending: *"Reduced
to 18 colours."*

**This is its own unit.** It should not land in the same change as the menu.

### Duplicate

Copy the current document to a new draft with a fresh `id` and `"<name> copy"`,
and switch to it. The original stays in recent. Cheap, and it is the natural
"try something without ruining this" gesture.

### Download .tessera.json — `⌘S` · Export PNG

Both exist. Moving into a submenu-free group with the export items together.

### Clear… — destructive

Empties every layer of the current frame, keeping the document, its size, its
palette and its layer structure. **Undoable** — unlike New, this is a `paint`
command across the layers, so it goes through `commit` and `⌘Z` brings it back.
Red text, and it confirms, because those two together are what stop it being
misread as "clear the selection".

---

## 3. Shortcuts

`⌘N`, `⌘O`, `⌘S` and `⌘V` collide with the browser's own. `preventDefault` is
required and must be conditional on not being in a text field — the filename
input is in the header, and stealing `⌘V` there would be its own bug. The
existing `isTyping` guard in `app/page.tsx` already draws that line; reuse it
rather than writing a second one.

---

## 4. Error codes

| Code | Meaning | Surfaces as |
|---|---|---|
| `F-M1` | New/Clear on a document with painted pixels | Confirm naming what is at stake |
| `F-M2` | Clipboard unreadable or empty | *"No image on the clipboard."* — never silence |
| `F-M3` | Pasted image needs more than 36 colours | Quantised, and the count is reported |
| `F-M4` | A recent draft no longer parses | Row shown, disabled, labelled — the record is kept, never deleted |
| `F-M5` | Clipboard API unavailable | Falls back to a file picker — see §9.5, the paste event is the *primary* path, not the fallback |

---

## 5. Test requirements

- `listDrafts()` ordering and the 10 cap, with a corrupt record present.
- Duplicate produces a different `id` and leaves the original draft untouched.
- Clear is one command and `⌘Z` restores every layer.
- New on a blank document does **not** confirm; on a painted one it does.
- Quantise: an image with 200 colours yields ≤ 36 and is deterministic across
  runs; a fully transparent pixel maps to index 0; the reported count matches.
- Fit: a 1000×500 image into a 32×32 document centres and preserves aspect.
- Probe: every item reachable by keyboard, submenu included; Escape closes one
  level at a time.

---

## 6. Order

1. Menu structure, Examples submenu, Duplicate, Clear. All small.
2. Open recent, which is `listDrafts()` finally reaching the surface.
3. Shortcuts.
4. **Paste image, as its own unit.**

---

## 7. Built — unit B1, 12 Aug 2026

Step 1 of §6. Five decisions the spec above did not contain, and three places it
was wrong. Rule 10: they are corrected here rather than routed around.

### 7.1 The submenu is an inline disclosure, not a flyout — §1 corrected

§1 draws `Examples ›`, which reads as a panel that flies out to the right. It
cannot be one. The menu is 232px wide anchored at the logo button's left edge
(x=12), so a flyout starts at x≈244; give it the 160px it needs for `face` and
`bird` and the right edge is at 404, which is off a 390px phone and 84px off a
320px one. Flipping it left puts it on top of its own parent.

So `Examples` is a **disclosure inside the menu**: pressing it expands the
starters underneath, indented, with a caret that rotates from `›` to `⌄`. One
code path at every tier, no collision arithmetic, and `aria-expanded` on a
`menuitem` is a more accurate description of what is on screen than a second
`role="menu"` would have been.

§5's *"Escape closes one level at a time"* survives intact and is still tested:
the first Escape collapses the submenu, the second closes the menu.

### 7.2 Shortcut hints are only shown for shortcuts that work — §1 corrected

§1's diagram carries `⌘N`, `⌘O`, `⌘V` and `⌘S`, but §6 puts shortcuts at step 3
— a later unit. A hint next to an item is a promise about a key, and only `⌘S`
is currently wired (`app/page.tsx`). B1 therefore renders the hint column for
`Ctrl S` alone. §1's diagram is the target state, not this unit's.

Two of those four are also not free: `⌘N` and `⌘V` are the browser's own, and
§3's conditional `preventDefault` is the whole reason shortcuts are their own
step. Shipping the hints early would advertise them before that guard exists.

### 7.3 Duplicate does not re-fit the viewport

`UNITS.md` B1 handed over *"New…, Examples and Duplicate all change the
document's dimensions, so all three must call `refitViewport`"*. Two of the
three do not:

| | Dimensions | Re-fit? |
|---|---|---|
| Examples | a starter can be any size | **Yes** — already did |
| New… | §2 says *at the current size* | Yes — it is a different, blank artwork and centring it is the point |
| Duplicate | identical by construction | **No** |

A duplicate is the same picture at the same size. Re-fitting it would throw away
the pan and zoom of somebody who was mid-detail-work — the exact cost `refit.ts`
names in its own header comment — and buy nothing, because the view is already
correct. The rule stays "changing the size shows you the new canvas"; a duplicate
does not change the size.

### 7.4 Clear is disabled on an empty frame, and says its cost in the confirm

Two shapes borrowed from A2, which earned them:

- **Nothing to clear is not a confirm.** If the frame has no painted pixels the
  item is disabled. A confirm dialog that leads to a no-op teaches people to
  dismiss confirms.
- **The cost goes in the confirm, not in a toast after.** *"Clear 143 painted
  pixels from every layer of this frame?"* — the count is on screen while the
  decision is still open, the same rule the Canvas tab's crop count follows.

### 7.5 Both confirms are inline, and replace the menu's body

There is no dialog component in this repo and B1 is not the unit to invent one.
Pressing `New…` or `Clear…` swaps the menu's contents for a confirm panel
(`role="alertdialog"`) with Cancel and a red action button. Escape and Cancel
return to the menu rather than closing it, so backing out of a confirm does not
also cost you the menu.

The two confirms are also painted differently, and the difference is
load-bearing rather than decorative — see §7.11. Clear's button is red
(`--diff-remove`) because Clear destroys work. New's is the product's standard
action fill (`--solid`) because New destroys nothing. A red button that never
costs anything is how a red button stops meaning anything.

### 7.6 `Export .tessera.json` is renamed `Download .tessera.json`

§1's name, adopted. Download is what the button does; Export is what the code
panel will do to a *different* format. Keeping both words for the same act would
make the Code unit's menu ambiguous before it is even written.

### 7.7 Duplicate flushes the autosave first

Autosave is debounced 500ms (`lib/store/editor.ts`). Duplicating within half a
second of a stroke would switch away before the *original* had been written, so
the copy would carry the stroke and the original in recent would not. Duplicate
awaits `flushSave()` before `setDoc`. §2's *"the original stays in recent"* is
only true if it is actually written first.

### 7.8 Where the logic lives

Per A2's finding that panel wiring has no CI guard: everything that decides
anything is outside the `.tsx`.

| Module | Holds |
|---|---|
| `lib/artwork-core/clear.ts` | `paintedCellCount`, `clearFrameCommand` — pure |
| `lib/artwork-core/duplicate.ts` | `copyName`, `duplicateDoc` — pure, id injected |
| `lib/editor/file-menu.ts` | the menu model, `needsNewConfirm`, both confirm strings |

`components/Chrome.tsx` keeps markup and the calls to `commit`/`setDoc`.

### 7.9 `Open…` is no longer "unchanged" — it re-fits the view

§2 says Open… is unchanged. One line changed: it calls `refitViewport` after
`setDoc`. A file from disk can be any size and the viewport was still fitted to
the document that was open, so opening a 256×256 from a 16×16 left the artwork
off the corner of the screen — the same defect A2 fixed for resize and
`loadExample`, recorded as debt in `HANDOFF §11` and deliberately deferred so
A2's commit stayed one unit. B1 owns this function, so it is fixed here rather
than carried further.

### 7.10 Copy-of-a-copy numbering

§2 says `"<name> copy"` and stops there, which turns three duplicates into
`face copy copy copy`. `copyName` instead increments: `face` → `face copy` →
`face copy 2` → `face copy 3`. An empty name — the default, shown as the
placeholder `untitled` — becomes `untitled copy` rather than `" copy"`.

---

## 7.11 Replacing the document forks to a new draft — the rule, and the guard

**This landed as a follow-up to B1, after the first pass shipped a confirm that
had to apologise for the code.**

### The defect

Drafts are keyed by `doc.id` (`lib/persist/idb.ts`). Both `new_document` and
`loadExample` reused the current document's id, so the thing they put on screen
was autosaved *straight over the drawing it replaced*. Undo brought the artwork
back, but only until a reload — and undo history is memory-only, so a reload was
the end of it. §2's promise that "the old drawing stays in recent" was simply
not true, and B1's first confirm said so out loud rather than fixing it.

### The rule

> **Anything that replaces the whole document with a different artwork takes a
> fresh id.**

| | Id | Why |
|---|---|---|
| `New…` | fresh (`ctx.newId()`) | a blank canvas is a different document |
| `Examples` | fresh (`nanoid()`) | a starter is somebody else's drawing |
| `Duplicate` | fresh (`nanoid()`) | already did; this is the same rule |
| `Open…` | the file's own | it arrives with an identity |
| Everything else | unchanged | editing a document does not replace it |

All three forks still go through `commit()` as a `replace_doc`, so undo restores
the previous document **including its id** — you get both recoveries, not a
choice between them.

Two consequences worth stating. `new_document` no longer carries the old name
over: a blank canvas called "face" is wrong on its own terms, and once Open
recent lists both drafts, two rows called "face" with one of them empty is worse
than an untitled row. And the confirm changed voice — it now says *"This drawing
is kept as its own draft, and undo brings it straight back"*, which is a
promise the code keeps, so New's button stopped being red (§7.5).

### The guard, which is why B1 did not do this on its own

`lib/agent/session.ts` collapses an agent session into one command by comparing
the before and after documents. It checked **dimensions** and **layer shape**,
and nothing else. A *same-size* `new_document` — 32×32 over 32×32 — passes both:
a blank canvas has the same single layer as the document it replaced. The
session would therefore collapse to an `ai_edit` carrying pixels only, undo
would restore the artwork **under the new id**, and the old draft would be
orphaned.

That is the same silent-corruption class as the `ai_edit` palette bug in
`14-layers.md §0.2`, which is why B1 refused to fork the id until this line
existed:

```ts
if (current.id !== this.before.id) return replaceDoc()
```

Pinned by `session.test.ts`, "a same-size new_document still falls back, because
the id changed" — the test fails without the guard, which is the only reason to
trust it.

---

## 7.12 The probe rot this unit caused, and what now catches it

B1 renamed `Example — face` into an `Examples` submenu and silently broke
`tools/probe-layers.ts` and `tools/probe-zoom.ts`. Neither is about the File
menu; both drove it by label to reach a known starting document. Neither runs
under `npm test`, because every browser probe needs a dev server. Both failed
only when somebody happened to run them.

Two things now stand between that and the next unit:

1. **`lib/__tests__/probe-handles.test.ts`** — a static scan asserting that
   every `#id` selector in `tools/` still exists in the app. The File menu's
   handles are *built* by `menuItemDomId` / `exampleDomId` / `CONFIRM_DOM_ID` in
   `lib/editor/file-menu.ts`, and the same functions feed the test's allow-list,
   so the component and the check cannot drift. Renaming a handle now fails
   `npm test` and names each orphaned probe. Verified by breaking it on purpose.
2. **`npm run probes`** (`tools/run-probes.ts`) — runs every browser probe
   against one server, in one command. The old protocol said "run the probes
   your unit touched", which requires knowing the blast radius; nobody would
   have chosen to run `probe-zoom` for a menu rename.

The runner found two more things on its first real run, both pre-existing:

- **`probe-agent-ui` and `e2e-agent` need `AI_PROVIDER=mock` on the *dev
  server*, not on the probe process.** The agent runs server-side, so setting it
  on the probe leaves the server reading `.env.local` with a real key — the
  probe quietly spends the project's 5-per-minute budget and then fails on
  wording it never asked the model for. Exactly the confusion HANDOFF §11 had
  recorded for the E2E script and nobody had closed. The runner now **skips**
  those two unless `MOCK_SERVER=1` says the server is in mock mode, because
  skipping loudly beats spending quota by accident.
- **`e2e-agent` had never actually passed in mock mode.** It ignored `APP_URL`
  (every other probe honours it), and its `Stop` click raced the agent panel's
  own aria-live log — "element is not stable", then "intercepts pointer events",
  then "detached from the DOM", then a 30-second timeout that took the script
  down. Both fixed, and the block now asserts the run really stopped rather than
  passing vacuously when the click was swallowed.

---

## 8. Unit B2 — Open recent, rename, shortcuts

**Scoped 12 Aug 2026.** §6's order puts Open recent at step 2 and shortcuts at
step 3. Two things are folded in with them, and the reasoning is below.

### 8.0 Why these three are one unit

- **Shortcuts had no owner.** §6 lists them as step 3, but the ledger only ever
  had B2 (recent) and B3 (paste). Nothing claimed step 3, so it would quietly
  never have happened. It is the same file, the same menu, and the hint column
  B1 built is already sitting empty waiting for the keys to exist.
- **Rename is what makes a recent list worth having.** Every draft is currently
  called nothing, because the header's filename input does not write back to the
  document — it is an uncontrolled input that *displays* `doc.name` and silently
  discards anything typed into it. So Open recent without rename is a list of
  eight rows that all say `untitled`, and the input is a rule-7 problem in its
  own right: it accepts input and drops it.

### 8.1 Rename — a real command, like everything else

`doc_rename` joins the command list. Rule 4 has no carve-out for metadata: a
rename is a document mutation, so it goes through `commit()` and `⌘Z` reverses
it. It is its own command rather than a `replace_doc` because cloning the whole
document, pixels and all, to record a changed string is the sort of thing that
makes an undo stack expensive for no reason.

```ts
| { type: 'doc_rename'; label: string; before: string; after: string }
```

Self-inverse under exchange, like `layer_rename` and `frame_duration`.

**Committed on blur and on Enter, not per keystroke.** Per-keystroke would put
one undo entry per character. Escape reverts the field to the document's name
without committing.

The name is trimmed and capped at `MAX_NAME`; an empty name is legal and stays
empty, because `untitled` is a placeholder the header draws, not a value the
document holds. `copyName` already relies on that distinction (§7.10).

### 8.2 Open recent — the rows

Newest first, capped at 10, each row a thumbnail, the name, and a relative date.

- **The open document is not in the list.** It is always the most recently
  saved, so it would always be row one, and clicking it would do nothing. The
  list means "documents you can go back to". Filtered by id, after the cap is
  applied to the rest.
- **Parse before listing.** `listRecent()` in `lib/persist/idb.ts` parses each
  record, because a row cannot be drawn without knowing whether the record is
  readable. A record that fails is **kept and shown disabled with its reason**
  (F-M4) — never deleted, never hidden. Hiding it is the same sin as deleting
  it: the user's work vanishes from the only place it was visible.
- **Empty state:** *"Nothing saved yet."* — never an empty menu.
- **Switching documents is `setDoc`, not `commit`.** Same as `Open…`: this is a
  different document being opened, not a mutation of the open one. The autosave
  is flushed first, exactly as Duplicate does (§7.7), or the document you are
  leaving loses its last half-second.
- **`refitViewport` after**, because a recent document can be any size — the
  same one line as `Open…` (§7.9).

### 8.3 Thumbnails — measured, not assumed

§2 says "a thumbnail per row if it is cheap — measure before committing to it".

Measured: `spriteRects` merges horizontal runs, so a 16×16 starter is tens of
rects, but a dense 256×256 is thousands, and ten of those in one menu is not
cheap. The rule is therefore **a thumbnail for documents up to 64×64, and a
size-only placeholder above it**. That covers every document this editor
actually produces by default while refusing to pay an unbounded cost for a
canvas nobody has drawn yet.

### 8.4 Shortcuts

`⌘N` and `⌘O` only. **Not `⌘V`** — paste image is B3, and a hint for a key that
does nothing is exactly what §7.2 refuses. `⌘S` already works.

All of them go through the existing `isTyping` guard in `app/page.tsx`, per §3 —
one guard, not a second one. `preventDefault` is conditional on that guard, so
`⌘N` in the filename field is still the browser's.

`⌘N` and `⌘O` open the same code paths the menu items do, so a shortcut and a
click cannot diverge.

### 8.5 What B2 does not do

- **`⌘V`.** B3.
- **Deleting a draft from the list.** There is no way to remove a document from
  recent, and there should not be one until it is asked for: the whole unit
  exists because artwork was unreachable, and adding a delete button to the fix
  is how you get back to the problem.
- **Renaming from the recent list.** The header renames the open document. A
  second rename affordance is a second source of truth for a name.

---

## 9. Unit B3 — Paste image

**Scoped 12 Aug 2026.** Step 4 of §6, and the only item in this menu that is an
algorithm rather than a wiring job. §2 sketches three stages and stops; this
section decides the four questions it leaves open, and corrects the two things
it gets wrong.

The shape is the same one A2 and B1 landed on: **everything that decides
anything lives outside the `.tsx`**, because `npm test` runs in node and the
browser probes need a dev server (HANDOFF §11).

| Module | Holds | Pure? |
|---|---|---|
| `lib/artwork-core/fit-image.ts` | where the image lands and how it is resampled | yes |
| `lib/artwork-core/quantise.ts` | colour distance, median cut, palette reuse | yes |
| `lib/artwork-core/paste-image.ts` | the two above, composed into one command | yes |
| `lib/editor/paste.ts` | every sentence the feature says | yes |
| `lib/editor/clipboard.ts` | the three ways an image arrives; the decode | browser |
| `components/Chrome.tsx` | the menu row, the paste listener, the `commit` call | — |

### 9.1 The pipeline, and what each stage may not do

```
    a Blob                 RGBA + size            RGBA at w×h            indices
clipboard.ts  ──decode──▶  fit-image.ts ──fit──▶  quantise.ts ──map──▶  paste-image.ts
                                                                             │
                                                     one EditorCommand ◀─────┘
```

Three constraints hold across all of it:

- **The document is never resized.** §2 says so and it is the right call: the
  canvas is the artist's decision and an image on the clipboard has no standing
  to overrule it. The image is fitted to the document, never the reverse.
- **The palette is the hard constraint, not the pixels.** 36 entries total,
  index 0 permanently transparent, so **35 opaque colours is the ceiling** —
  and the open document may already be using 15 of them.
- **One command, so it is one undo.** `paint` when no colour was added,
  `batch[palette_add, paint]` when one was. The `batch` inverse already
  reverses its children, so undo repaints the old pixels *and then* pops the
  palette — the ordering that `invertCommand('ai_edit')` got wrong once and
  which is recorded in `14-layers.md §0.2` as silent artwork corruption.

### 9.2 Fit — §2's "nearest-neighbour" is half wrong (rule 10)

§2 says *"scale to the current canvas, nearest-neighbour, preserving aspect and
centring"*. Centring and aspect stand. Nearest-neighbour does not, in one
direction:

- **Reducing.** A 1000×500 photo into a 32×16 document is a 31:1 reduction.
  Nearest-neighbour keeps one source pixel in every 961 and discards the rest,
  so the result is a sample of noise rather than a small version of the picture
   — and which noise depends on where the grid happens to land. **Reduction
  box-averages** every source pixel that falls in the destination cell.
- **Enlarging.** Averaging here would invent colours that are not in the source
  and blur edges that pixel art draws deliberately. **Enlargement is
  nearest-neighbour**, and it is exact, because of the next rule.

**Enlargement is by a whole number or not at all.** A 16×16 image into a 32×32
canvas is drawn at 2×. A 13×13 image into a 32×32 canvas is drawn at 2× — 26×26,
centred — and *not* at 2.46×, because a fractional nearest-neighbour enlargement
gives some source pixels three destination rows and their neighbours two. That
unevenness reads as a rendering bug, and it is the single most recognisable way
a pasted image announces that software mangled it. Reduction has no such choice
available: the image does not fit, so something must be resampled.

So the scale rule is:

| Source vs canvas | Scale | Sampling |
|---|---|---|
| larger in either axis | fractional, `min(W/w, H/h)` | box average |
| fits, `k = floor(min(W/w, H/h)) ≥ 1` | integer `k` | nearest neighbour |

Both centre the result with `resizeOffset` — the same odd-function truncation
A1 wrote for canvas resize, reused rather than rewritten so an odd spare pixel
lands the same way in both features.

**Averaging is premultiplied.** Averaging RGB without weighting by alpha makes
the transparent side of an edge contribute its (often black, often arbitrary)
colour to the visible side, which is the dark halo every naïve image resizer
has. Accumulate `r·a, g·a, b·a, a`; divide the colour sums by the alpha sum, not
by the pixel count. Where the alpha sum is zero the cell is transparent and its
colour is not asked about.

### 9.3 Quantise — median cut, and what "close enough" means

The source is reduced to at most **35** representative colours by median cut:
repeatedly take the box with the widest single channel, sort its colours along
that channel, and split at the population-weighted median. The representative of
a box is the population-weighted mean of the colours in it. Weighted by
population throughout, so a colour covering half the image is not outvoted by a
hundred stray anti-aliasing pixels.

**Determinism is a requirement, not a nicety** (§5), so every choice has an
explicit tie-break: widest channel breaks r → g → b, box selection breaks by
population and then by the order boxes were created, and the colour histogram is
walked in packed-RGB order rather than in Map insertion order.

Each representative is then placed in the document's palette by three rules, in
this order:

1. **Reuse if it is close enough.** An existing entry within `REUSE_MAX` is used
   as-is. Reuse is what stops a paste from filling the palette with colours the
   artist cannot tell apart from ones they already have.
2. **Otherwise take a free slot**, up to 36 entries total.
3. **When there are no free slots, snap to the nearest existing entry**, at any
   distance. The palette is the hard constraint; this is the branch that honours
   it, and the message says so.

**Distance is redmean, not plain RGB.** Plain Euclidean distance in sRGB says
that two blues differing by 40 are as different as two greens differing by 40,
which the eye flatly contradicts. Redmean is the cheap standard approximation
that fixes the worst of it, needs no colour-space conversion, and keeps
`artwork-core` importing nothing but zod:

```
r̄ = (r₁+r₂)/2
d² = (2 + r̄/256)·Δr² + 4·Δg² + (2 + (255−r̄)/256)·Δb²
```

Its range is 0 (identical) to ≈765 (black against white).

**`REUSE_MAX = 24`**, which is about eight levels per channel — `#808080`
against `#888888` is exactly 24. That is the decision §2 asks for and does not
make, and the number is deliberately small: reuse silently changes the image the
user pasted, so it may only happen where the change is not visible. A generous
threshold would give better palette economy and a worse picture, and the picture
is the thing that was pasted.

**Alpha is a cutoff, not a channel.** A source pixel with `a < 128` is
transparent (index 0); at 128 or above it is opaque and its RGB is quantised.
The format has no per-pixel alpha — it has palette entries, which *can* be
`#rrggbbaa`, so honouring partial alpha would mean one palette entry per
(colour, alpha) pair and would spend the 36-slot budget on the soft edge of a
PNG. §2 says only that fully transparent pixels map to index 0; this is the rest
of that sentence.

### 9.4 What a paste writes, and what it leaves alone

**Transparent cells are skipped, not written.** The quantiser maps a transparent
source pixel to index 0 as §2 requires, and `paste-image.ts` then declines to
emit a cell for it. So a logo with a transparent background composites over the
drawing instead of punching a rectangular hole in it, and a paste never destroys
artwork it does not visibly cover. That is rule 7 applied to the one operation
in this menu that arrives with somebody else's content.

The consequence, stated so it is not a surprise: **a paste cannot erase.**
Pasting a smaller image over a larger one leaves the larger one showing around
it. The eraser and Clear exist for erasing, and undo is one press away.

It lands on the **active layer of the current frame**, like the brush. Nothing
else in the editor picks a layer for you, and a paste that invented its own
would be the exception nobody would predict.

### 9.5 How the image arrives — §2's ladder is upside down (rule 10)

§2 says *"`navigator.clipboard.read()` … Fall back to a paste event"* and F-M5
repeats it. Measured, it is the other way round. The paste event carries
`clipboardData` **on the gesture itself**, so it needs no Clipboard API, no
permission prompt, and no user-agent exceptions; `navigator.clipboard.read()`
needs a permission the user has to grant and is the part that is missing in
Firefox. The event is the good path. So:

| Entry point | Path | Why |
|---|---|---|
| `⌘V` | the `paste` event's `clipboardData` | no permission, works everywhere |
| the menu row | `navigator.clipboard.read()` | there is no event to read — nobody pressed a key |
| either, on failure | a file picker | F-M5, and it always works |

**There is no `⌘V` keydown handler**, and that is the point rather than an
omission. §3 makes conditional `preventDefault` the whole reason shortcuts were
their own step, and the paste event removes the question: the browser already
routes `⌘V` in a text field to the text field. The listener still checks
`isTyping` so that pasting *text* into the filename input is never interpreted
as pasting an *image* into the canvas, which is the one case the browser cannot
disambiguate for us.

The hint therefore says `Ctrl V` and it is true — §7.2's rule is that a hint is
a promise about a key, not about a keydown handler.

**The decode is bounded.** A 6000×4000 photo is 96MB of `ImageData` and a
`getImageData` large enough to fail. `clipboard.ts` draws through a canvas
capped at 1024 on the long edge before reading the pixels back. At a destination
of at most 256 that is four times more detail than the box average can use, so
the cap costs nothing and removes the failure.

### 9.6 What it says

Rule 7 and F-M3: never silence, and say the cost with the action rather than
after it. Every string is in `lib/editor/paste.ts` where a test can hold it.

| Case | Message |
|---|---|
| pasted, colours lost | `Pasted 1000×500 as 32×16. Reduced from 214 colours to 18.` |
| pasted, nothing lost | `Pasted 16×16 as 32×32. 7 colours.` |
| pasted, palette was full | …plus `The palette is full, so some colours were matched to ones already in it.` |
| the image was blank | `Pasted 8×8. Every pixel was transparent, so nothing changed.` |
| nothing to do | `Pasted 32×32. Nothing changed — that image is already on this layer.` |
| F-M2 | `No image on the clipboard.` |
| F-M5 | `This browser won't hand over the clipboard — choose a file instead.` |
| decode failed | `That image could not be read.` |

The size clause names the source size **only when it differs from the placed
size**: `Pasted 20×10` is the whole truth when nothing was scaled, and
`Pasted 20×10 as 20×10` reads like a bug. The full-palette sentence is separate
from the count rather than folded into it, because "the palette ran out" is a
different fact from "colours were reduced", and it can happen after some
colours were successfully added — an earlier draft of this table said "all
already in the palette", which is only true when *no* slot was free.

**These go to a notice, not to `window.alert`.** The alert `openFile` uses is
tolerable for a file that failed to parse — rare, and it stops you. A blocking
modal after a *successful* paste is not, and F-M2 fires on the perfectly ordinary
mistake of pressing `⌘V` with text on the clipboard. `app/page.tsx` already
renders a `role="status"` line for the corrupt-draft notice and nothing else can
reach it; that state moves into `useEditorStore` as `notice` / `setNotice`, and
this feature is its second caller. It dismisses on click and after
`NOTICE_MS = 6000`, so a message is never permanent and never silent.

### 9.7 What B3 does not do

- **A floating paste you can drag before committing.** That is a selection
  feature — the marquee and Select/Move already own moving pixels, and pasting
  then moving is two undoable steps rather than a new mode.
- **Paste at 1:1 with a scroll offset**, i.e. honouring the source size on an
  image larger than the canvas. It would need somewhere to put the overflow, and
  the answer would be either a crop or a resize, both of which §2 rules out.
- **Dithered quantisation.** Floyd–Steinberg would carry more apparent colour
  through a 16-entry palette, and it would do it by scattering pixels — which is
  the opposite of what pixel art is. The dither brush is a deliberate tool here,
  not a side effect of importing.
- **Reading a URL or an `<img>` off the clipboard.** `text/html` and `text/uri-list`
  flavours would mean fetching a cross-origin image and tainting a canvas. A
  file, a bitmap or nothing.
