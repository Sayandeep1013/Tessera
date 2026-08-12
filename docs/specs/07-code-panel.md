# 07 — Code Panel

**Owns:** `components/CodePanel.tsx`, `lib/editor/code-panel.ts`, `lib/editor/json-locate.ts`
**Depends on:** [01 — Document Format](./01-document-format.md), [03 — artwork-core](./03-artwork-core.md)
**Phase:** 3

> **Read §9 first.** This spec was written in Phase 3 and built as unit **C**,
> after layers, settings, the agent, the File menu and paste image had all
> happened to the code around it. Four of its decisions did not survive contact
> and are corrected in §9 rather than routed around (rule 10) — most of all its
> choice of editor. The behaviour it asks for is all built; several of the
> mechanisms it names are not the ones that build it.
>
> §9 also carries four things this spec does not mention at all and which turned
> out to be load-bearing: re-centring the view when the split opens, who owns ⌘Z
> inside a text field, which shortcuts the `isTyping` guard applies to, and what
> had to leave the header to make room for the button.

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

---

## 9. Built — unit C, 12 Aug 2026

Everything §1–§8 asks the panel to *do* is built. Four of the mechanisms it
names to do it with are not the ones that did, and one thing it does not mention
turned out to be load-bearing. Rule 10: corrected here rather than routed
around.

### 9.1 No CodeMirror — §1 and §3 corrected

§1 specifies CodeMirror 6 with `json()` support, a custom theme wired to the
tokens, and `next/dynamic` to keep its ~200KB out of the initial bundle. The
panel is a `<textarea>` with an overlay instead, and no new dependency at all.

Four reasons, in order of weight:

1. **§1 already asks for CodeMirror with most of CodeMirror turned off** — "no
   code folding, no autocomplete, no bracket auto-closing (all three fight
   hand-editing a pixel grid)". What is left that a textarea does not give is
   line numbers, JSON colouring, and a diagnostic at a position. That is a thin
   remainder for a dependency whose own cost §6 puts at 200KB.
2. **§3's "CodeMirror's syntax tree, not a regex" is a false choice.** The third
   option is a position-tracking JSON scanner — `lib/editor/json-locate.ts`,
   about 200 lines, pure, no DOM — and it is the one that fits this repo, which
   has written its own codec, its own tooltip, its own dither and its own
   quantiser rather than importing them. It also makes `pathToRange` testable
   under `npm test`, where a CodeMirror-based one would need a browser and would
   therefore be probe-only.
3. **A textarea is the accessible, IME-correct, caret-correct editor the
   platform already ships.** Selection, undo-within-the-field, mobile keyboards
   and screen readers all work without being reimplemented or themed.
4. **JSON colouring is close to worthless on this document.** The file is
   `{ v, id, name, w, h, palette, frames }` and then a wall of pixel rows.
   Colouring braces and quotes tells the reader nothing they did not know; the
   rows are the content, and they are one character per pixel.

**What replaces the syntax highlighting is better aimed.** An overlay `<pre>`
sits behind the transparent textarea holding the *same string*, and marks the
ranges that mean something right now: the parse error, and the character under
the canvas cursor. It renders as three text nodes and two marks — not one span
per character — so a 256×256 document costs the same as a 16×16 one.

**The honest cost:** there is no syntax colouring, and there never will be
without reversing this. If that is ever wanted, the overlay is where it goes,
and the price is a span per token on a 70KB string.

### 9.2 The status line replaces the inline diagnostic — §3 amended

§3 wants a CodeMirror diagnostic at the resolved position plus a status line at
the foot. Without CodeMirror the position marker is the overlay's error range,
and the message is the status line's job alone. Same two pieces of information,
same `Go to error` action, which selects the range in the textarea and scrolls
it into view.

§3's degradation rule is unchanged and is the part that matters: **when a path
cannot be resolved the message still appears**, without a range. A parse error
is never silent.

One addition §3 does not have. The status line also reports **where the caret
is, as a pixel**: `row 12 · char 7 → pixel (7, 12)`. That is the sentence that
makes "code underneath" literal, and it costs one lookup against the row ranges
that are already computed for the overlay.

### 9.3 Opening the panel must re-centre the view — not in the spec at all

§1 makes the panel a split, so opening it takes 460px off the canvas. The
viewport's `offsetX` is measured from the canvas element's left edge, so
narrowing the element leaves the artwork where it was and the panel arrives on
top of the right-hand side of it. On a 16×16 document at a wide zoom that is the
artwork half behind the panel.

Re-fitting is the wrong fix — it throws away the pan and zoom of somebody
mid-detail-work, which is the cost `refit.ts` names in its own header and which
`17 §7.3` already decided against for Duplicate. The right fix is to keep the
scale and move the offset by **half the width the canvas lost**, so what was in
the middle stays in the middle. `recentreViewport` in `viewport.ts`.

That function also fixes something older and unrelated: resizing the browser
window had the same defect, and the artwork drifted toward the top-left every
time. The `ResizeObserver` in `Canvas.tsx` now recentres on every size change,
so the panel is not a special case.

### 9.4 Coalescing needs the store's help — §5 clarified

§5 says consecutive panel edits within 2 seconds coalesce, "replacing the top of
the history stack when its type is `replace_doc`, its label matches, and its
timestamp is within the window". Nothing could do that: `commit()` only ever
pushed.

`commit(cmd, coalesce)` now takes a second argument. When it is true and the top
of `past` is a `replace_doc` with the same label, the top is **replaced** by the
new command carrying the *original* `before` — so ten keystrokes collapse to one
step that undoes to where the typing started, not to the ninth keystroke.

Rule 4 is intact: `commit` is still the only thing that writes the document, and
this changes what happens to history, not who writes — the same distinction
`agentDepth` already draws. **The 2-second window is not in the store.** The
panel decides whether to coalesce and the store does as it is told, so the
policy stays pure and tested in node (`shouldCoalesce`) instead of being
observable only through a browser.

### 9.5 The mobile sheet — §7 built, and it is the repo's first

§7's full-screen sheet below 640px is built, and this is the first sheet in the
repo. `14-layers.md §6.4` deferred the mobile layer panel on the grounds that "a
sheet is a component this repo does not have"; it does now, and that unit's
blocker is gone.

Click-to-locate is disabled in sheet mode as §7 requires, because the canvas is
not on screen to locate anything on.

### 9.6 Two keys the spec does not mention, both found by running it

Neither of these is in §1–§8. Both were found by the probe failing, and both are
about the panel being a text field inside an app that also has keys.

**⌘Z inside the panel is the DOCUMENT's undo.** A textarea brings its own
history and wins by default, so ⌘Z reverted the field, which then parsed and
committed — "undo" pushed a *new* command instead of reversing one, and §5's
"one ⌘Z reverses an arbitrary code edit" was quietly false wherever the caret
happened to be. There is one history in this app and it belongs to the
document; the panel is a view of it. The pending parse is cancelled first, or a
keystroke from 200ms ago lands after the undo and re-applies what was undone.

**⌘/ is deliberately NOT behind `isTyping`**, unlike ⌘N, ⌘O and ⌘V. That guard
exists because those keys mean something *inside a text field* — new, open,
paste — and stealing them there breaks the field (`17 §3`). ⌘/ means nothing in
a field, and guarding it made the panel's own textarea the one place the
shortcut that closes the panel did not work. The rule, now that there are four
of these: **guard a key the field itself needs; do not guard a chord it has no
use for.**

### 9.7 The header lost its wordmark, and the Code button is why

`check-responsive.ts` failed at 320×568 the moment the Code button existed: the
header ran 38px off the right edge. The word "Tessera" beside the mark is ~70px
and is decoration; the mark alone still opens the File menu and still carries
the caret that says it is one. So `showWordmark` is false on a phone.

It is the same rule that keeps the dead controls out of a narrow header, applied
one step further: **a live control does not lose its place to a word.**

### 9.8 What C deliberately did not build

- **JSON syntax colouring.** §9.1. The overlay is where it would go.
- **Editing anything but the whole document.** The panel is `serializeDoc(doc)`
  and nothing else — §1's equality with `Download .tessera.json` is asserted by
  a test, and a "just the pixels" view would be a second representation, which
  is rule 3.
- **A `Format` button.** The text is already canonical every time the document
  writes it; a button that re-canonicalises the user's in-progress typing is a
  button that moves their caret.
- **Undo of a code edit while the buffer is invalid.** ⌘Z works, on the
  document, exactly as everywhere else — but the panel is showing text that does
  not parse, so it is rewritten from the restored document and the invalid text
  is lost. It was never applied and never saved, so nothing that existed is
  gone; it is still the one place where something a user typed can disappear
  without a message. Recorded in `HANDOFF §11`.
