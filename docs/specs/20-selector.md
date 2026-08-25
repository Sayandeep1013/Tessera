# 20 — The selector tool: object select, multi-select, drag

**Status:** specced and built in one session, 25 Aug 2026 — unit **J**.
**Covers:** generalising `editor.selection` from a rectangle to a pixel mask; click / shift-click
object select on the existing `select` (V) tool; transparency-aware drag, arrow-key nudge, Esc,
Del/Backspace; mask-boundary marching ants (static, per `renderSelection`'s own constraint).

**The user's words:** *"a selector tools by which i can move the content in the canvas grid ..
like what excalidraw does .. there are multiple items .. i select and i can drag the selected
items."* Scoped via `AskUserQuestion` to **object select + multi + drag**, explicitly excluding
lasso, clipboard cut/copy/paste, and flip/rotate — recorded in `docs/UNITS.md`'s unit J block,
which is the research this spec formalises. Read that block for the full history; this file is
the sub-spec the unit's own protocol requires before code.

---

## 1. What exists today, and what changes

| Thing | Before | After |
|---|---|---|
| `editor.selection` | `{ x, y, w, h } \| null` — a rectangle | `Selection \| null` — a bounding box **plus a mask relative to it** (§2) |
| `marquee` (M) | Drags out a rectangle; its "mask" is implicitly every cell in it | **Unchanged in behaviour.** Now expressed as a fully-filled `Selection` — a rectangle is a mask special case, not a second type. |
| `select` (V) | Click inside the rect drags its contents; click outside drops it | Click a contiguous non-transparent blob to select it; shift-click adds/removes a blob; drag moves the whole (possibly multi-blob) mask, transparency-aware |
| `renderSelection` | `ctx.strokeRect` twice (white, then dashed black) around the rect | Traces the mask's real edges, still two-tone, still **static** — see §4 |
| Arrow keys / Del / Esc | Unbound | Nudge / clear / deselect the current selection, whichever tool made it |

**Marquee's rectangle-including-transparent-gaps move is correct, existing, tested behaviour and
this unit does not touch it.** The "square hole" the user described is specific to the *new*
click-to-select path: a blob's mask is built from actually-painted pixels by construction, so it
can never carry a transparent gap along with it when it moves. Decision #2 in the unit J ledger
block says this explicitly and it is worth restating here because it is the one thing in this spec
most likely to be mistaken for a bug in the other tool.

---

## 2. The `Selection` type — the decision the ledger left open

```ts
// lib/editor/selection.ts
export type Selection = {
  x: number; y: number   // bounding-box origin, document space
  w: number; h: number   // bounding-box size
  mask: Uint8Array        // length w*h, 1 = selected, indexed [ry*w+rx] relative to (x,y)
}
```

Bounding box + relative mask, exactly the shape the ledger flagged as "not committed, the
sub-spec's first real decision" — now committed. Reasons, concretely:

- **Cheap iteration and cheap render bounds.** Every consumer (move, nudge, delete, the outline
  tracer) needs to walk "the selected cells", and a bbox-relative mask makes that a tight double
  loop over `w*h`, not a search over the whole canvas.
- **A filled rectangle is `mask.fill(1)`.** No second type, no `kind: 'rect' | 'mask'` union to
  keep in sync — `selectionFromRect` below is a three-line function, not a parallel code path.
- **Cheap containment and rendering-bounds checks** fall out of the same bbox, e.g. deciding
  whether a click is anywhere near the selection before touching the mask at all.

Construction and combination, all pure, all in `lib/editor/selection.ts` (no React, no DOM — same
constraint as `lib/editor/brush.ts`):

| Function | Purpose |
|---|---|
| `selectionFromRect(x, y, w, h)` | Marquee's case — every cell in the box is selected. |
| `selectionFromPoints(points)` | Object-select's case — bbox is the tight bounds of the point list, mask marks exactly those points. |
| `inSelection(sel, x, y)` | Hit test, mask-aware (not bbox-aware) — the gap between two disjoint blobs is inside the bbox but not in the mask. |
| `selectionCells(sel)` | Enumerate selected cells in absolute document coordinates. |
| `unionSelection(a, b)` / `subtractSelection(a, b)` | Shift-click add/remove. Both recompute a **tight** bbox — `subtractSelection` can shrink or empty it. |
| `isSubsetOf(sub, sup)` | Shift-click's "is this blob already fully selected" branch. |
| `translateSelection(sel, dx, dy)` | Shift the whole selection after a completed move or nudge — same shape, offset origin. |
| `selectionOutline(sel)` | The mask's boundary, as merged per-side runs — §4. |
| `movePreviewCells(sel, lifted, dx, dy)` | Live-drag preview cell math — §3.3. |
| `selectionPaintCells(px, w, h, sel, dx, dy)` | Discrete move cell math (nudge) — §3.3. |
| `selectionClearCells(px, w, sel)` | Del/Backspace cell math — §3.5. |

`subtractSelection` can return a selection with `w === 0` (nothing left); every caller treats that
as "deselect" (`setSelection(null)`), not as a zero-size selection object living in the store —
the store's `selection` field is `Selection | null`, and empty is `null`, not a degenerate value.

---

## 3. Interactions — the `select` (V) tool

All of the following read the **active layer** of the **active frame**, exactly like paint, fill
and today's move — never the composite. Decision #3 in the ledger is explicit about this, and it
matches every other tool already in the codebase (`14-layers.md §5`).

### 3.1 Click (no modifier)

1. If the current selection exists and the clicked cell is **inside its mask** (not just its
   bbox — the gap between two disjoint blobs is not a hit): start a **move**, lifting the whole
   current selection (every selected cell, however many disjoint blobs), regardless of which blob
   is under the cursor. This is decision #5: a drag moves the group, not the clicked member.
2. Otherwise, read the clicked pixel on the active layer.
   - **Transparent (index 0):** deselect (`setSelection(null)`) — this is today's "click outside
     drops it", generalised from "outside the rect" to "on nothing".
   - **Non-transparent:** flood-fill non-transparent connectivity from that point (§3.2,
     4-connected) and **replace** the current selection with the resulting blob.

### 3.2 The flood-fill generalisation

`lib/artwork-core/ops.ts`'s `floodFillPoints` matched by exact palette index, because its only
caller was bucket-fill. Object-select needs a different rule — any non-transparent index joins —
so a multi-coloured shape (outline plus several fill colours, all touching) selects as one item.
Per the ledger: generalise the one flood fill rather than writing a second one next to it.

```ts
export function floodFillPoints(
  px: Uint8Array, w: number, h: number, sx: number, sy: number,
  matches: (value: number, seed: number) => boolean = (v, seed) => v === seed,
): Array<[number, number]>

export function blobPoints(px: Uint8Array, w: number, h: number, sx: number, sy: number): Array<[number, number]>
// = floodFillPoints(px, w, h, sx, sy, (v) => v !== 0), short-circuited to [] when the seed itself
// is transparent — the caller wants "select the blob here", and there is no blob on a transparent
// pixel. (Canvas.tsx also checks this before calling, for the "deselect" branch above, but the
// function is safe either way — matches(0, 0) is false, so an unguarded call returns [] too.)
```

The default parameter means every existing caller — bucket-fill, the `flood_fill` op the AI agent
uses — is untouched; only object-select passes the new predicate.

### 3.3 Shift+click

1. Read the clicked pixel. **Transparent → no-op.** No selection change, no drag starts.
2. Otherwise flood-fill the blob at that point (§3.2).
3. If every cell of that blob is already selected (`isSubsetOf`), **subtract** it — this is the
   toggle-off case, shift-clicking an already-selected item drops it.
4. Otherwise **union** it in.

Shift+click never starts a drag by itself, even if the resulting cell is one you then hold the
mouse down on — toggling membership and moving are two different gestures, matching how every
other editor with this pattern separates them. A plain click-and-drag (§3.1) is what moves.

### 3.4 Drag

Starting inside the mask (§3.1 case 1) moves every selected cell by the same delta, live-previewed
exactly like today's rect move — `previewMoved(cells, values)` in `Canvas.tsx` already takes an
arbitrary cell list and a value map, so the preview mechanism is untouched; only what feeds it
changes, from a rectangle iteration to `selectionCells(sel)`.

**Lift once, translate on every move** — the existing rect-move code already does this (capture
original values at pointerdown, only ever add the pointermove delta afterwards) and it matters:
recomputing from live pixels on every `pointermove` would read back the *preview's own* in-progress
mutation instead of the true original values, corrupting the drag after the first frame.
`movePreviewCells(sel, lifted, dx, dy)` in `lib/editor/selection.ts` is that same two-pass
clear-then-stamp logic (clear every source cell to 0, then stamp every lifted cell's original
value at its offset position — a coordinate that is both a source and a destination ends up with
the stamped value, which is correct for a rigid translate), extracted so it is unit-testable
without a DOM.

A destination cell outside the canvas is dropped (never written), matching today's move exactly —
`previewMoved` already filters this, so no change there.

### 3.5 Del / Backspace

Clears the masked cells on the active layer to transparent, one undoable `paint` commit. The
selection stays exactly where it was — the outline remains, now drawn over emptied cells, per the
ledger's decision #9. No existing binding was found on these keys (`app/page.tsx`'s keydown
handler, grepped before wiring); `⌥⌫` (frame delete) is a different chord and is checked first, so
there is no collision.

```ts
export function selectionClearCells(px: Uint8Array, w: number, sel: Selection): PaintCell[]
```

### 3.6 Arrow-key nudge

Moves the whole selection one cell per press. Same cell math as a drag (§3.3's clear-then-stamp),
just triggered by a key instead of a pointer delta, and applied immediately rather than previewed
— a keypress has no interactive preview phase, so it goes straight to a `commit()`.

```ts
export function selectionPaintCells(px: Uint8Array, w: number, h: number, sel: Selection, dx: number, dy: number): PaintCell[]
```

**Coalescing a held key's repeats into one undo entry — the second decision the ledger left
open.** Resolved by *generalising* the existing mechanism rather than inventing a second one:
`useDocStore.commit(cmd, coalesce)` today only merges consecutive `replace_doc` commands sharing a
label. This unit extends the same `if (coalesce && top...)` block with a `paint`-vs-`paint` branch
(same label, same frame, same layer) that merges cell lists — keeping each touched cell's
**earliest** `before` and **latest** `after`, exactly the "undo goes back to where the burst
started" rule the code-panel coalescing comment already states for typing.

The caller decides *when* to pass `coalesce: true`, same as the code panel's debounce decides it
for typing — here it is `e.repeat`, the browser's own signal for "this is an OS auto-repeat of a
key still held down," which `app/page.tsx` already reads for the opposite reason one function up
(space bar ignores repeats; nudge wants every one of them, just coalesced). First press of a hold
(`e.repeat === false`) starts a new step; every repeat merges into it; releasing and pressing again
starts a new step. No new store field, no session-tracking ref — the label/type/frame/layer match
on the existing top-of-stack entry is sufficient, because a genuinely new gesture always has
something else on top (a different command, or nothing).

### 3.7 Esc

Deselects, no document mutation.

### 3.8 Hidden active layer

Click-select, and the start of a move, nudge or delete, reuse the exact reveal-then-commit pattern
`Canvas.tsx`'s `onPointerDown` already has (search its own comment) — the layer is shown, as its
own undo step, before the action that follows. For the pointer path this already happens for free,
because the select-tool branch sits after the existing reveal check. Nudge and Del, which do not
go through `onPointerDown` at all, replicate the same two-step (`commit` the reveal, re-read `doc`,
then act) in `app/page.tsx`.

### 3.9 Not tool-gated

Esc, Del/Backspace and arrow-nudge act on `editor.selection` whenever it is non-null, regardless of
which tool is currently active — consistent with decision #11 (switching layers or frames
mid-selection does not clear it; a following action just acts on whatever is now at those
coordinates). Requiring the `select` tool to still be active would be an arbitrary restriction
nothing in the ledger asks for, and it would make "draw a marquee, switch to brush to check a
colour, come back and nudge" stop working for no reason.

### 3.10 Scoping the keyboard shortcuts against every dialog in the app

Decision #8 says to check `KeyDialog`, `CodePanel` and `SharePopover`'s own Escape handling before
wiring a global one. Doing so found that **every** overlay in this codebase — those three, plus
`Layers`, `Settings` and `Timeline` — renders `role="dialog"`, and every one of them is only
mounted in the DOM while open (`CodePanel` returns `null` when closed; the rest are conditionally
rendered by their parent). That makes a single generic guard both correct and more robust than
naming three components that happen to be the ones already in the file when this was written:

```ts
// lib/editor/keys.ts
export function dialogOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[role="dialog"]') !== null
}
```

Esc, Del/Backspace and arrow-nudge all check `!dialogOpen()` before acting. This was also checked
against the two `role="menu"` popovers (the File menu, the dither menu) and `Settings`' segmented
controls, which are the only other places arrow keys or Escape have meaning in this codebase —
neither menu implements its own arrow-key navigation, and Settings is itself `role="dialog"`, so
it is already covered.

---

## 4. Rendering — marching ants on the real shape, still static

`renderSelection`'s own comment already rejects animated marching ants for a vestibular-motion
accessibility reason; that constraint is unchanged and this section does not touch it. What
changes is *what shape* gets outlined.

### 4.1 Tracing the boundary

For each selected cell, an edge is drawn on whichever of its 4 sides borders a cell that is **not**
selected (including off-canvas). Doing this per-cell would fragment a straight edge into one
segment per cell — visually a dashed line inside a dashed line — so `selectionOutline(sel)` merges
consecutive same-side edges into maximal runs by scanning each row (for top/bottom) and each column
(for left/right):

```ts
export type OutlineRun = { side: 'top' | 'bottom' | 'left' | 'right'; at: number; a: number; b: number }
export function selectionOutline(sel: Selection): OutlineRun[]
```

`at` is the run's perpendicular grid line (a row for top/bottom, a column for left/right); `a`/`b`
are its own two ends along its axis, in document cell-space — the renderer scales and insets these,
not this function, keeping the geometry pure and DOM-free.

### 4.2 The regression check, and why it is exact rather than approximate

For a filled rectangle, this must reduce to exactly today's 4-sided outline. It does, and this was
checked analytically, not assumed: today's `renderSelection` draws `strokeRect(ax+0.5, ay+0.5, w-1,
h-1)`, which is shorthand for a closed path through four corners, each inset 0.5px inward from the
cell grid so a 1px stroke lands crisply on the boundary rather than straddling it. Working through
each of `selectionOutline`'s four runs for a full `w×h` rectangle and applying the **same**
per-side inset (top/left runs shift their perpendicular coordinate **+0.5** toward the inside,
bottom/right shift **-0.5**; both of a run's own along-axis ends get the same treatment) reproduces
the identical four corner points `strokeRect` would have drawn — not an approximation of the same
rectangle, the same coordinates. This generalises correctly to any rectilinear boundary (which a
pixel mask's boundary always is): two runs that meet at a real corner receive the same inset at
that shared point from both sides, so blob and multi-blob outlines join flush with no gaps, the
same way the rectangle's four corners do.

The renderer (`lib/renderer/canvas.ts`) does the scale-and-inset and the actual drawing —
`renderSelection` now takes `OutlineRun[]` instead of a rectangle, still knows nothing about masks
or selections (its own purity constraint, stated in its file header, is unchanged), and still draws
in exactly two passes: one solid white `stroke()` over every run, one dashed black `stroke()` over
the same runs, each built as a single path of `moveTo`/`lineTo` pairs so the calls stay at two
regardless of how many runs there are.

**One honest gap, not pursued:** a filled rectangle's dash phase in today's code is continuous
around all four corners, because `strokeRect` traces one closed subpath. This version issues one
`moveTo` per *run*, so the dash pattern restarts its phase at each run's own start rather than
carrying across every corner. For a static (non-animated) 1px overlay this is not visible at any
zoom level this app actually renders at — verified by looking at both themes, not just asserted —
and a fully general fix (continuous contour-tracing per connected component, with hole handling for
a ring-shaped blob) is real additional complexity bought for a sub-pixel cosmetic difference on an
overlay that, per the project's own accessibility decision, is not supposed to draw attention to
itself by moving. Recorded here rather than silently shipped, per rule 10 — this is a spec
correction relative to a stricter reading of "exactly today's outline" as literal dash-phase
parity, and the exact reading (same geometry, same corner coordinates) is what was actually meant
and is what is verified.

---

## 5. Store changes

`lib/store/editor.ts`:

- `selection: { x, y, w, h } | null` → `selection: Selection | null`. `setSelection` signature
  follows.
- `commit(cmd, coalesce)` gains the `paint`-vs-`paint` merge branch described in §3.6, alongside
  the existing `replace_doc`-vs-`replace_doc` one. Both are gated on `coalesce === true` and a
  matching label; the `paint` branch additionally requires the same `frame` and `layer`, since
  merging cell coordinates across layers would be meaningless.

No new `EditorCommand` variant. Move, nudge and delete are all already expressible as the existing
`paint` command (`[x, y, before, after]` cells) — the same one brush strokes use — so
`paintCommand(label, frame, layer, cells)` is the only commit primitive this unit needs. This
matters for rule 4: nothing new is writing the document, the same one function is.

---

## 6. Edge cases (J-E#)

| # | Case | Behaviour |
|---|---|---|
| J-E1 | Click on transparent, no selection | No-op (nothing to deselect, nothing to select). |
| J-E2 | Click on transparent, selection exists | Deselect. |
| J-E3 | Shift+click on transparent | No-op — no deselect, no selection change, no drag. |
| J-E4 | Shift+click a fully-selected blob | Removes it (toggle off). If it was the only thing selected, the result is `null`, not an empty `Selection`. |
| J-E5 | Two colours touching, one blob | A click anywhere on either colour selects both — `blobPoints` matches on non-transparency, not on palette index. |
| J-E6 | A blob with an enclosed transparent hole (a ring) | The hole is never part of the mask (flood fill never crosses it), so moving the ring never drags the hole's contents — this is the literal "no square hole" case. |
| J-E7 | Drag/nudge partially off-canvas | Destination cells outside `[0,w)×[0,h)` are dropped, matching today's move. The selection outline still tracks the full translated shape, including any part now off-canvas — consistent with the pre-existing rect-selection behaviour of not clamping `editor.selection` to the canvas. |
| J-E8 | Marquee rectangle containing a transparent gap, moved | Unchanged: the whole rectangle moves, gap included, exactly as today. Not a regression — see §1. |
| J-E9 | Nudge, arrow key held | One undo entry per hold, via `e.repeat` coalescing (§3.6), not one per repaint. |
| J-E10 | Esc / Del / arrow while any dialog is open | No-op — `dialogOpen()` guards all three (§3.10). |
| J-E11 | Hidden active layer, click-select or the start of a move/nudge/delete | The layer is revealed first, as its own undo step (§3.8). |
| J-E12 | Frame/layer switched while a selection is active | No special handling needed — every action reads the *current* frame/layer at the moment it runs (§3.9). |

---

## 7. Known gap, stated rather than hidden

**Undo/redo do not move `editor.selection` back.** `useDocStore.undo()`/`redo()` only ever touch
`useDocStore`'s own state; `editor.selection` lives in `useEditorStore` and is never written by
undo. After a move or nudge, the selection outline tracks the *destination* (§3.4, §3.6); undoing
that move puts the pixels back at the source but leaves the outline at the now-vacated destination
until the next click. This is **pre-existing** — it is exactly as true of today's rectangle move —
and this unit does not fix it for either tool, because doing so is a change to `undo()`'s own
contract (should undo carry UI-only state back too, and if so which — cursor? tool? — a question
bigger than this unit) rather than a selector-tool defect. Worth a unit of its own if it turns out
to matter in practice.

---

## 8. Test plan

- `lib/artwork-core/__tests__/ops.test.ts`: `floodFillPoints` with a custom `matches`, and
  `blobPoints` — two touching-but-different colours as one blob, a transparent seed returning `[]`,
  4-connectedness preserved (reuses the existing enclosure/diagonal cases with the new predicate).
- `lib/editor/__tests__/selection.test.ts` (new): every function in §2's table, plus:
  - `selectionOutline` on a filled rectangle produces exactly the 4 expected runs (the regression
    check, §4.2) — compared as data, not rendered.
  - `selectionOutline` on an irregular blob and on two disjoint blobs traces each boundary
    correctly (no run bridges the gap between them).
  - `movePreviewCells` / `selectionPaintCells` on a non-rectangular and a multi-blob mask:
    transparency-aware (never introduces a 0 outside the mask's own footprint at the source),
    off-canvas destinations dropped, a cell that is simultaneously a source and a destination ends
    up with the stamped value.
  - `selectionClearCells` only touches masked cells.
- `lib/store/__tests__/doc-store.test.ts`: extend the existing `commit(cmd, coalesce)` describe
  block with the `paint`-vs-`paint` merge — repeats coalesce, a non-repeat starts a new step, it
  refuses to merge across a different label/frame/layer (mirrors the existing `replace_doc`
  refusal tests directly above it).
- Browser probe: extend `tools/probe-tools-ui.ts` (not a parallel probe) — click-select, shift-click
  add and remove, drag-move, arrow-nudge (assert one undo step per hold), Esc, Del, and a
  marquee-still-behaves-exactly-as-before regression pass, both themes, one narrow viewport.

---

## 9. Explicitly out of scope

Lasso selection, clipboard cut/copy/paste, flip/rotate. Not deferred-and-forgotten — recorded in
`docs/UNITS.md`'s unit J block as the user's own choice via `AskUserQuestion`, over "add lasso and
clipboard too." If any of these come up later they are a new unit, not a "while I'm in here"
addition to this one.

No agent/AI awareness — `lib/actions/catalogue.ts` gains no selection-related action. This is a
pointer-and-keyboard UI tool, matching the scope decided.
