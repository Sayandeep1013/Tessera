# 14 — Layers

**Owns:** the active-layer concept, the layer commands, `components/Layers.tsx`, and the layer
actions in `lib/actions/catalogue.ts`.
**Depends on:** [01 — Document format](./01-document-format.md), [03 — artwork-core](./03-artwork-core.md),
[05 — Editor](./05-editor.md), [12 — Agent actions](./12-agent-actions.md),
[13 — Visual identity](./13-visual-identity.md)

Task #46. The format has carried `frames[].layers[]` since v1 and the renderer has always
composited all of them bottom-to-top. What has never existed is a way to *have* more than one, or
to choose which one you are painting on.

---

## 0. Two corrections to earlier documents

Rule 10: when a spec turns out to be wrong, say so and fix it rather than route around it.

### 0.1 There is no IndexedDB migration to write

`docs/HANDOFF.md §6.3` asks for a "command schema change + migration for drafts already in
IndexedDB". That requirement does not exist, for two independent reasons:

1. **Undo history is not persisted.** `lib/persist/idb.ts` stores one record per document —
   `{ id, doc: serializeDoc(doc), name, updatedAt }` — and says so in its header comment. No
   `EditorCommand` has ever reached disk, so changing the command union cannot invalidate a saved
   draft.
2. **The document format does not change.** `layers[]` is already `min(1)` in
   `serializedFrameSchema` and already carries `n` and `hidden`. This unit adds no field to the
   serialized shape, so `v` stays at 1 and `migrations` stays empty.

What *is* required, and is kept: a draft saved before this change must still open, and must open
with exactly one layer selected. That is asserted as a test, not as an assumption.

Because commands are memory-only, `layer` on `paint` and `ai_edit` is **required, not optional**.
An optional field defaulting to 0 would let a construction site silently forget it and paint the
wrong layer; a required field makes the compiler name every site. `docs/HANDOFF.md §6.2` suggested
the optional-with-default shape and told the reader to validate it rather than accept it. Validated,
and rejected, for that reason.

### 0.2 `invertCommand` loses pixels when an AI edit added a colour

Found while making `commands.ts` layer-aware. Pre-existing on `main`, unrelated to layers, and it
silently corrupts documents:

```ts
case 'ai_edit':
  return cmd.paletteAdded.length
    ? { type: 'palette_pop', label: cmd.label, entries: cmd.paletteAdded }   // ← pixels never reverted
    : { type: 'paint', label: cmd.label, frame: cmd.frame, cells: swap(cmd.cells) }
```

An agent session that adds a colour and then paints with it collapses to one `ai_edit` carrying both
`cells` and `paletteAdded` — the common case. Undoing it pops the palette entry and leaves the
painted pixels behind, so the document now holds pixels whose palette index is past the end of the
palette. Autosave writes that document; the next load fails `parseDoc` with `palette_range` and the
user gets *"Couldn't open your last drawing."*

`invertAiEdit()` in the same file returns the correct two-command inverse, but nothing calls it —
`useDocStore.undo()` calls `invertCommand`. Dead code next to a live bug.

**Fix:** add a `batch` command. `invertCommand('ai_edit')` returns a batch of the paint inverse
followed by the palette pop, in that order. `invertAiEdit` is deleted rather than left as a second
way to do the same thing. Test in §8.1.

---

## 1. Scope

**In scope**

- An active-layer index, and every pixel path honouring it.
- Undo that is correct across layers: a command records which layer it touched.
- A layer panel: select, show/hide, rename, add, duplicate, delete, reorder.
- Registry actions so the agent gets the capability at the same time as the toolbar.

**Out of scope, deliberately**

| Not built | Why |
|---|---|
| Layer opacity | The format has no opacity field. Adding one is a format revision (`v2` + migration + fixture), which is a different unit. `docs/HANDOFF.md §6.3` asks for it only if it costs no format change; it does. |
| Blend modes | Same reason, plus the renderer composites with plain source-over. |
| Merge down / flatten | Expressible as delete + paint, and every extra destructive action is prompt weight the agent pays for on every turn. Revisit if asked for. |
| Per-frame layer divergence | Layers are per-frame in the format. With one frame this cannot be observed. #47 owns it — see §9. |
| Layer panel at `mobile` | Measured header overflow. See §6.4. |

**Done** = §10.

---

## 2. The hard part: undo across layers

A `paint` command that does not record its layer cannot be inverted once a second layer exists.
`applyCommand` would write the `before` values back into whichever layer happens to be active at
undo time, which is silent corruption — no error, no crash, the wrong pixels change.

So the layer index travels **with the command**, not with the editor:

```ts
type EditorCommand =
  | { type: 'paint';         label: string; frame: number; layer: number; cells: PaintCell[] }
  | { type: 'ai_edit';       label: string; frame: number; layer: number; cells: PaintCell[]
                           ; summary: string; ops: Op[]; paletteAdded: PaletteEntry[] }
  | { type: 'batch';         label: string; cmds: EditorCommand[] }
  | { type: 'layer_add';     label: string; frame: number; at: number; layer: Layer }
  | { type: 'layer_delete';  label: string; frame: number; at: number; layer: Layer }
  | { type: 'layer_move';    label: string; frame: number; from: number; to: number }
  | { type: 'layer_rename';  label: string; frame: number; at: number; before: string; after: string }
  | { type: 'layer_visible'; label: string; frame: number; at: number; before: boolean; after: boolean }
  // unchanged: palette_add, palette_pop, palette_edit,
  //            frame_add, frame_delete, frame_duration, replace_doc, resize
```

Inverses:

| Command | Inverse |
|---|---|
| `paint` | `paint` with `cells` swapped, **same `frame` and `layer`** |
| `ai_edit` | `batch([paint(swapped), palette_pop])` when `paletteAdded` is non-empty; otherwise the `paint` alone |
| `batch` | `batch` of each child's inverse, **in reverse order** |
| `layer_add` | `layer_delete` at the same index, carrying the layer |
| `layer_delete` | `layer_add` at the same index, carrying the layer |
| `layer_move` | `layer_move` with `from` and `to` exchanged |
| `layer_rename` | itself with `before`/`after` exchanged |
| `layer_visible` | itself with `before`/`after` exchanged |

`layer_move` is self-inverse under exchange because `applyCommand` implements it as
`splice(from, 1)` then `splice(to, 0, item)`. `[A,B,C] --move(0,2)--> [B,C,A] --move(2,0)--> [A,B,C]`.

`layer_add` and `layer_delete` deep-copy the `Layer` they carry (`px` into a fresh `Uint8Array`), so
a deleted layer's pixels survive on the undo stack even though nothing else references them.

### `applyCommand` bounds behaviour

Every layer-addressing case resolves `frames[frame]?.layers[at]`. When that is `undefined`,
`applyCommand` **returns the document unchanged** rather than throwing (`L-E7`). Throwing inside
`undo()` would take the editor down and lose the whole session; a no-op loses nothing. It should be
unreachable — undo is a stack, so a `layer_delete` is always undone before the `paint` beneath it —
and the test in §8.1 pins that ordering property rather than the guard.

---

## 3. `artwork-core` signatures

```ts
// ops.ts
function applyOp (doc: Doc, op:  Op,   frameIndex?: number, layerIndex?: number): Result<Doc, OpError>
function applyOps(doc: Doc, ops: Op[], frameIndex?: number, layerIndex?: number): Result<Doc, OpError>

// diff.ts
function diff(before: Doc, after: Doc, frame?: number, layer?: number): PixelDiff
/** Indices of the layers of `frame` whose pixels differ. Ascending. */
function changedLayers(before: Doc, after: Doc, frame: number): number[]
/** Same frame count, same per-frame layer count, same names, same hidden flags. */
function sameLayerShape(before: Doc, after: Doc): boolean

// layers.ts — new module
const MAX_LAYERS = 16
/** Topmost visible non-transparent index at (x,y), or 0. What the user sees. */
function compositeAt(doc: Doc, frame: number, x: number, y: number): number
/** Clamp into [0, layers.length - 1]; 0 when the frame is missing. */
function clampLayer(doc: Doc, frame: number, layer: number): number
/** "Layer 2", bumping until unused within the frame. Never longer than 32 chars. */
function nextLayerName(doc: Doc, frame: number): string
```

`frameIndex` and `layerIndex` both default to `0`, so every existing call site and every existing
test keeps its meaning. `applyOps` returns `err({ code: 'no_layer' })` when the layer is missing,
alongside the existing `no_frame`.

`MAX_LAYERS` is enforced by `add_layer` and by the panel — **not** by the zod schema. Tightening
`serializedFrameSchema` would make a hand-authored 20-layer file fail to parse, which is rule 7
territory for no benefit: the cap exists to keep the panel and the serialized document sane, not to
police input we did not write.

---

## 4. Active-layer state

`layer: number` lives in **`useDocStore`, next to `frame`** — not in `useEditorStore`. It indexes
into the document, its valid range is a property of the document, and putting it beside `frame` lets
one guard cover every path that can invalidate it.

```ts
// lib/store/editor.ts — DocState
layer: number
setLayer: (i: number) => void
```

- `commit(cmd)` clamps `layer` with `clampLayer` after applying, on **every** path including the
  agent-session path, undo and redo. One line, and it covers cases nobody enumerated.
- `setDoc(doc)` resets `layer` to `0`. A different document's indices mean nothing.
- `setLayer(i)` clamps. Out-of-range input is corrected, never rejected — nothing is lost by it.

`ActionCtx` gains `layer: () => number` and `setLayer: (i: number) => void`, wired in
`lib/store/ctx.ts` next to `frame`. That keeps `lib/store/ctx.ts` the one bridge.

---

## 5. Which layer each pixel path reads

| Site | Reads | Note |
|---|---|---|
| Brush, eraser, rect, gradient, fill, move | active layer | Painting is layer-local everywhere. |
| **Eyedropper** | **composite** | Changed behaviour — see below. |
| Renderer | all layers | Already correct. |
| `clear_layer` action | active layer | Was `layers[0]`. |
| `get_grid`, `get_region` | active layer, plus a composite grid when the frame has >1 layer | §7.2 |
| `buildGrid` (AI context) | active layer, plus a composite grid when the frame has >1 layer | The PNG has always been the composite. |

**Eyedropper samples the composite, not the active layer.** It picks the colour the user is looking
at; sampling the active layer would return transparent whenever the pixel under the cursor belongs to
a layer above or below, which reads as the tool being broken. Every editor that has both modes
defaults to the composite. `compositeAt` skips hidden layers and skips palette index 0, so it returns
the topmost thing actually on screen.

Flood fill stays layer-local: it fills the connected region *of the layer being painted*, which is
the only definition that makes the resulting `paint` command invertible.

---

## 6. The panel

### 6.1 Structure

A floating card in the same idiom as the tool rail and zoom bar: `--panel` at 90% with
`backdrop-filter: blur(8px)`, `--r-xl`, `--shadow-card`. Toggled by the header **Layers** button,
which takes the `active` state while open.

Rows are listed **top layer first** — the reverse of the array, because `layers[0]` is the bottom of
the stack and every editor draws the stack the way it looks.

```
┌──────────────────────────────┐
│ Layers                    2  │   header: label + count
├──────────────────────────────┤
│ 👁  overlay                  │   row, top of stack first
│ 👁  base                  ●  │   ● = active
├──────────────────────────────┤
│ Add  Duplicate  Delete  ^  v │   footer, acts on the active layer
└──────────────────────────────┘
```

- **Row click** selects. `aria-pressed` on the row, `--accent-soft` background when active.
- **Eye button** toggles `hidden`. `aria-pressed`, 24px minimum target.
- **Double-click the name** turns it into an `<input>`. Enter or blur commits, Escape cancels.
  Trimmed, truncated to 32 characters. An empty name is legal and renders as *Untitled* in
  `--faint`.
- **Footer** acts on the active layer: Add, Duplicate, Delete, Move up, Move down. Text buttons
  rather than icon-only ones — the panel has the width, and three of the five have no glyph in the
  captured icon set.
- **Delete is disabled at one layer.** `layers.min(1)` is already in the zod schema; the control is
  disabled rather than allowed-then-refused, and the agent's `delete_layer` returns
  `L-E3` for the same case.
- **Move up/down** are disabled at the ends of the stack.
- **Add is disabled at `MAX_LAYERS`**, with the count in the button's `title`.

Every one of these goes through `commit()`, so every one is a single undo step.

### 6.2 Closing

Escape closes. The header button toggles. **No outside-click closer** — a layer panel is a working
surface, not a menu, and clicking the canvas is the most common thing a user does *while* using it.
(The `mousedown`-not-`click` trap in `docs/HANDOFF.md §5` therefore does not apply here; it does still
apply to the header menus, which are unchanged.)

### 6.3 Per tier

| Tier | Placement |
|---|---|
| `wide`, `compact` | Absolute inside `<main>`, `top: inset`, `right: inset`, width 248, `max-height: min(46vh, 420px)`, list scrolls. `<main>` already starts below the header, so no header offset is needed. The zoom bar is bottom-right at these tiers and the panel is top-right, so the two never meet even at 420px of panel. |
| `tablet` | Same, width 224. |
| `mobile` | Not shown. See §6.4. |

### 6.4 Mobile

The Layers button is shown at `tablet` and above. At `mobile` the panel is not reachable.

Not a space problem — the mobile header has room for a sixth control. It is that a 248px panel over
a 320px canvas is not a usable layer panel, and layers are a desk activity. Layers remain
*reachable* on a phone through the agent ("add a layer, draw the shadow on it"), and every layer in
a document still renders. A deliberate omission, not an oversight.

Two changes follow:

1. **`chromeFor` gains `showLayers: tier !== 'mobile'`.** `showUnbuilt` keeps gating Code, Timeline
   and Share, which are still dead — Layers leaves that group because it is now real.
2. **`tools/check-responsive.ts` gains a 320×568 viewport.** The narrowest phone still in use. 390
   had enough slack to hide a header one control too wide, so adding a control without adding this
   viewport would have proved nothing. It must pass.

> **Correction (rule 10).** An earlier draft of this section also dropped the "Tessera" wordmark at
> `mobile` to buy ~62px of header room. That was reasoning from an arithmetic estimate toward a
> conclusion the build then contradicted: with the Layers button withheld at `mobile`, the mobile
> header is unchanged and needs no room. The wordmark stays.

---

## 7. Registry actions

Four new actions, exactly the four `docs/HANDOFF.md §6.3` names, plus changes to four existing ones.
Duplicate, reorder and rename are panel-only: every declaration is prompt weight on every turn of
every session, and none of the three changes what the agent can *draw*.

### 7.1 New

| Name | Kind | Input | Returns |
|---|---|---|---|
| `add_layer` | `mutate` | `{ name?: string(≤32), above?: number }` | `{ index, name, layers }` |
| `select_layer` | `view` | `{ index: int ≥ 0 }` | `{ index, name }` |
| `set_layer_visible` | `mutate` | `{ index: int ≥ 0, visible: boolean }` | `{ index, visible }` |
| `delete_layer` | `destructive` | `{ index: int ≥ 0 }` | `{ index, layers }` |

- `add_layer` inserts **above** the given index, defaulting to above the active layer, and selects
  the new layer. Name defaults to `nextLayerName`.
- `select_layer` is `view` for the same reason `select_tool` is: it changes what the next edit will
  affect, not the document. It is not undoable and does not appear in the diff.
- `set_layer_visible` is `mutate`, not `view` — `hidden` is serialized, so it *is* the document.
- `delete_layer` inherits the confirmation gate from `kind: 'destructive'` in `runAction`.

### 7.2 Changed

- **`get_state`** gains `layers: Array<{ index, name, hidden }>` (bottom-first, matching the
  indices every other action takes) and `activeLayer: number`.
- **`get_grid`** reads the active layer. When the frame has more than one layer it also returns
  `composite` — the flattened grid — and `layers`. With one layer the response is byte-identical to
  today's, so the single-layer prompt does not grow at all.
- **`get_region`** reads the active layer, same rule.
- **`clear_layer`** clears the active layer. Its description changes from "everything on the current
  frame" to "everything on the current layer", which is what the code will now do.
- **`replace_color`**'s description changes from "across the whole frame" to "across the current
  layer", which is what `applyOps` has always done.

### 7.3 Session collapse with more than one layer

`AgentSession.finalise` currently diffs one layer and emits one `ai_edit`. An agent that calls
`select_layer` mid-session and paints on two layers would produce a diff that misses one of them, and
the collapsed command would undo only half the work — the same silent-corruption class as §2.

`finalise(current, summary, stoppedBy, frame, layer)` therefore decides:

| Condition | Collapsed command |
|---|---|
| Dimensions differ | `replace_doc` (existing behaviour) |
| `!sameLayerShape(before, current)` — a layer was added, deleted, moved, renamed or hidden | `replace_doc` |
| `changedLayers(...)` has length ≥ 2 | `replace_doc` |
| `changedLayers(...)` has length 1 | `ai_edit` on that layer |
| No pixel change, palette changed | `ai_edit` on the active layer with `cells: []` |
| Nothing changed | `null` — no history entry |

`replace_doc` costs a full document clone and loses the pixel-level diff the panel displays. That is
the right trade: one honest undo entry beats a cheap one that reverts the wrong pixels. The
`replace_doc` fallback already exists for resizes, so this reuses a tested path rather than adding
one.

---

## 8. Test requirements

Specific enough to write directly from. All existing tests must keep passing unchanged except where
a signature genuinely moved.

### 8.1 `lib/artwork-core/__tests__/commands.test.ts` — new file

- **Two-layer undo.** A 2×2 document with two layers. Paint (0,0) on layer 1, commit, then
  `applyCommand(doc, invertCommand(cmd))`. Layer 1 returns to its prior pixels **and layer 0 is
  byte-identical to before**. This test fails against the pre-change code, which is the point.
- Undo of a paint on layer 1 is unaffected by the active layer being 0 at undo time.
- `paint` → `invertCommand` → `applyCommand` round-trips to the original document for a random
  50-cell stroke on each of three layers (fast-check, already a dependency).
- `ai_edit` carrying both `cells` and a non-empty `paletteAdded`: `invertCommand` returns a `batch`;
  applying it restores **both** the pixels and the palette length. Serializing the result and
  `parseDoc`-ing it succeeds — the regression in §0.2 stated as the failure the user would have seen.
- `batch` applies its children in order; its inverse applies them in reverse order; a nested batch
  round-trips.
- `layer_add` → invert → `layer_delete` restores the exact layer list, including `px` contents and
  `hidden`.
- `layer_delete` of a layer with pixels, then invert, restores those pixels (the carried layer is a
  deep copy, not a reference into the live document).
- `layer_move(0,2)` then its inverse restores the original order, for all six orderings of a
  three-layer stack.
- `layer_rename` and `layer_visible` are self-inverse under two applications.
- `applyCommand` with an out-of-range `layer` returns a document deep-equal to the input and does not
  throw (`L-E7`).
- `paintCommand(label, frame, layer, cells)` returns `null` for a no-op stroke, as before.

### 8.2 `lib/artwork-core/__tests__/layers.test.ts` — new file

- `compositeAt` returns the topmost non-transparent index; skips hidden layers; returns 0 when every
  layer is transparent there; returns the lower layer's index when the upper layer is transparent
  at that pixel.
- `clampLayer` clamps below 0, above the end, and returns 0 for a missing frame.
- `nextLayerName` avoids collisions with existing names, including when "Layer 2" already exists.
- `MAX_LAYERS` documents don't fail `parseDoc` when exceeded — a 20-layer document parses (the cap is
  not a format rule).

### 8.3 `lib/artwork-core/__tests__/diff.test.ts` — new file

- `diff` with `layer: 1` reports only layer 1's changes, and reports none when only layer 0 changed.
- `diff` with an out-of-range layer throws `RangeError`, matching the existing frame behaviour.
- `changedLayers` returns `[]`, `[1]`, `[0,1]` for the three cases.
- `sameLayerShape` is false for a differing count, a differing name, and a differing `hidden`; true
  when only pixels differ.

### 8.4 `lib/artwork-core/__tests__/ops.test.ts` — extend

- `applyOps` with `layerIndex: 1` writes to layer 1 and leaves layer 0 byte-identical.
- `applyOps` with a missing layer returns `err({ code: 'no_layer' })` and does not mutate the input.
- `flood_fill` on layer 1 fills within layer 1 only — pixels on layer 0 do not bound it.

### 8.5 `lib/actions/__tests__/layers-actions.test.ts` — new file

- `add_layer` inserts above the active layer, selects it, and pushes exactly one history entry.
- `add_layer` at `MAX_LAYERS` fails with `L-E1` and mutates nothing.
- `select_layer` out of range fails with `L-E2`; in range it changes `get_state().activeLayer` and
  pushes **no** history entry.
- `delete_layer` without `ctx.confirmed` mutates nothing and reports it.
- `delete_layer` on a single-layer frame fails with `L-E3`.
- `delete_layer` of the active layer moves the active index into range.
- `set_layer_visible` round-trips through undo.
- `clear_layer` clears the **active** layer and leaves the others byte-identical.
- `get_state` reports the layer list bottom-first with names and hidden flags, and `activeLayer`.
- `get_grid` on a single-layer document returns exactly the same object shape as before this unit
  (no `composite`, no `layers` key); on a two-layer document it returns both.
- Registry drift: `toDeclarations()` contains all four new names.

### 8.6 `lib/agent/__tests__/session.test.ts` — extend

- A session that paints on one layer still collapses to one `ai_edit` carrying that layer index, and
  its inverse restores `session.before` exactly.
- A session that paints on **two** layers collapses to `replace_doc`, and applying its inverse
  restores `session.before` exactly.
- A session that adds a layer collapses to `replace_doc` (layer shape changed).
- A session that only adds a palette colour collapses to an `ai_edit` with `cells: []` whose inverse
  restores the palette length.

### 8.7 `lib/store/__tests__/doc-store.test.ts` — new file

- `setDoc` resets `layer` to 0.
- `commit` of a `layer_delete` that removes the active layer leaves `layer` in range.
- `undo` of that delete leaves `layer` in range.
- `setLayer` clamps out-of-range input rather than rejecting it.

### 8.8 Persistence

- `lib/persist/__tests__` (or the existing codec suite): a serialized single-layer document captured
  **before this change** parses, and produces a document with one layer. The fixture is committed, so
  this keeps testing the old shape after the code moves on.

### 8.9 Looked at, not only measured

`docs/HANDOFF.md §3`: verify by measuring **and** by looking.

- `npx tsx tools/check-responsive.ts` clean at all six viewports.
- Screenshots of the panel open, in both themes, at `wide` and at `tablet`, inspected — not just
  captured. `npx tsx tools/probe-layers.ts` produces them and drives add / draw / hide on the way.
- `npx tsx tools/probe-tools-ui.ts` green, with a second layer active, to prove every tool writes to
  the active layer through real pointer events.

Two things that came out of actually running these, both worth recording:

- **`tools/probe-tools-ui.ts` could not read the document.** It carried a `window.__tesseraDoc`
  stub that nothing in the app ever defined, so its per-pixel assertions had never run — it was
  comparing `canvas.toDataURL().length`, which cannot tell "wrote to layer 1" from "wrote to layer
  0". `app/page.tsx` now exposes a **read-only, development-only** `window.__tessera` with
  `layers()` and `active()`. No setter: `commit()` stays the only writer.
- **The mobile tool rail was already overflowing at 320.** Eight 44px buttons need 364px and a
  320px phone has 304, so the rail scrolled and put the eyedropper and gradient tools off-screen
  behind an affordance a touch device never draws. It wraps now. Pre-existing, and only visible
  because this unit added the 320 viewport — which is the argument for adding it.

---

## 9. Interaction with #47 (frames) — resolved by unit F

Layers are per-frame. Everything in this spec addresses `frames[activeFrame].layers`, and nothing
here assumes frames are uniform. Unit F (`10-animation.md`) had to decide three things before any
timeline UI could exist; all three are settled now, in writing, per `docs/UNITS.md §0`'s protocol.

**1. Adding a layer adds it to the current frame only. Layers diverge per frame, matching the
format's actual shape.** The alternative — propagating every layer operation to every frame — is
what an Aseprite-style "cel" model needs, and that model only makes sense next to a timeline that
draws layers as rows in a grid. `10-animation.md §2`'s timeline is a filmstrip of whole frames, not
a layer×frame grid, so there is no on-screen representation implying uniformity in the first place.
This choice costs nothing to build: the Layers panel, `layer_add`/`layer_delete`/`layer_move`/etc.,
and the agent's layer actions already operate on `frames[activeFrame].layers` exactly as this
section always said — unit F changed none of them.

The one place this is genuinely felt is frame creation: `+` in the timeline **duplicates** the
current frame (`10-animation.md §2`), which means its layer stack — names, opacity, blend modes,
pixels — travels with it as a starting point. A frame is never born with a different layer stack
than the one it was duplicated from; it only diverges from there if the user then adds, deletes or
edits a layer on that one frame specifically. That is what "duplicating is overwhelmingly the common
case" already implied before this decision made it explicit.

**2. The active layer, on a frame change, keeps the same index if it exists in the new frame; else
it clamps to the last layer.** `clampLayer(doc, frame, layer)` already takes a frame argument and
already does exactly this — `setFrame` in `lib/store/editor.ts` calls it the same way `commit`,
`undo` and `redo` already did for the frame the command was addressed to. "Clamped" being "not
correct" (this section's original wording) is accepted here for the same reason it was accepted for
every other clamp in this file: a silently-moved selection is a UI nuisance, not a document
correctness issue, and the alternative — refusing to change frames when the layer count differs — is
a worse nuisance for a normal, expected case (a duplicated frame that then had a layer deleted).

**3. `sameLayerShape` stays strict across all frames, unchanged.** The loose, active-frame-only
version was the alternative on the table; it was not needed. The agent still only ever touches one
frame per session (`10-animation.md §5`: the AI edits one frame at a time and the composer does not
advertise frame or animation verbs), so a session that adds no frames and touches no layer shape on
frames it never visited will always pass the strict check trivially — the frames it did not touch are
byte-identical before and after, strict or loose. Loosening it would only matter if the agent were
ever allowed to run a session that changes frame count or another frame's layer shape mid-session,
which it is not, and which unit F's own scope (`10-animation.md §5`) explicitly keeps out. Left as
`14-layers.md` already had it, rather than changed for a case that cannot occur.

---

## 10. Error codes

| Code | Meaning | Surfaces as |
|---|---|---|
| `L-E1` | `add_layer` at `MAX_LAYERS` | Action failure; Add button disabled with the count in its title |
| `L-E2` | Layer index out of range | Action failure naming the valid range |
| `L-E3` | Deleting the only layer | Action failure; Delete button disabled |
| `L-E4` | `applyOps` targeting a missing layer (`no_layer`) | `OpError`, atomic — nothing applied |
| `L-E5` | Layer name longer than 32 characters | Truncated by the UI; rejected by zod for the agent |
| `L-E6` | `diff` with an out-of-range layer | `RangeError` — a caller bug, not user input |
| `L-E7` | `applyCommand` addressing a missing layer | Returns the document unchanged; never throws |
| `L-E8` | A stroke starts on a hidden layer | The layer is revealed first, as its own history entry, and the stroke then behaves normally |

**On `L-E8`.** Added during the build, not foreseen in the first draft. Painting on a hidden layer
is legal and the pixels are really there, but the user would see nothing for the whole drag and
nothing afterwards — indistinguishable from a broken brush. Blocking the stroke is no better: a
silent no-op is the same dead end. Revealing the layer on pointer-down is the only option with a
visible result, and separating it from the stroke keeps the live preview working (`commit` replaces
the document, so the stroke buffer must be re-acquired afterwards — see the comment in
`Canvas.tsx`). Two undo steps, both legible: "Show layer", then "Brush".

---

## 11. Definition of done

From `docs/HANDOFF.md §6.5`, plus what this spec added:

- `npm test` green · `npm run typecheck` clean · `npm run build` clean
- `npx tsx tools/check-responsive.ts` clean at **six** viewports, including 320×568
- A draft saved before this change still opens, asserted by a committed fixture
- Undo across two layers verified by test, and that test fails against the pre-change code
- The `invertCommand` palette regression (§0.2) fixed and pinned by a test
- Screenshots of the panel in both themes looked at
- Scored across the six dimensions with an honest table, lowest taken as the overall, ≥ 9

---

## 12. Phase 2 — opacity, blend modes, merge/flatten, drag reorder

Unit E. Everything below is new; §1–§11 describe phase 1, which is built and unchanged by this
section except where it says otherwise.

### 12.1 Scope

**In scope:** per-layer opacity, per-layer blend mode, merge down, flatten, and reordering a layer
by dragging its row (the panel has only had Move up/Move down since phase 1).

**Out of scope, deliberately:**

| Not built | Why |
|---|---|
| New agent actions for any of this | Same reasoning phase 1 already used for duplicate, rename and reorder (§7): prompt weight on every turn, and — unlike `add_layer`/`set_layer_visible`, which change what gets drawn — opacity and blend mode change how something *already drawn* looks, which is a finishing move, not a drawing capability. `get_state` reports both fields read-only so the agent is not blind to them; see §12.7. Revisit if asked for. |
| A true alpha-blended compositor for the eyedropper, exporters, or the AI text grid | §12.4. |
| Per-frame divergence of opacity/blend/order | Same standing note as phase 1 §9 — #47's problem. |

### 12.2 Format: no version bump

`docs/HANDOFF.md`'s handover for this unit says "opacity is a format change" and that
`01-document-format.md` "moves with it." Both are true in the sense that the document format spec
needs new words — but not in the sense of needing `FORMAT_VERSION` to become `2`. **Rule 10:** the
literal reading (bump `v`, write a migration, add a fixture at the old version) is corrected here,
because the format already has a working precedent for exactly this shape of addition.

`hidden` is the precedent. `docs/specs/01-document-format.md §0.1` (written for phase 1) established
that `layers[].hidden` was already an optional field nothing produced yet, and adding a producer for
it required no version bump because an old file simply lacks the field and the reader supplies the
default. `o` (opacity) and `mode` (blend mode) are the same shape: **optional, default to "as if this
feature did not exist"** — `o` omitted means fully opaque, `mode` omitted means `normal`, and a
`normal`-mode fully-opaque layer renders exactly as phase 1 always rendered it. A v1 file with neither
field parses today, unchanged, and produces a document that behaves identically to one that explicitly
says `"o": 100, "mode": "normal"` on every layer.

A version bump exists to protect against a reader that does not understand a new field silently
misinterpreting a document. That risk is not present here: an old build reading a *new* file ignores
`o`/`mode` (zod's `.optional()` on an unknown key is a non-issue only because these are on our own
schema — a build that predates this unit simply has no schema field for them and `serializedLayerSchema`
would need `.passthrough()` for that direction to matter, which is a separate, pre-existing question
this unit does not need to answer) and a *new* build reading an *old* file gets the sensible defaults
above. `migrations` stays empty. `v` stays `1`.

`01-document-format.md §3`'s field table gains two rows (below), and §6 gets a short addendum
recording this decision rather than silently drifting from what the code does — the same discipline
phase 1 held itself to.

| Path | Type | Constraint | Notes |
|---|---|---|---|
| `frames[].layers[].o` | int? | 0–100 | Opacity, percent. Omitted means 100 (opaque) — never serialized when 100, matching how `hidden` is never serialized when false. |
| `frames[].layers[].mode` | string? | one of §12.2.1 | Blend mode. Omitted means `"normal"`, never serialized when `"normal"`. |

An integer 0–100 rather than a 0–1 float: this format's other numbers (`w`, `h`, `ms`) are all
integers, and `"o": 62` reads better in a hand-edited file than `"o": 0.62` — consistent with §1's
whole reason for existing, that the format is meant to be read.

#### 12.2.1 Blend modes

Eight, all natively supported by `CanvasRenderingContext2D.globalCompositeOperation` under the same
names the CSS Compositing spec uses, so the renderer needs no blend math of its own — see §12.3.
Chosen as the subset every mainstream pixel editor exposes as "the common ones," leaving out the six
non-separable HSL modes (`hue`, `saturation`, `color`, `luminosity`) as a deliberate cut: they are
rare in pixel art, and each one right now would be one more row in a dropdown nobody asked for.

```ts
export const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'difference', 'exclusion',
] as const
export type BlendMode = typeof BLEND_MODES[number]
```

### 12.3 Renderer

`drawLayer`'s caller (`renderDoc`'s step 3 loop) sets `ctx.globalAlpha = (layer.o ?? 100) / 100` and
`ctx.globalCompositeOperation` from a fixed `BlendMode → GlobalCompositeOperation` table (identity for
all eight names above — the CSS spec and the Canvas spec share vocabulary here) before drawing the
layer's runs, and resets both to `1` / `'source-over'` immediately after, so a later step (grid,
symmetry axis, border) is never accidentally composited through a stale blend mode. This is the same
shape the grid and the symmetry axis already use (`ctx.save()`/`ctx.restore()` around a local
`globalCompositeOperation` change) — reusing a pattern rather than inventing a second one.

Skipped entirely for a hidden layer, as today. A layer at `o: 0` still walks the draw loop rather than
being special-cased out of it — `fillRect` at `globalAlpha = 0` is correct and cheap, and a special
case here is one more thing to keep in sync with the opacity slider's own bounds.

### 12.4 The eyedropper, exporters, and the AI grid stay on the phase-1 approximation — decided, not open

`08-exporters.md §12.1` flagged this as the thing E had to decide: `flattenFrame`/`compositeAt` pick
the topmost non-transparent index, which is exactly correct when every layer is opaque and
`normal`-blend, and stops being exactly correct the moment a layer has real transparency or a blend
mode — the *rendered* pixel is now a blended colour that may not equal any single layer's stored
index, let alone the topmost one.

**Decision: they still return an index, and it is still the topmost-non-transparent one.** Building a
"true" compositor for these call sites would mean one of two things, and both are worse than an
honest approximation:

1. Have `compositeAt` return a synthesized RGB instead of a palette index. But every consumer of
   `compositeAt` — the eyedropper, `flattenFrame` (all six exporters), the AI text grid — exists
   specifically because this format is index-based (§1: "one character per pixel"). An eyedropper
   that "picks" a colour with no palette entry has nothing useful to do with it: add it to the
   palette on every click (surprising, and burns the 36-slot budget on hovering), or refuse (a tool
   that sometimes doesn't work), or snap it to the nearest existing entry (fine, but "nearest" is
   exactly what `compositeAt` already gives you for the common case and a worse approximation for
   the blended case, since it discards the actual blend the user is looking at rather than
   representing it honestly as "not one of your colours").
2. Have the exporters run a real per-pixel compositor and *then* quantise the result, so a
   multi-layer document with blending gets an SVG/CSS/React export that looks like the canvas.
   Rejected for this unit on cost/benefit: it would make export non-deterministic in the sense that
   changes to any layer's opacity or blend mode ripple into the palette that gets exported (colours
   appear and disappear from the output that were never in the working palette), which contradicts
   §1's "rows of single characters" premise that the exported grid *is* the document's own palette,
   not a derived one. It is also a second compositor to keep in sync with the renderer's, indefinitely.

So: rule 3 wins. The document's pixels are indices, the renderer is the one place blended appearance
exists, and every other consumer reads the document as indices, same as before this unit. This is a
knowingly-coarser edge than phase 1's — phase 1's approximation was exact for every document it could
then produce; this one is exact only when every layer stays default. It is written down here so it is
found by reading rather than by someone noticing an export does not match what they see on screen.

**Merge and flatten are the escape hatch.** A layer with real opacity or a real blend mode renders
correctly on the canvas; if its author wants that appearance to survive into an export or a picked
colour, merging it down or flattening the document bakes the true blended colour into the palette
(§12.5) — at which point `compositeAt` is exact again, because there is only one layer to be topmost
of.

### 12.5 Merge down and flatten

**No new command types.** §1's original phrase — "expressible as delete + paint" — is kept literally:
both operations are pure functions in a new module, `lib/artwork-core/merge-layers.ts`, that build a
`batch` out of commands that already exist (`palette_add`, `paint`, `layer_delete`), the same shape
`pasteImageCommand` already uses for "paint plus maybe new colours, as one undo step." Nothing about
`applyCommand`/`invertCommand` changes.

- **`mergeDownCommand(doc, frame, at)`** combines layer `at` into layer `at - 1` and removes layer
  `at`. No-op (`cmd: null`) when `at === 0` — there is nothing below the bottom layer; the panel
  disables the button in that state rather than calling this and discarding the result.
- **`flattenCommand(doc, frame)`** combines every layer in the frame into layer `0` and removes every
  layer above it. No-op when the frame already has one layer.

Both compute the **true blended colour** at every pixel — real per-layer opacity, real blend mode,
walked bottom-to-top exactly as the renderer draws (§12.5.1) — then hand the whole `w×h` RGBA buffer
to the *existing* `quantise()` (`lib/artwork-core/quantise.ts`, built for paste-image): reuse an
existing palette entry within `REUSE_MAX` (redmean ≤ 24), else claim a free slot, else — only once the
palette is genuinely full — snap to the nearest entry and report `clipped: true`. This is deliberately
the same three-rule ladder paste-image already uses and already has tests for, not a new one merge
invents: "what happens when a reduction needs more colours than there is room for" is one question in
this codebase, asked and answered once.

Why compute real colour at all rather than reusing `compositeAt`'s cheap topmost-wins answer (§12.4's
decision, restated for the opposite call site): merge and flatten are the one place in the app whose
entire job is "collapse layers into fewer layers, keeping what it looked like." Using the cheap
approximation here would make merging a 50%-opacity overlay *silently discard the 50%* — the merged
layer would look like the overlay was drawn at full strength, which is exactly the kind of surprise
rule 7 exists to catch, and worse because nothing indicates it happened; the stroke is still there,
just the wrong colour. So the two call sites make opposite choices for the same underlying reason
(honesty about what the format can and cannot represent): §12.4 declines to fake precision it cannot
promise everywhere, and §12.5 pays for real precision exactly where the operation's whole point is
"make this permanent."

**Command shape**, forward order (batch applies children in array order, §2):

```
flatten:   [palette_add?, paint(layer 0, blended pixels), layer_delete(top), …, layer_delete(1)]
mergeDown: [palette_add?, paint(layer at-1, blended pixels), layer_delete(at)]
```

`palette_add` first (its added entries are what the `paint` cells reference — the same ordering
`pasteImageCommand` uses and for the same reason). Deletes proceed **top index first** so that every
`layer_delete`'s `at` is valid at the moment it applies without needing to account for earlier deletes
shifting later indices — deleting from above never moves anything below it. `batch`'s existing inverse
(reverse the array, invert each child) reconstructs the original stack exactly: each `layer_delete`'s
inverse is a `layer_add` at the same index, so replaying them bottom-up (the reversed order) rebuilds
layers `1..top` at their original positions before the final `paint`⁻¹ restores layer 0's original
pixels and `palette_pop` removes the entries this operation added. No new inverse logic was written —
this is `batch` doing exactly what §2 already specified it to do, exercised on a longer chain than
phase 1 ever built one.

**Reporting.** Both functions return `{ cmd, result }` where `result` matches `PasteResult`'s shape
(`added`, `colours`, `clipped`) plus `layersConsumed` — the notice channel gets a sentence in the same
voice as paste's: *"Flattened 3 layers. Added 2 colours."* or, in the clipped case, *"...; the palette
was full, so 4 pixels were approximated to the nearest colour."* Never a silent flatten — rule 7.

#### 12.5.1 The compositor, `lib/artwork-core/blend.ts`

Pure, no DOM, imports nothing but the schema types — same constraint as everything else in
`artwork-core`. Standard alpha-compositing-with-blend-functions, per the CSS Compositing and Blending
spec (the same formula the canvas itself implements, reproduced here because artwork-core cannot call
into a `CanvasRenderingContext2D` to get it):

```ts
export function compositeStack(doc: Doc, layers: readonly Layer[]): Rgba
```

`layers` is passed explicitly rather than a frame index — the two callers (§12.5) each want a
different subset: `mergeDownCommand` composites exactly two layers, `flattenCommand` the whole stack.
For each pixel, starting from a transparent backdrop and walking `layers` **bottom to top** (array
order — matches the renderer's own draw loop), skipping `hidden`:

- source colour/alpha come from the palette entry at that pixel's index (`transparent`/index 0 →
  alpha 0) times the layer's own opacity (`(layer.o ?? 100) / 100`)
- `Cs_mixed = (1 − αb)·Cs + αb·B(Cb, Cs)` — the blend function only applies where the backdrop already
  has something to blend against; where it is still fully transparent, the layer shows through as
  plain source, which is what "nothing is there yet" has to mean
- `Co = (1 − αs/αo)·Cb + (αs/αo)·Cs_mixed`, `αo = αs + αb·(1 − αs)` — standard non-premultiplied
  "over," with `Cs_mixed` standing in for the source colour

`B(Cb, Cs)` for the eight modes in §12.2.1, each a per-channel function on 0–255 values (`multiply`,
`screen`, `darken`, `lighten`, `difference`, `exclusion` are direct; `overlay` is hard-light with its
arguments swapped, same as the spec defines it; `normal` is `B(Cb, Cs) = Cs`, which collapses the
whole formula to plain alpha-over — the existing, unglamorous behaviour, recovered as the zero case
rather than special-cased).

**Verified against the real renderer, not just against hand arithmetic.** Unit tests in
`blend.test.ts` check the eight formulas against values worked out by hand (multiply of pure red over
pure blue, etc.) and the `normal`-mode case against plain alpha-over. `tools/probe-merge.ts` (a new
browser probe) additionally builds a real two-layer document with a non-default opacity and blend
mode, reads the **rendered canvas pixel** at a known cell through `window.__tessera`, and asserts it
equals `compositeStack`'s prediction for that cell before quantisation — the same "don't just trust
the formula, sample the real output" discipline D used for React export pixel-identity.

### 12.6 Panel

Three additions to the structure in §6.1, in order top to bottom:

**1. A drag handle per row**, alongside the existing eye button, for reordering by drag. Pointer-based
(`onPointerDown`/`onPointerMove`/`onPointerUp` on the handle, `setPointerCapture` so the drag survives
leaving the row's bounds), not native HTML5 drag-and-drop — this codebase already prefers pointer
events for exactly this reason (`HANDOFF §5`'s wheel-listener note is the same family of decision: a
browser-native input gesture that only sort-of does what a pixel editor needs). The row order updates
visually as the pointer crosses a neighbour's midpoint; **only the final position commits**, as one
`layer_move`, on pointer-up — a drag is one undo step, exactly like every other panel control (§6.1's
closing line: "every one of these goes through `commit()`, so every one is a single undo step").
Move up/Move down stay: a drag handle does not help someone using a keyboard or a screen reader, and
removing a working control to add a nicer one for a different input method is not a trade this unit
makes.

**2. An active-layer strip**, between the row list and the footer, always showing the active layer's
name and its two new controls — an opacity `<input type="range">` (0–100, `accent-color: var(--accent)`,
the browser's own thumb rather than a custom one, matching this codebase's preference for dressed-up
native controls over reimplementing widgets — the rename `<input>` two lines above it in the same
component is the precedent) with a numeric readout, and a blend-mode `<select>` styled with
`--panel2`/`--line`/`--fg` the same way the rename input is. Both commit on change — the range input
commits on `pointerup`/`change`, not on every `input` event mid-drag, so dragging the slider from 100
to 40 is one undo step and not sixty. Selecting a layer changes what this strip shows; there is no
per-row inline version of it, because two controls per row in a 224px-wide panel that already carries
a name, an eye button and a drag handle does not fit, measured.

**3. A second footer row**: `Merge down` and `Flatten`, text buttons in the same idiom as
`Add`/`Copy`/`Delete`. `Merge down` disabled at `active === 0` (nothing below the bottom layer) with a
tooltip saying so; `Flatten` disabled at one layer. Both go through the notice channel on completion
(§12.5's reporting), and both are ordinary (non-red) commits — merging is not framed as destructive
the way Delete is, because nothing the user drew is lost, only recombined; §6.1's rule for Delete's red
styling ("a red button that never costs anything is how a red button stops meaning anything") argues
for restraint here specifically.

### 12.7 Registry

**No new actions.** §12.1 states the reasoning. `get_state`'s existing `layers` array
(`Array<{ index, name, hidden }>`, added in phase 1 §7.2) gains `opacity: number` (0–100) and
`blendMode: BlendMode`, always present (not conditional the way `get_grid`'s `composite` key is),
because the array is already small and per-layer, and an agent reasoning about "why does this look
different from what I expect" needs both numbers without an extra round trip. This is the only
registry change in this unit.

### 12.8 Error codes

Extends §10's table.

| Code | Meaning | Surfaces as |
|---|---|---|
| `L-E9` | `mergeDownCommand` at `at === 0`, or `flattenCommand` on a single-layer frame | `cmd: null`; the panel disables the button first, so this is a defensive return, not a user-facing message |

Nothing else needed one: opacity and blend-mode changes cannot fail (the range and the select both
constrain their own input), and merge/flatten's palette-overflow case is not a failure, it is
`clipped: true` in the result — same as paste-image, §17-file-menu.md §9.

### 12.9 Test requirements

- `lib/artwork-core/__tests__/schema.test.ts` (extend, or fold into `codec.test.ts`): a v1 document
  with neither `o` nor `mode` parses and both default correctly at read time; a document with `o: 100`
  or `mode: "normal"` round-trips **without** those keys appearing in `serializeDoc`'s output — the
  same "omitted when it's the default" property `hidden` already has, tested the same way.
  `lib/artwork-core/fixtures/legacy/pre-layers-draft.tessera.json` still parses, unchanged from
  phase 1's own test of it — this unit adds no new legacy fixture because it adds no breaking change.
- `lib/artwork-core/__tests__/blend.test.ts` — new file. Each of the eight `B(Cb, Cs)` functions
  against hand-computed values; `compositeStack` on a two-layer stack collapses to plain alpha-over
  when both layers are `normal`/opaque (regression: this must equal what phase 1's renderer always
  drew); a fully-transparent top layer leaves the backdrop unchanged for every blend mode; a hidden
  layer contributes nothing regardless of its opacity/mode.
- `lib/artwork-core/__tests__/merge-layers.test.ts` — new file. `mergeDownCommand` at `at: 0` returns
  `cmd: null`; a two-layer merge with both layers `normal`/opaque produces the same pixels as
  `compositeAt` would have shown (the cheap and expensive paths agree in the case where they are
  supposed to); a merge involving a non-default opacity or blend mode adds at least one new palette
  colour when none of the blended results are within `REUSE_MAX` of an existing entry; the round trip
  — apply, invert, apply the inverse — restores the original document byte-for-byte, including the
  palette, for a three-layer stack with mixed opacity and blend modes; `flattenCommand` on one layer
  returns `cmd: null`.
- `lib/artwork-core/__tests__/commands.test.ts` (extend): `layer_opacity` and `layer_blend_mode` are
  self-inverse under exchange, matching `layer_visible`'s existing test shape; `applyCommand` with an
  out-of-range layer for either new command type returns the document unchanged (`L-E7`, same guard).
- `tools/probe-merge.ts` — new browser probe. Builds a document through the real panel (add a layer,
  set its opacity and blend mode via the new controls, draw on it), reads the live canvas pixel, and
  asserts it matches `compositeStack`'s prediction — the cross-check §12.5.1 promises. Also drives:
  opacity slider commits once per drag (one undo entry, not one per `input` event), blend-mode select
  commits on change, drag-reordering two rows produces one `layer_move`-shaped undo entry, Merge down
  and Flatten disabled states, and the notice text after each.
- `npx tsx tools/check-responsive.ts` clean at all six viewports with the taller panel (active-layer
  strip + second footer row) — this is the unit that most needs the "check-responsive never opens a
  popover" trap (`HANDOFF §5`) kept in mind: the panel is not a popover, but it is exactly the kind of
  floating surface that check disabled by default and this unit is why `probe-layers.ts`/`probe-merge.ts`
  measure it open, not just the app at rest.
- Screenshots of the panel — rows, active-layer strip, both footer rows, a dropdown open — in both
  themes, looked at.
