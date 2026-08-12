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
unsaved painted pixels**, because it is otherwise one click from destroying
work. Not undoable through `commit` — it replaces the document — so the confirm
is the safety, and the dialog says the old drawing stays in recent.

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
| `F-M5` | Clipboard API unavailable | Falls back to the paste event, then to a file picker |

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

This is also what keeps the two verbs honest about their difference (§2): Clear
says *"Undo will bring it back"*, New says *"This cannot be undone"* — and New's
also says the old drawing stays in recent, which is true and is the only reason
New is allowed to be a one-way door.

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
