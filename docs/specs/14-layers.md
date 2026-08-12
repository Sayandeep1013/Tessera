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

## 9. Interaction with #47 (frames), noted and not built

Layers are per-frame. Everything in this spec addresses `frames[activeFrame].layers`, and nothing
here assumes frames are uniform.

When #47 lands it must decide, in its own sub-spec:

- Whether adding a layer adds it to **every** frame or only the current one. The format permits
  divergence; a timeline that shows layers as rows does not.
- What the active layer becomes when the frame changes. `commit` already clamps, so the failure mode
  is a silently-moved selection rather than a crash — but "clamped" is not "correct".
- Whether `sameLayerShape` should compare across all frames (it does today) or only the active one.
  The strict version is what makes the session fallback safe; the loose version may be wanted once
  frames can differ.

Do not half-build any of it here.

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
