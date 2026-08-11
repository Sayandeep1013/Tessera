# 03 — artwork-core

**Owns:** `lib/artwork-core/**`
**Depends on:** [01 — Document Format](./01-document-format.md)
**Depended on by:** renderer, editor, ai, exporters, persist — i.e. everything.

---

## 1. Boundary

`artwork-core` is the pure model layer. It is the one module in the codebase with a hard import ban:

> **`lib/artwork-core` must not import React, Next, any UI library, any browser-only global, or any
> other `lib/` module.** Its only dependency is `zod`.

Enforced by an ESLint `no-restricted-imports` rule scoped to the directory, and by a test that walks
the module graph. The reason is not purity for its own sake: it means the document model can run in a
Web Worker (GIF encoding), in a Node route handler (share validation, OG images), and in tests without
a DOM — all of which the later phases need.

`Date` is permitted (for `meta.updatedAt`). `crypto.randomUUID` is not — IDs are passed in.

### File map

| File | Responsibility |
|---|---|
| `schema.ts` | Types, constants, zod schemas, `Result` |
| `codec.ts` | Row↔`Uint8Array`, `parseDoc`, `serializeDoc`, `cloneDoc` |
| `ops.ts` | The AI operation vocabulary + shared geometry primitives |
| `commands.ts` | The undo/redo command system |
| `diff.ts` | Document comparison |
| `migrate.ts` | Format version migrations (currently empty) |
| `create.ts` | Blank-document and starter-document factories |
| `fixtures/` | Golden `.tessera.json` documents |
| `__tests__/` | Unit, property, and fuzz tests |

---

## 2. `Result` semantics

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
```

**Rule: nothing in `artwork-core` throws for a recoverable condition.** Invalid input, out-of-bounds
coordinates, bad palette indices, malformed JSON — all return `{ ok: false }`.

Exactly two things throw, both genuine programmer errors that no user input can reach:

- `indexToChar(i)` with `i` outside `0..35` → `RangeError`
- Any internal invariant violation → the invariant was already validated upstream

Callers narrow with `if (!result.ok) return result` or `if (result.ok) { … }`. There is no
`unwrap()` helper; that would reintroduce throwing through the back door.

### Error shapes

```ts
type DocError = { code: string; message: string; path?: string }
type OpError  = { code: string; message: string; opIndex?: number }
```

`message` is **user-facing prose** — it appears in the code panel and the AI error banner verbatim.
Write it accordingly: `row 4 has 17 characters, expected 16`, not `E_ROW_WIDTH`.

`path` is a dotted JSON path (`frames.0.layers.0.px[3][7]`) used by the code panel to place an inline
marker. It is always present for `schema`, `row_count`, `row_width`, `bad_char`, and `palette_range`.

### Error code registry

Every code, its source, and its meaning. **This table is the authority — do not invent codes.**

| Code | From | Meaning |
|---|---|---|
| `json` | `parseDoc` | Input string is not valid JSON |
| `future_version` | `parseDoc` | `v` exceeds this build's `FORMAT_VERSION` |
| `schema` | `parseDoc` | Failed zod validation (wrong type, out of range, missing field) |
| `palette_zero` | `parseDoc` | `palette[0].c !== "transparent"` |
| `row_count` | `decodeRows` | Row count ≠ `h` |
| `row_width` | `decodeRows` | A row's length ≠ `w` |
| `bad_char` | `decodeRows` | Character outside `.`/`1`–`9`/`a`–`z` |
| `palette_range` | `parseDoc`, `applyOps` | Pixel or op references an index ≥ `palette.length` |
| `out_of_bounds` | `applyOps` | Coordinate outside the canvas |
| `no_frame` | `applyOps` | Target frame index does not exist |
| `noop` | `applyOps` | `replace_color` with `from === to` |
| `palette_full` | `applyOps` | `add_palette_color` at 36 entries |
| `bad_color` | `applyOps` | Colour string fails the format regex |

---

## 3. `codec.ts`

```ts
function indexToChar(i: number): string            // throws RangeError outside 0..35
function charToIndex(ch: string): number           // -1 for unrecognised, never throws
function decodeRows(rows: string[], w: number, h: number): Result<Uint8Array, DocError>
function encodeRows(px: Uint8Array, w: number, h: number): string[]
function parseDoc(input: unknown): Result<Doc, DocError>       // accepts string or object
function serializeDoc(doc: Doc): string                        // canonical formatting
function cloneDoc(doc: Doc): Doc                               // deep, typed-array-aware
```

`parseDoc` accepts a `string` (parses JSON first) or an already-parsed object, so the code panel and
`fetch().json()` share one path.

`serializeDoc` output is canonical: fixed key order (`v, id, name, w, h, palette, frames, meta`),
2-space indent, one pixel row per line. See [01 §8](./01-document-format.md) for the round-trip
guarantees this enables.

`cloneDoc` copies every `Uint8Array` (`new Uint8Array(src)`). A shallow clone that shares pixel
buffers would make undo silently corrupt history — this is the single most dangerous bug available in
this codebase, and it is covered by an explicit test.

---

## 4. `ops.ts`

The AI operation vocabulary. Full detail in [06 — AI Protocol](./06-ai-protocol.md); the module
contract is here.

```ts
type Op = /* discriminated union on `op` — see 06 §4 */
const opSchema: z.ZodType<Op>

function applyOp(doc: Doc, op: Op, frameIndex?: number): Result<Doc, OpError>
function applyOps(doc: Doc, ops: Op[], frameIndex?: number): Result<Doc, OpError>

// Geometry primitives — shared with the editor's tools
function linePoints(x1: number, y1: number, x2: number, y2: number): Array<[number, number]>
function floodFillPoints(px: Uint8Array, w: number, h: number, x: number, y: number): Array<[number, number]>
function rectPoints(x: number, y: number, w: number, h: number, fill: boolean): Array<[number, number]>
```

### Semantics

- **Immutable.** `applyOps` clones once, mutates the clone, returns it. The input document is never
  touched, including on failure.
- **Atomic.** On any error, the whole call fails; no partial application is observable. Because the
  work happens on a clone, this is free.
- **Ordered.** Ops apply in array order. `add_palette_color` at index 2 makes its new index available
  to ops 3+, which is why validation must simulate the palette growing (see 06 §5).
- **Targets `layers[0]`** of the given frame. The v1 UI has no layer selection; when layers ship this
  becomes a parameter.
- `applyOp` is `applyOps` with a single-element array. It exists for readability at call sites.

### Why the primitives live here

`linePoints`, `floodFillPoints`, and `rectPoints` are used by **both** the AI path (`applyOps`) and
the editor's own tools. Duplicating Bresenham would mean the AI's `draw_line` and the user's line tool
could disagree about which pixels a line covers — a bug that would be nearly invisible and extremely
confusing. One implementation, one set of tests.

`floodFillPoints` is 4-connected, uses an explicit stack (never recursion — a 256×256 flood would blow
the call stack), and returns the cells rather than mutating, so the editor can preview a fill on hover
without committing it.

---

## 5. `commands.ts`

The undo/redo system. Every mutation to the document — from a brush stroke, a palette edit, an AI
accept, or a code-panel edit — goes through exactly one command.

```ts
/** [x, y, before, after] — a single pixel's transition. */
type PaintCell = [number, number, number, number]

type EditorCommand =
  | { type: 'paint';          label: string; frame: number; cells: PaintCell[] }
  | { type: 'ai_edit';        label: string; frame: number; cells: PaintCell[]
                            ; summary: string; ops: Op[]; paletteAdded: PaletteEntry[] }
  | { type: 'palette_add';    label: string; entry: PaletteEntry }
  | { type: 'palette_edit';   label: string; index: number; before: PaletteEntry; after: PaletteEntry }
  | { type: 'frame_add';      label: string; at: number; frame: Frame }
  | { type: 'frame_delete';   label: string; at: number; frame: Frame }
  | { type: 'frame_duration'; label: string; at: number; before: number; after: number }
  | { type: 'replace_doc';    label: string; before: Doc; after: Doc }
  | { type: 'resize';         label: string; before: Doc; after: Doc }

function applyCommand(doc: Doc, cmd: EditorCommand): Doc
function invertCommand(cmd: EditorCommand): EditorCommand
```

### The `before`/`after` design

`paint` and `ai_edit` store **both** the previous and new value for every touched pixel. Inversion is
then a pure swap — no re-derivation, no dependence on document state at undo time:

```ts
// invert of a paint command
{ ...cmd, cells: cmd.cells.map(([x, y, before, after]) => [x, y, after, before]) }
```

This costs 4 numbers per changed pixel. A 400-pixel stroke is 1600 numbers ≈ 12KB — negligible, and
it buys correctness that a "replay the op backwards" design cannot offer (flood fill and
`replace_color` are not cleanly invertible as operations).

`ai_edit` is deliberately the **same shape** as `paint` plus metadata. Accepting an AI proposal and
undoing it therefore use exactly the same code path as a brush stroke — which is what makes "one ⌘Z
reverses the whole AI edit" fall out for free rather than needing special handling.

### `replace_doc` and `resize`

These store whole documents because the change is arbitrary (a code-panel edit can alter anything;
a resize changes every buffer's length). They are the only commands that are not delta-encoded. Both
are rare and user-initiated, so the memory cost is acceptable.

`resize` is separate from `replace_doc` only so the history label reads correctly and so the editor
can restore the viewport sensibly on undo.

### `label`

A short user-facing string for the history UI and the `aria-live` announcement: `"Brush"`, `"Fill"`,
`"AI: make it angrier"`, `"Edit code"`, `"Add colour"`. Set at construction, never derived at undo
time.

### Invariants

1. `applyCommand(applyCommand(d, c), invertCommand(c))` deep-equals `d`, for every command type.
2. `invertCommand(invertCommand(c))` deep-equals `c`.
3. `applyCommand` never mutates its input.
4. A `paint` command with zero cells is never constructed — the caller drops it. (An empty stroke
   must not consume an undo step.)

All four are property tests, not examples.

### History stack

Lives in `lib/editor/history.ts`, not here — it is editor state, not model. `commands.ts` provides
only `applyCommand` / `invertCommand`. See [05 — Editor](./05-editor.md) §7.

---

## 6. `diff.ts`

```ts
type PixelDiff = {
  added:   Array<[x: number, y: number, to: number]>
  changed: Array<[x: number, y: number, from: number, to: number]>
  removed: Array<[x: number, y: number, from: number]>
  paletteAdded: PaletteEntry[]
}

function diff(before: Doc, after: Doc, frame: number): PixelDiff
function isEmpty(d: PixelDiff): boolean
function diffCounts(d: PixelDiff): { added: number; changed: number; removed: number }
```

Classification, per pixel:

| `before` | `after` | Bucket |
|---|---|---|
| `0` | non-`0` | `added` |
| non-`0` | different non-`0` | `changed` |
| non-`0` | `0` | `removed` |
| equal | equal | omitted |

`paletteAdded` lists entries present in `after.palette` but not `before.palette`, compared by
position (indices are identity — two entries with the same hex at different indices are different
entries, and merging them would silently rewrite pixels).

**Requires `before.w === after.w && before.h === after.h`.** A dimension change is a `resize`
command, not a diff — `diff` throws `RangeError` on mismatched dimensions, because reaching it means
a caller bug, not bad user input.

`isEmpty` exists so the AI path can distinguish "the model proposed nothing" from "the model
succeeded", which are very different messages to show a user.

---

## 7. `create.ts`

```ts
function createDoc(opts: {
  id: string
  w?: number            // default 32
  h?: number            // default 32
  name?: string         // default ''
  palette?: PaletteEntry[]   // default DEFAULT_PALETTE
}): Doc

function loadStarter(name: StarterName): Doc
type StarterName = 'face' | 'knight' | 'tile'

const DEFAULT_PALETTE: PaletteEntry[]
```

`createDoc` produces a single frame, single layer, all pixels index 0. `id` is required and injected
— `artwork-core` does not generate IDs (see §1).

`DEFAULT_PALETTE` is transparent plus a compact 15-colour ramp suitable for immediate drawing. It is
a checked-in constant, not generated.

`loadStarter` returns a parsed clone of a checked-in fixture. It must return a **fresh clone** each
call, or two starter loads would share pixel buffers.

---

## 8. `fixtures/`

Golden documents, checked in, used by unit tests, golden-image tests, exporter tests, and the AI
probe matrix. Because they are shared, **changing a fixture invalidates goldens across four test
suites** — treat them as frozen unless the format itself changes.

| File | Size | Purpose |
|---|---|---|
| `starters/face.tessera.json` | 16×16 | Default canvas content; primary AI probe subject |
| `starters/knight.tessera.json` | 24×24 | Character with a distinct held object (tests add/remove) |
| `starters/tile.tessera.json` | 32×32 | Landscape tile (tests palette/atmosphere edits) |
| `edge/1x1.tessera.json` | 1×1 | Smallest legal document |
| `edge/empty.tessera.json` | 16×16 | All transparent |
| `edge/full-palette.tessera.json` | 8×8 | Exactly 36 palette entries, all used |
| `edge/single-color.tessera.json` | 8×8 | Palette of 1 (`transparent` only) |
| `edge/animated.tessera.json` | 16×16 | 4 frames, varying `ms` |
| `edge/multilayer.tessera.json` | 16×16 | 3 layers incl. one `hidden` — hand-authored, exercises the renderer |
| `invalid/*.json` | — | One file per error code in §2, for parser tests |

---

## 9. `migrate.ts`

```ts
export const migrations: Array<(doc: unknown) => unknown> = []
```

Index `n` migrates format `v(n+1)` → `v(n+2)`. `parseDoc` runs the applicable slice before schema
validation. Empty today; it exists so the first migration has an obvious, already-wired home rather
than prompting an architectural discussion under time pressure.

Adding a migration requires, in the same change: the function, a fixture at the old version, and a
test asserting the old fixture loads and deep-equals the expected new document.

---

## 10. Performance

Targets, at the canvas sizes this app supports (≤ 256×256 = 65,536 pixels):

| Operation | Budget |
|---|---|
| `parseDoc` on a 64×64 document | < 5ms |
| `serializeDoc` on a 64×64 document | < 3ms |
| `cloneDoc` on a 256×256 × 8 frames | < 10ms |
| `applyOps` with 400 `set_pixels` | < 1ms |
| `diff` on 256×256 | < 5ms |
| `floodFillPoints` worst case (256×256 all one colour) | < 15ms |

Notes:

- `cloneDoc` on every op is deliberate. At these sizes it is cheap, and it buys immutability that
  prevents an entire class of undo bugs. **Do not optimise it into copy-on-write** without a profile
  proving it matters.
- `serializeDoc` is called on every code-panel refresh (debounced 100ms). If a 256×256 document makes
  that janky, debounce further — do not make serialization incremental.
- Typed arrays are structured-cloneable, so passing a `Doc` to a Worker is free of manual
  serialization. GIF export depends on this.

---

## 11. Test requirements

`lib/artwork-core/__tests__/`:

**codec.test.ts**
- `indexToChar`/`charToIndex` inverse across `0..35`
- `charToIndex` returns `-1` for `'0'`, `'A'`, `'!'`, `''`, `'🙂'`
- `indexToChar(36)` and `indexToChar(-1)` throw `RangeError`
- Each of `row_count`, `row_width`, `bad_char` from crafted rows
- Each of the eight `parseDoc` error codes from `fixtures/invalid/`
- Fuzz: 1000 random JSON values through `parseDoc`, assert no throw
- Round-trip structural + byte-level over every fixture and 200 generated documents
- `cloneDoc`: pixel buffers are not reference-equal; mutating the clone leaves the original unchanged

**ops.test.ts**
- Every op type: happy path, out-of-bounds, bad palette index
- `linePoints`: horizontal, vertical, both diagonals, single point, reversed endpoints produce the
  same set
- `floodFillPoints`: enclosed region, whole canvas, already-target colour, 1×1 canvas
- `rectPoints`: filled vs outline, 1×1 rect, 1×N rect
- `applyOps` atomicity: a valid op followed by an invalid one leaves the input untouched **and**
  returns an error
- `add_palette_color` then an op referencing the new index succeeds in one call
- `add_palette_color` at 36 entries returns `palette_full`

**commands.test.ts**
- Property: apply-then-invert restores the original, for all nine command types
- Property: double inversion is identity
- `applyCommand` does not mutate its input
- An `ai_edit` and an equivalent `paint` produce identical documents

**diff.test.ts**
- Each of added/changed/removed classified correctly
- Identical documents produce an empty diff and `isEmpty` is `true`
- `paletteAdded` populated correctly
- Mismatched dimensions throw `RangeError`

The import-boundary assertion (`lib/artwork-core` imports nothing but `zod`) is **not** a local test —
it lives with the other cross-cutting invariants in `tests/invariants/`
([11 §8](./11-testing.md)), so all of them are found and maintained in one place.
