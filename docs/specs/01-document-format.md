# 01 — Document Format

**Owns:** `lib/artwork-core/schema.ts`, `lib/artwork-core/codec.ts`
**Depended on by:** everything. Read this before any other sub-spec.

---

## 1. Why this format

Four consumers need the same bytes:

| Consumer | Requirement |
|---|---|
| Runtime editor | Fast random pixel access, cheap mutation |
| Autosave / share | Compact, serializable |
| `Export → JSON` | Human-readable, hand-editable, diffs cleanly in git |
| Code panel (§07) | Must *look* like code a person would want to edit |
| AI text grid (§06) | Must be spatially legible to a model reading it as text |

A base64 blob satisfies the first two and fails the last three. A flat array of hex strings
(`["#ff0000", "#ff0000", …]`) satisfies readability and fails compactness catastrophically —
a 32×32 canvas becomes 1024 nine-character strings.

**Rows of single characters, one character per pixel** satisfies all five. It is the whole reason
the code panel and the AI grid are the same artifact rather than two implementations.

```
"....1111...."     ← you can see the shape in the source
"...122221..."
"..12222221.."
```

---

## 2. Character encoding

One character per pixel. The full mapping:

| Index | Char | Index | Char | Index | Char | Index | Char |
|------:|:-----|------:|:-----|------:|:-----|------:|:-----|
| 0 | `.` | 9 | `9` | 18 | `i` | 27 | `r` |
| 1 | `1` | 10 | `a` | 19 | `j` | 28 | `s` |
| 2 | `2` | 11 | `b` | 20 | `k` | 29 | `t` |
| 3 | `3` | 12 | `c` | 21 | `l` | 30 | `u` |
| 4 | `4` | 13 | `d` | 22 | `m` | 31 | `v` |
| 5 | `5` | 14 | `e` | 23 | `n` | 32 | `w` |
| 6 | `6` | 15 | `f` | 24 | `o` | 33 | `x` |
| 7 | `7` | 16 | `g` | 25 | `p` | 34 | `y` |
| 8 | `8` | 17 | `h` | 26 | `q` | 35 | `z` |

### Deliberate choices

- **`0` is not a valid character.** Only `.` means transparent. Two spellings for the same value
  would break byte-equality on round-trip and make rows harder to scan. A parser encountering `0`
  returns `bad_char`, it does not coerce.
- **Lowercase only.** `A`–`Z` are invalid. Uppercase would double the alphabet to 62 but make rows
  visually noisier and introduce case-sensitivity bugs in hand-edited files.
- **Maximum 36 entries.** This is the trade: range for readability. Aseprite supports 256. A
  portfolio pixel-art tool does not need 256, and a format a human can read is worth more here.

### Palette-full behaviour

Adding a 37th colour is a **user-facing error**, never a silent failure:

> Palette is full (36 colours). Replace a colour instead of adding one.

The AI validator (§06) rejects an `add_palette_color` op that would exceed 36 before anything is
applied.

---

## 3. Serialized form

File extension `.tessera.json`. MIME `application/json`. UTF-8, LF line endings, no BOM.

```json
{
  "v": 1,
  "id": "kd8f3n2p",
  "name": "knight",
  "w": 16,
  "h": 16,
  "palette": [
    { "c": "transparent" },
    { "c": "#2d1b00", "n": "outline" },
    { "c": "#f4c430", "n": "skin" },
    { "c": "#8b1a1a", "n": "tunic" }
  ],
  "frames": [
    {
      "ms": 100,
      "layers": [
        { "n": "base", "px": ["................", "....11111111...."] }
      ]
    }
  ],
  "meta": {
    "createdAt": "2026-08-11T09:00:00.000Z",
    "updatedAt": "2026-08-11T09:14:22.410Z"
  }
}
```

### Field reference

| Path | Type | Constraint | Notes |
|---|---|---|---|
| `v` | `1` | literal | Format version. A parser seeing `v > 1` refuses; see §7. |
| `id` | string | 1–64 chars | `nanoid(10)` in practice. Stable across edits. |
| `name` | string | 0–128 chars | Display only. May be empty. |
| `w` | int | 1–256 | Canvas width in pixels. |
| `h` | int | 1–256 | Canvas height in pixels. |
| `palette` | array | 1–36 entries | `palette[0]` must be transparent. |
| `palette[].c` | string | see below | The colour. |
| `palette[].n` | string? | 0–32 chars | Optional human label (`"outline"`). Never used for lookup. |
| `frames` | array | ≥ 1 | Ordered animation frames. |
| `frames[].ms` | int | 10–10000 | Display duration. |
| `frames[].layers` | array | ≥ 1 | Bottom-to-top paint order. |
| `frames[].layers[].n` | string | 0–32 chars | Layer name. |
| `frames[].layers[].hidden` | bool? | — | Omitted when false. Hidden layers still serialize. |
| `frames[].layers[].o` | int? | 0–100 | Opacity, percent. Omitted means 100 (opaque). Added in [14 §12.2](./14-layers.md#122-format-no-version-bump); no version bump — see there. |
| `frames[].layers[].mode` | string? | one of `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `difference`, `exclusion` | Blend mode. Omitted means `normal`. Same addition as `o`. |
| `frames[].layers[].px` | string[] | length === `h` | Each row length === `w`. |
| `meta.createdAt` | string | ISO 8601 | |
| `meta.updatedAt` | string | ISO 8601 | Written on every mutation. |

### Colour strings

Exactly three forms, all lowercase:

- `"transparent"` — only valid at `palette[0]`
- `"#rrggbb"` — opaque
- `"#rrggbbaa"` — with alpha

Rejected: `#FFF` (short form), `#FFFFFF` (uppercase), `rgb(...)`, `hsl(...)`, named colours other
than `transparent`. The regex is `/^#[0-9a-f]{6}([0-9a-f]{2})?$/`.

Short and uppercase forms are rejected rather than normalized so that `serialize(parse(x)) === x`
holds byte-for-byte — a property the code panel depends on to avoid rewriting the user's text
underneath them as they type.

---

## 4. Invariants

Enforced by `parseDoc`. Each has a stable error `code` so the UI can render a targeted message.

| # | Invariant | Error code |
|---|---|---|
| 1 | Input is valid JSON | `json` |
| 2 | `v <= 1` | `future_version` |
| 3 | Matches the zod schema (types, ranges, required fields) | `schema` |
| 4 | `palette[0].c === "transparent"` | `palette_zero` |
| 5 | `px.length === h` for every layer | `row_count` |
| 6 | `row.length === w` for every row | `row_width` |
| 7 | Every character decodes to a valid index | `bad_char` |
| 8 | Every decoded index `< palette.length` | `palette_range` |

`parseDoc` **never throws.** It returns `Result<Doc, DocError>` where `DocError` is
`{ code, message, path? }`. `path` is a dotted JSON path (`frames.0.layers.0.px[3][7]`) so the code
panel can place an inline marker at the offending character.

### Failure examples

| Input problem | Code | Message |
|---|---|---|
| 15 rows on a 16-tall canvas | `row_count` | `expected 16 rows, got 15` |
| A row with 17 characters | `row_width` | `row 4 has 17 characters, expected 16` |
| A `Q` in a row | `bad_char` | `unrecognised character "Q" at row 2, column 9` |
| Index `5` with a 4-entry palette | `palette_range` | `pixel at (3, 7) uses palette index 5, but the palette has 4 entries` |
| `"palette": [{"c": "#000000"}]` | `palette_zero` | `palette[0] must be "transparent"` |

---

## 5. Runtime form

On parse, each layer's `px` becomes a flat `Uint8Array` of length `w * h`, row-major.

```ts
const index = px[y * w + x]
```

Rationale: `Uint8Array` gives O(1) access, is trivially cloneable (`new Uint8Array(px)`), is
structured-cloneable for IndexedDB and Web Workers, and holds 0–255 which comfortably covers 0–35.

**Nothing outside `codec.ts` converts between the two forms.** The editor, renderer, and ops work
exclusively on `Uint8Array`; the code panel, exporters, autosave, and AI context builder call
`encodeRows` / `serializeDoc`.

---

## 6. Layers

`frames[].layers` is an array from v1. The renderer has always composited all layers bottom-to-top.

**Layers shipped in task #46 — see [14 — Layers](./14-layers.md), which owns the behaviour.** The
forward-compatibility bet in this section paid off exactly as intended: adding a panel, an active
layer and layer commands required **no format change at all**. `v` is still 1, `migrations` is still
empty, and a draft saved before the panel existed still opens (pinned by
`lib/persist/__tests__/legacy-draft.test.ts`).

What it cost, for the record, was one array index at each call site and one genuinely hard decision
— a `paint` command has to record *which* layer it touched, or undo writes the previous pixels into
whichever layer happens to be active. That is 14 §2.

**Do not "simplify" this away.** It is the one piece of forward-compatibility in the format, and it
was a deliberate decision (see the design review).

**The same bet paid off a second time in task E** ([14 §12](./14-layers.md#12-phase-2--opacity-blend-modes-mergeflatten-drag-reorder)):
per-layer opacity and blend mode are two more optional fields, defaulting to "as if this feature did
not exist" exactly the way `hidden` already did, so they needed no version bump either. `v` is still
`1`.

---

## 7. Versioning and migration

`v` is a monotonically increasing integer.

- A parser encountering `v > FORMAT_VERSION` **refuses with `future_version`** and a message naming
  both versions. It never guesses, never partially loads, never drops unknown fields silently.
- Migrations live in `lib/artwork-core/migrate.ts` as an ordered array:

  ```ts
  export const migrations: Array<(doc: any) => any> = [
    // index 0 migrates v1 -> v2, index 1 migrates v2 -> v3, ...
  ]
  ```

  `parseDoc` runs `migrations[v-1]` through `migrations[FORMAT_VERSION-2]` before schema validation.
- **There are no migrations yet.** The array is empty. It exists so the first one has an obvious home.

Bumping `v` requires: a migration function, a fixture at the old version, and a test asserting the
old fixture loads and equals the expected new-version document.

---

## 8. Round-trip guarantees

Two properties, both asserted in tests:

1. **Structural:** `parseDoc(serializeDoc(d))` deep-equals `d` for every document.
2. **Byte-level:** `serializeDoc(parseDoc(s).value) === s` for every canonically-formatted string `s`.

Property (2) is why colour normalization is rejected rather than applied, and why key order in
`serializeDoc` is fixed (`v, id, name, w, h, palette, frames, meta`) rather than following object
insertion order.

**Canonical formatting:** `JSON.stringify(obj, null, 2)`. Two-space indent. This puts each pixel row
on its own line, which is what makes the code panel readable and git diffs meaningful — a one-pixel
change is a one-line diff.

---

## 9. Edge cases

| Case | Behaviour |
|---|---|
| 1×1 canvas | Legal. `px: ["."]`. |
| All-transparent artwork | Legal. Exports produce a fully transparent PNG and an empty SVG `<g>`. |
| Palette of exactly 1 (`transparent` only) | Legal. Every pixel must be `.`. |
| Palette of exactly 36 | Legal. `add_palette_color` fails with `palette_full`. |
| A palette entry no pixel references | Legal. Never auto-pruned — the user may be about to use it. |
| `hidden: true` on `layers[0]` | Legal, renders nothing. The v1 UI cannot produce this; a hand-edited file can. |
| Duplicate colours in the palette | Legal. Not deduplicated — indices are identity, and merging them would silently rewrite pixels. |
| `name: ""` | Legal. UI shows `untitled`. |
| Document > 256KB | Rejected at the share endpoint (§09), not by the parser. |

---

## 10. Worked example

A 4×4 document with a two-colour checkerboard:

```json
{
  "v": 1,
  "id": "checker01",
  "name": "checker",
  "w": 4,
  "h": 4,
  "palette": [
    { "c": "transparent" },
    { "c": "#000000", "n": "black" },
    { "c": "#ffffff", "n": "white" }
  ],
  "frames": [
    { "ms": 100, "layers": [{ "n": "base", "px": ["1212", "2121", "1212", "2121"] }] }
  ],
  "meta": { "createdAt": "2026-08-11T00:00:00.000Z", "updatedAt": "2026-08-11T00:00:00.000Z" }
}
```

Decoded `px`: `Uint8Array [1,2,1,2, 2,1,2,1, 1,2,1,2, 2,1,2,1]`
Pixel at `(2, 1)`: `px[1 * 4 + 2]` = `px[6]` = `2` → `#ffffff`.

---

## 11. Test requirements

In `lib/artwork-core/__tests__/codec.test.ts`:

- `indexToChar` / `charToIndex` are inverses across 0–35; `charToIndex` returns `-1` for `0`, `A`,
  `!`, `` (empty), and a multi-byte emoji.
- `indexToChar(36)` throws `RangeError`.
- `decodeRows` returns each of `row_count`, `row_width`, `bad_char` for crafted inputs.
- `parseDoc` returns each of the eight error codes in §4 for crafted inputs.
- `parseDoc` never throws — fuzz it with 1000 random JSON values and assert no exception escapes.
- Round-trip properties (1) and (2) from §8, over every fixture and over 200 generated documents.
- `cloneDoc` produces a document whose `px` arrays are not reference-equal to the original's.
- Mutating a clone's `px` does not affect the original.
