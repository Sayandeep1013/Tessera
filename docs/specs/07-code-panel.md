# 07 — Code Panel

**Owns:** `components/code-panel/**`
**Depends on:** [01 — Document Format](./01-document-format.md), [03 — artwork-core](./03-artwork-core.md)
**Phase:** 3

The split view that makes "code underneath" literal. Newt has this — measured as the `</>` button in
its top bar — and it is the second-strongest demo moment after the AI diff.

---

## 1. Behaviour

Right half of the canvas area, `min-width: 380px`, resizable 320–800px by dragging the divider.
Toggled by `</>` in the top bar and by `⌘/`. Width persists in `localStorage`.

Content is `serializeDoc(doc)` — the exact bytes `Export → JSON` produces. **There is no separate
"display format".** That equality is the whole point and is asserted in a test.

Editor: CodeMirror 6 with `json()` language support, a custom theme wired to the design tokens
([02 §3](./02-design-system.md)), line numbers, no code folding, no autocomplete, no bracket
auto-closing (all three fight hand-editing a pixel grid).

---

## 2. Bidirectional sync

The hard part. Two update paths into one value, each of which must not retrigger the other.

```
canvas edit ──commit──► doc ──serializeDoc──► [debounce 100ms] ──► panel text
panel edit  ──────────► text ──[debounce 300ms]──► parseDoc ──ok──► commit(replace_doc)
                                                          └──err──► inline marker, doc untouched
```

### Loop guard

An `origin` flag on every update, **not** value comparison:

```ts
type SyncOrigin = 'canvas' | 'panel' | 'init'
const lastOrigin = useRef<SyncOrigin>('init')
```

- Writing the panel from the document sets `lastOrigin = 'canvas'`; the panel's `onChange` sees that
  and returns without parsing.
- A user keystroke sets `lastOrigin = 'panel'`; the document subscription sees that and skips
  rewriting the panel.

**Value comparison is not sufficient.** `serializeDoc` is canonical, so a user typing whitespace the
serializer would remove produces text that differs from the document's canonical form yet represents
the same document — a comparison-based guard would fight the user's cursor on every keystroke.

### Debounce rationale

| Direction | Delay | Why |
|---|---|---|
| Canvas → panel | 100ms | Fast enough to feel live during a stroke; coalesces a 400-pixel drag into a few serializations. |
| Panel → canvas | 300ms | Long enough that a half-typed row (`"..112"` mid-edit) does not flash a parse error on every keystroke. |

A stroke in progress does **not** update the panel — only the committed command does. Live-updating
mid-stroke would serialize 60×/second for no benefit.

---

## 3. Errors

`parseDoc` returns `DocError { code, message, path }` ([03 §2](./03-artwork-core.md)). The panel maps
`path` to a document position and shows a CodeMirror diagnostic there.

```ts
function pathToRange(text: string, path: string): { from: number; to: number } | null
```

`path` forms and their targets:

| Path | Marker placed on |
|---|---|
| `frames.0.layers.0.px[3]` | The whole row-3 string |
| `frames.0.layers.0.px[3][7]` | The single offending character |
| `palette.0.c` | That value |
| `w` / `h` / `v` | That key's value |
| absent | The first line, as a panel-level banner |

Resolution walks the JSON with a position-tracking parser (CodeMirror's syntax tree, not a regex).
When a path cannot be resolved the diagnostic degrades to a banner rather than being dropped —
**a parse error is never silent.**

**While the text is invalid the canvas keeps rendering the last valid document.** Nothing is applied,
nothing is lost, and the autosave of the *document* continues (the invalid text is not persisted).

The panel shows a status line at its foot: `Valid` in `--fg-muted`, or the error message in
`--diff-remove` with a `Go to error` action.

---

## 4. Click-to-locate

Both directions, because this is what makes the connection feel real rather than claimed.

**Panel → canvas:** placing the caret inside a `px` row's string maps to a document pixel and draws a
1px `--accent` outline on that cell. Requires mapping (row index, character offset) → `(x, y)`, which
is direct given the character-per-pixel encoding.

**Canvas → panel:** hovering a pixel highlights the corresponding character (background
`--accent-soft`). Painting flashes it for 200ms. The panel scrolls the row into view only on click,
never on hover — hover-scrolling is disorienting.

Both are suppressed while the text is invalid.

---

## 5. Undo integration

A panel edit commits **one** `replace_doc` command carrying whole before/after documents
([03 §5](./03-artwork-core.md)), labelled `"Edit code"`. One `⌘Z` reverses an arbitrary code edit.

Consecutive panel edits within 2 seconds **coalesce** into a single command — otherwise typing one
row produces a dozen undo steps. Coalescing replaces the top of the history stack when its `type` is
`replace_doc`, its label matches, and its timestamp is within the window.

---

## 6. Performance

`serializeDoc` at 100ms debounce on a 256×256 document is ~3ms ([03 §10](./03-artwork-core.md)) —
acceptable. If it becomes a problem, **increase the debounce; do not make serialization incremental.**
An incremental serializer would be a second source of truth for the text, which is exactly what this
design avoids.

CodeMirror is loaded with `next/dynamic` and `ssr: false`, so the ~200KB it costs is not in the
initial bundle. A user who never opens the panel never downloads it.

---

## 7. Mobile

Below 640px the panel is a full-screen sheet from the bottom, not a split. It covers the canvas, so
click-to-locate is disabled in that mode. `Done` dismisses it and applies any pending valid edit.

---

## 8. Test requirements

- Panel text is byte-identical to `Export → JSON` for every fixture
- Paint a pixel → the corresponding character changes, and only that character
- Edit a character → the canvas pixel changes after the debounce
- **No feedback loop:** a canvas edit followed by a panel render does not retrigger a parse; asserted
  with a spy on `parseDoc` call count
- Typing whitespace that the serializer would normalize does not move the caret or rewrite the buffer
- Each `DocError` code produces a marker; `path` with a character index marks exactly one character
- An invalid buffer leaves the document unchanged and the canvas rendering the last valid state
- Ten keystrokes within 2s produce one undo step; two edits 3s apart produce two
- `pathToRange` returns `null` for an unresolvable path and the UI degrades to a banner
