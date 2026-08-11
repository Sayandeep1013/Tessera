# 05 — Editor and Input

**Owns:** `lib/editor/**`, `lib/store/**`, `components/canvas/**`
**Depends on:** [03 — artwork-core](./03-artwork-core.md), [04 — Renderer](./04-renderer.md), [02 — Design System](./02-design-system.md)

---

## 1. State split

Four stores, deliberately separate. A single store would make every pointer move re-render the top
bar.

| Store | Holds | Persisted |
|---|---|---|
| `useDocStore` | The `Doc`, current frame index | IndexedDB (debounced) |
| `useEditorStore` | Tool, colour index, brush size/shape, viewport, cursor, selection | `localStorage` (tool + brush only) |
| `useHistoryStore` | `past[]`, `future[]` | **No** — in-memory only |
| `useAiStore` | Proposal state machine ([06 §7](./06-ai-protocol.md)) | No |

Zustand + Immer. `useDocStore` exposes exactly one mutator:

```ts
commit(cmd: EditorCommand): void   // applies, pushes to history, clears future, schedules autosave
```

**Nothing else may write the document.** Not the AI, not the code panel, not the palette editor.
This is the single invariant that makes undo trustworthy.

---

## 2. Tools

| Tool | Key | Behaviour |
|---|---|---|
| Select | `V` | Rectangular marquee; move/delete the selected region. Phase 3. |
| Brush | `B` | Paints the current index. Shape `square`\|`round`, size 1–8. |
| Eraser | `E` | Paints index 0. Same shape and size controls. |
| Fill | `F` | 4-connected flood fill via `floodFillPoints`. |
| Rectangle | `R` | Drag to draw; `Shift` constrains to a square; outline or filled per the toolbar. |
| Marquee | `M` | Rectangular selection. Phase 3. |
| Eyedropper | `I` | Sets the current colour index from the pixel under the cursor. Does not commit a command. |
| Pan | `Space` (hold) / middle-drag | Temporary; releases back to the previous tool. |

### Brush shapes

Precomputed offset masks per (shape, size), built once at module load:

```ts
function brushMask(shape: 'square' | 'round', size: number): Array<[dx, dy]>
```

- `square`: the full `size × size` block, origin at its top-left-of-centre.
- `round`: cells whose centre lies within `size/2` of the brush centre. Size 1 and 2 are identical to
  `square` by definition (a 1- or 2-cell circle is a square); this is asserted in a test so the
  toggle is never mistaken for broken.

Masks are checked into a fixture and golden-tested — an off-by-one in a brush mask is invisible in
code review and obvious on screen.

---

## 3. Stroke → command grouping

**The rule: one gesture is one undo step.** A 400-pixel drag must not create 400 history entries, and
must not snapshot the canvas 400 times.

```
pointerdown  → open a stroke buffer; setPointerCapture; paint the first cell
pointermove  → interpolate from the last cell with linePoints; paint each new cell
pointerup    → close the buffer; if non-empty, commit ONE command
pointercancel→ discard the buffer and repaint from the document (no commit)
```

The stroke buffer is a `Map<pixelIndex, PaintCell>`:

- Keyed by `y * w + x`, so re-crossing a cell within one stroke updates the entry rather than adding
  a duplicate.
- `before` is captured **the first time** a cell is touched; `after` is overwritten freely.
- A cell whose final `after === before` is dropped at commit time (painting over the same colour is
  not a change).
- An empty buffer commits nothing — an undo step is never consumed by a no-op click.

**Interpolation is required.** Pointer events at 60Hz during a fast drag skip cells; without
`linePoints` between the previous and current position, strokes come out dotted. This is the most
commonly missed detail in a pixel editor.

The in-progress stroke is drawn to the canvas immediately for responsiveness, but the document is not
mutated until `pointerup`.

### Pointer capture

`setPointerCapture` on `pointerdown` and release on `pointerup`. Without it, a stroke that leaves the
canvas bounds stops receiving events and the buffer is never committed — the user's paint silently
disappears.

---

## 4. Coordinate conversion

`lib/editor/coords.ts`:

```ts
function screenToDoc(e: { clientX: number; clientY: number }, rect: DOMRect, vp: Viewport): { x: number; y: number }
function docToScreen(x: number, y: number, rect: DOMRect, vp: Viewport): { x: number; y: number }
function isInside(x: number, y: number, doc: Doc): boolean
```

```ts
const x = Math.floor((e.clientX - rect.left - vp.offsetX) / vp.scale)
const y = Math.floor((e.clientY - rect.top  - vp.offsetY) / vp.scale)
```

`Math.floor`, never `Math.round` — rounding makes each cell's clickable area straddle two cells and
puts the boundary half a cell off.

Out-of-bounds results are returned as-is (they can legitimately be negative); callers gate with
`isInside`. Painting silently ignores out-of-bounds cells rather than clamping — clamping would smear
paint along the canvas edge whenever a stroke leaves it.

---

## 5. Zoom and pan

### Zoom ladder

Integer scales only, so cells always tile exactly ([04 §3](./04-renderer.md)):

```
1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64
```

`+` / `−` step through the ladder. Wheel zoom snaps to the nearest ladder entry. Maximum is the
ladder's end or whatever keeps the artwork under 8192 CSS px, whichever is smaller.

**Zoom is anchored at the pointer** — the document pixel under the cursor stays under the cursor:

```ts
const before = screenToDoc(e, rect, vp)
const next = nextScale(vp.scale, direction)
vp.offsetX -= (before.x * next) - (before.x * vp.scale)
vp.offsetY -= (before.y * next) - (before.y * vp.scale)
vp.scale = next
```

Anchoring at the canvas centre instead is the common shortcut and feels wrong immediately.

### Fit

`1` fits the artwork with a 48px margin, choosing the largest ladder scale that fits, and centres it.
Also runs on first load, on document resize, and on window resize when the artwork would fall
entirely outside the viewport.

### Pan

Middle-drag, `Space`+drag, or two-finger drag. `offsetX/offsetY` move freely — there are **no pan
bounds**. Clamping pan is a frequent annoyance at high zoom; if the user pans the artwork off-screen,
`1` brings it back.

The zoom readout shows `32×` and the canvas size shows `16×16`, side by side and always both visible.
These are separate values and are never conflated ([02 §6](./02-design-system.md)).

---

## 6. Keyboard

| Key | Action |
|---|---|
| `B` `E` `F` `I` `R` `M` `V` | Select tool |
| `⌘Z` / `Ctrl+Z` | Undo |
| `⌘⇧Z` / `Ctrl+Y` | Redo |
| `⌘S` | Export JSON |
| `⌘K` | Focus the AI composer |
| `+` / `−` | Zoom |
| `1` | Fit to view |
| `[` / `]` | Brush size down / up |
| `X` | Swap current colour with index 0 |
| `Space` (hold) | Temporary pan |
| `Esc` | Cancel stroke, close popover, reject proposal |
| `?` | Shortcut sheet |
| `⌥` (hold) | Temporary eyedropper |

Bindings are suppressed while focus is in a text input, **except** `Esc` and `⌘K`. Arrow keys move a
pixel cursor and `Enter` paints, for keyboard-only operation ([02 §9](./02-design-system.md)).

---

## 7. History

`lib/editor/history.ts`:

```ts
type History = { past: EditorCommand[]; future: EditorCommand[] }

function push(h: History, cmd: EditorCommand): History   // clears future
function undo(h: History, doc: Doc): { history: History; doc: Doc } | null
function redo(h: History, doc: Doc): { history: History; doc: Doc } | null
```

- `undo` pops from `past`, applies `invertCommand`, pushes the **original** command to `future`.
- `redo` pops from `future`, applies it, pushes back to `past`.
- Any new `commit` clears `future`. There is no redo branch tree.
- **Depth cap: 100 commands.** Beyond that the oldest is dropped. At ~12KB for a large stroke this
  bounds history at a few MB.
- `replace_doc` and `resize` carry whole documents; the cap applies to them equally, which is the
  reason for a cap at all.

History is **not persisted** ([SPEC §6](../SPEC.md)). A refresh keeps the artwork and loses undo.
This is stated in `⋯ → About` rather than being a surprise.

---

## 8. Touch

| Gesture | Action |
|---|---|
| One finger drag | Draw |
| Two finger drag | Pan |
| Two finger pinch | Zoom, anchored at the midpoint |
| Long press (500ms) | Eyedropper at that cell |

`touch-action: none` on the canvas so the browser never scrolls the page mid-stroke. Pointer Events
handle mouse, pen, and touch through one code path; there are no separate `touchstart` handlers.

A second finger landing during a one-finger stroke **cancels the stroke** (discarding the buffer,
committing nothing) and begins a pan. Without this, starting a pan leaves a stray mark.

Pen input uses `pointerType === 'pen'`; pressure is ignored in v1 (pixel art does not want it).

---

## 9. Autosave

```
commit → debounce 500ms → serializeDoc → IndexedDB put → status: 'saved'
```

Status is `saved` | `saving` | `offline` | `error`, shown as a 12px dim label in the top bar. Never a
toast, never a modal ([02 §7](./02-design-system.md)).

On `error`, the label turns `--diff-remove` and becomes a button that retries and offers
`Download JSON` as an escape hatch. **Artwork is never silently discarded** — this is the fallback
that guarantees it.

`beforeunload` flushes any pending save synchronously.

---

## 10. Test requirements

**`coords.test.ts`** — round-trip `screenToDoc`/`docToScreen` at scales 1, 8, 32 with non-zero
offsets; boundary cells resolve to the correct index at each edge; negative and overflow coordinates
returned unclamped.

**`stroke.test.ts`**
- A 3-cell drag commits **one** command with 3 cells
- Re-crossing a cell yields one entry whose `before` is from the first crossing
- Painting the existing colour commits nothing
- A fast drag from (0,0) to (10,10) fills every interpolated cell (no gaps)
- `pointercancel` commits nothing and leaves the document unchanged
- A stroke leaving the canvas bounds still commits on `pointerup` (capture works)

**`history.test.ts`**
- Property: N commits then N undos restores the initial document exactly
- Redo after undo restores the post-commit document
- A commit after undo clears `future`
- The cap drops the oldest at 101 commands
- Undo of an `ai_edit` restores the pre-proposal document in one step

**`zoom.test.ts`** — ladder stepping stays on-ladder; pointer-anchored zoom keeps the target cell
under the cursor at every ladder step; fit chooses the largest fitting scale and centres.

**`brush.test.ts`** — masks match golden fixtures for both shapes at sizes 1–8; size 1 and 2 are
identical between shapes.
