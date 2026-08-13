# 08 — Exporters

**Owns:** `lib/exporters/**`
**Depends on:** [01 — Document Format](./01-document-format.md), [03 — artwork-core](./03-artwork-core.md)
**Phase:** 3 (PNG/SVG/CSS/React/JSON) · 5 (sprite sheet, GIF)

---

## 1. Contract

```ts
type Exporter<O> = (doc: Doc, opts: O) => ExportResult
type ExportOk = { filename: string; mime: string; data: string | Uint8Array; warning?: string }
type ExportResult = Result<ExportOk, string>   // reuses artwork-core's Result — see §12.3
```

Rules, all test-enforced:

1. **Pure.** A function of `(doc, opts)` only. No store, no DOM, no network.
2. **No exporter imports another exporter.** The React exporter reuses SVG *geometry* by importing a
   shared helper from `lib/exporters/geometry.ts` — not by calling `exportSvg`. A dependency chain
   means one exporter's bug fix silently changes another's output.
3. **Smoothing never on.** Every canvas an exporter creates sets `imageSmoothingEnabled = false`.
4. **Grid and checkerboard are never exported.** They are renderer chrome. Transparent pixels export
   as genuinely transparent.
5. Every exporter has a golden test over every fixture.

Shared geometry:

```ts
// lib/exporters/geometry.ts
type Run = { x: number; y: number; len: number; i: number }
function horizontalRuns(px: Uint8Array, w: number, h: number): Run[]   // skips index 0
```

---

## 2. PNG

```ts
type PngOptions = { scale?: 1 | 2 | 4 | 8 | 16; frame?: number }
```

Offscreen canvas at `w*scale × h*scale`, one `fillRect` per run, alpha preserved.
Filename `{name||'artwork'}@{scale}x.png`.

In Node (share OG images), the same code path runs against the `pngjs` shim used by the renderer's
golden tests ([04 §8](./04-renderer.md)) — there is one PNG encoder, not two.

---

## 3. SVG

```ts
type SvgOptions = { frame?: number; pixelSize?: number; optimize?: boolean }  // optimize default true
```

One `<rect>` per **horizontal run**, not per pixel. On typical artwork this cuts output 3–5×.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"
     width="16" height="16" shape-rendering="crispEdges">
  <rect x="5" y="1" width="6" height="1" fill="#2d1b00"/>
  <rect x="3" y="2" width="2" height="1" fill="#2d1b00"/>
</svg>
```

- `shape-rendering="crispEdges"` is **mandatory** — without it renderers antialias the rect edges and
  the export looks blurry at scale.
- `viewBox` is document units; `width`/`height` are `w*pixelSize` (default 1).
- Alpha from `#rrggbbaa` becomes `fill-opacity`, because not every SVG consumer accepts 8-digit hex.
- Runs are emitted grouped by colour, in palette-index order, so the output is stable and diffable.
- `optimize: false` emits one rect per pixel — used only to prove the optimiser is behaviour-neutral.

---

## 4. CSS

```ts
type CssOptions = { frame?: number; className?: string; pixelSize?: number }
```

**`box-shadow` technique.** This is the established approach; CSS gradients for arbitrary pixel art
are unreadable and fragile, and the original PRD's preference for them was wrong.

```css
.pixel-art {
  --p: 1px;
  --c1: #2d1b00;
  --c2: #f4c430;
  width: var(--p); height: var(--p);
  transform: scale(16); transform-origin: top left;
  box-shadow:
    calc(var(--p) * 5) calc(var(--p) * 1) 0 0 var(--c1),
    calc(var(--p) * 6) calc(var(--p) * 1) 0 0 var(--c1);
}
```

Palette entries become custom properties, so recolouring the export is a one-line change — which is
the "code underneath" thesis restated in CSS.

One shadow **per pixel**, not per run (`box-shadow` has no width). A warning is emitted above 4,096
non-transparent pixels; above 16,384 the exporter returns an error recommending SVG instead. Both
thresholds are named constants.

---

## 5. React

```ts
type ReactOptions = { frame?: number; componentName?: string; typescript?: boolean; animated?: boolean }
```

Self-contained component wrapping the SVG geometry. No imports beyond `react`, no props required.

```tsx
export function PixelArt({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges">
      <rect x={5} y={1} width={6} height={1} fill="#2d1b00" />
    </svg>
  )
}
```

- `componentName` is sanitised to a valid PascalCase identifier; a name that cannot be sanitised falls
  back to `PixelArt`.
- `typescript: false` drops the type annotation and emits `.jsx`.
- `animated: true` (Phase 5) emits all frames as `<g>` elements with a CSS keyframe cycling
  `visibility`, timed from each frame's `ms`.
- Output is formatted deterministically — two-space indent, one `<rect>` per line — so goldens are
  stable.

**Acceptance:** the exported component, rendered in a Playwright test, is pixel-identical to the
canvas at the same scale. This is the test that proves the whole pipeline is consistent — built for
real in unit D, §12.7, not approximated.

---

## 6. JSON

`serializeDoc(doc)` verbatim ([01 §8](./01-document-format.md)). Filename `{name||'artwork'}.tessera.json`.

The same bytes the code panel displays. A test asserts all three — export, panel, and autosave payload
— are byte-identical.

---

## 7. ASCII

Added by unit D (§12.2) — the ledger's handover for this unit named it and the original spec never
carried a section for it.

```ts
type AsciiOptions = { frame?: number }
```

The `px` rows already **are** ASCII — one character per pixel, `.` transparent, `1`–`9`/`a`–`z`
palette indices. The exporter composites the frame's layers to what is actually visible
(`flattenFrame`, §12.1) and reuses `encodeRows` ([03 §3](./03-artwork-core.md)) — there is no
second encoding of a pixel to a character anywhere in the codebase. Filename
`{name||'artwork'}.txt`, rows joined with `\n`, a trailing newline.

No options beyond `frame`: there is nothing to optimise, group, or scale about a grid of characters.

---

## 8. Sprite sheet (Phase 5)

```ts
type SheetOptions = { columns?: number; padding?: number; spacing?: number }
```

Horizontal strip by default (`columns = frames.length`). Emits a PNG plus a JSON atlas:

```json
{ "w": 16, "h": 16, "frames": [ { "x": 0, "y": 0, "w": 16, "h": 16, "ms": 100 } ] }
```

`padding` insets the sheet edge; `spacing` separates frames. Both default to 0, because non-zero
values break naive consumers and should be opt-in.

---

## 9. GIF (Phase 5)

Encoded in a **Web Worker** so the editor never blocks.

- Palette maps directly to the GIF colour table — the document's ≤36 colours fit trivially inside
  GIF's 256, so **no quantisation is needed**. This is a real benefit of the 36-colour cap.
- Index 0 becomes the GIF transparent index.
- Frame delays come from `frame.ms`, converted to centiseconds and clamped to ≥ 2cs (20ms) — GIF
  cannot express faster, and browsers silently retime anything lower.
- Loops forever (Netscape extension, count 0).
- Progress posts back to the main thread; the export popover shows a determinate bar.
- A document is structured-cloneable ([03 §10](./03-artwork-core.md)), so it crosses to the worker
  without manual serialization.

---

## 10. Export UI

Popover, not a modal ([02 §7](./02-design-system.md)). Lives off the code panel's header, not the
top bar — §12.5 says why and where the trigger sits at 320px.

```
┌─────────────────────────────┐
│ EXPORT                      │
│  PNG        1×  2×  4×  8×  │
│  SVG                        │
│  CSS                        │
│  React      TS ▾            │
│  JSON                       │
│  ASCII                      │  (added by unit D, §7 — same row group as JSON: both are text)
│  ─────────────────────────  │
│  GIF                        │  (Phase 5, hidden until then)
│  Sprite sheet               │
└─────────────────────────────┘
```

Each row triggers a download immediately at its default options; the chevron opens per-format
options. Nothing here is a multi-step wizard.

Failures (the CSS pixel cap, a GIF worker error) surface inline in the popover, never as a toast.

---

## 11. Test requirements

- Every exporter × every fixture → golden output, byte-compared
- SVG: `optimize: true` and `false` render identically (rasterised comparison), and optimised output
  has strictly fewer rects for `face`
- SVG: output parses as valid XML; `shape-rendering="crispEdges"` present
- CSS: shadow count equals the non-transparent pixel count; over-cap returns an error not a truncation
- React: output is valid TS and JS; `componentName` sanitisation over hostile inputs (`"1 bad-name"`,
  `""`, `"class"`); Playwright pixel-identity against the canvas
- JSON: byte-identical to code panel and autosave payload
- ASCII: round-trips through `decodeRows`/`charToIndex` back to the same flattened pixel grid
- PNG: alpha preserved; `1×1` fixture; all-transparent fixture is fully transparent
- GIF: frame count and delays match the document; palette maps 1:1 with no quantisation
- **No exporter imports another** — asserted by a module-graph walk

---

## 12. What unit D corrected

Four corrections, made rather than routed around (rule 10 — `CLAUDE.md` rule 10, `HANDOFF.md §2`).

### 12.1 A composite primitive the contract never named

Every exporter but JSON needs the pixel actually **visible** at each cell, and the format has carried
layers since [14](./14-layers.md) — this spec predates that and never says how an exporter is
supposed to flatten a stack. `lib/exporters/geometry.ts` gains `flattenFrame(doc, frame): Uint8Array`
alongside `horizontalRuns`, built from `compositeAt` ([14 §3](./14-layers.md)) — the same
topmost-non-transparent-wins rule the eyedropper already samples by, not a re-derivation of it. It is
a real simplification, not a full alpha composite: layers phase 1 has no opacity field, so the only
place a true blend could differ is an `#rrggbbaa` layer painted over another layer, and reusing the
editor's own existing answer to "what colour is here" beats inventing a second one for export alone.
Layers phase 2 (`14 §6.4`) is the unit to revisit this in, if opacity ever makes the two rules
actually disagree.

### 12.2 ASCII was named in the unit's handover and never in this file

`docs/UNITS.md`'s prompt for this unit lists "SVG, CSS, React, ASCII, JSON and PNG" — ASCII was never
given a section here. Added as §7, immediately after JSON: both are the document as text, and it
costs one call to `encodeRows` on the flattened frame.

### 12.3 The contract had no way to fail

§4 requires the CSS exporter to *return an error* above 16,384 painted pixels, and §9 requires
failures to surface inline — but §1's original contract, `{ filename, mime, data }`, has no error
shape and no field for §4's separate 4,096-pixel warning either. Rather than smuggling an error string
into `data` (which a caller would then have to sniff, and which would make a failed CSS export
indistinguishable from a one-line stylesheet), `ExportResult` now reuses `artwork-core`'s own
`Result<T, E>` ([03 §2](./03-artwork-core.md)) and `ExportOk` carries an optional `warning`. Every
exporter in the codebase already speaks this shape; a sixth one inventing its own was the thing to
avoid, not the thing to add.

### 12.4 The PNG encoder decision, and why it is not `<canvas>`

§2's line about Node and the pngjs shim implies one encoder shared by both environments, but no such
shim exists yet — `04-renderer.md §8`'s golden-image tests were never built, so there was nothing to
reuse. The obvious browser-side alternative, an offscreen `<canvas>` + `toBlob` (what the pre-D "Export
PNG" File-menu row actually did), fails rule 1 outright: it is DOM, not a pure function, and it cannot
run in the Node test process at all, so "golden test each" would be unmet for PNG specifically.

`pngjs` is already a dependency and ships a self-contained browserified build at `pngjs/browser` —
verified to run unmodified in both a plain Node process and a browser bundle, with its own bundled
zlib and Buffer shims. `lib/exporters/png.ts` imports `pngjs/browser` and nothing else, so there
really is one PNG encoder, not two, exactly as this section originally asked — the correction is
narrower than it first reads: which encoder, not whether there is one.

**Kept out of the initial bundle with a plain `import()`, not `next/dynamic`.** `ExportPopover.tsx`'s
`runPng` and the File menu's PNG row in `Chrome.tsx` both call `import('@/lib/exporters/png')` inside
the click handler rather than importing it at module scope — the same reasoning `07-code-panel.md
§9.1` used to keep CodeMirror out. **Verified with a real browser, not by reading the build output**:
`index.html`'s static `<script>` list is not conclusive on its own for a single-route app — it lists
several large chunks whose contents only *look* PNG-related from a loose grep (`deflateSync` and
`IHDR` both turn up as substrings of unrelated bundled code). A Playwright network trace of a cold
load settles it: zero requests for the chunk carrying pngjs's real internals (`bitpacker`,
`paethPredictor`) before Export is ever opened, and exactly one — fired the moment PNG is actually
clicked.

### 12.5 Where the Export trigger lives, and the bug found there

`docs/UNITS.md`'s handover for this unit already named the answer — the code panel's own header, not
the top bar, because a new top-bar control has no room left at 320px (`07-code-panel.md §9.7`). It is
a small icon button beside Close, opening the popover in §10's mockup.

**The first wiring anchored the popover to the trigger's own wrapper**, a 28px box well inside the
header — Close sits to its right. `right: 0` on the popover then meant "flush with the *trigger's*
right edge," not the header's, and a 260px-wide popover anchored there ran 7px off the left edge of a
320px sheet. `check-responsive.ts` cannot see this class of bug at all — it never opens a popover
(`HANDOFF §5`) — and `probe-export.ts` caught it on its first run, measured, not assumed. Fixed by
making `<header>` the positioning ancestor instead of the trigger's own small wrapper.

### 12.6 `--p` instead of `transform: scale`

§4's illustrative snippet holds `--p` at a hairline 1px and magnifies the whole element with
`transform: scale(16)`. The shipped exporter sets `--p` directly to the requested pixel size (default
8) and drops the transform entirely — every `box-shadow` offset is `calc(var(--p) * n)` regardless of
which approach is used, so the two produce the same picture, and setting `--p` once is one fewer moving
part than a hairline plus a separate magnification factor with no obvious default of its own.

### 12.7 React's acceptance test, built for real

§5 names this unit's real test: the exported component, rendered, is pixel-identical to the canvas.
Built without instantiating a JSX runtime — a mounted JSX `<rect x={5} y={1} fill="#…" />` and a
hand-built DOM `<rect x="5" y="1" fill="#…" />` are the same node once the browser has them; React's
runtime is not what makes two rects agree on colour, the numbers in them are. `probe-export.ts` decodes
the exported `.tsx` text's `<rect>` props back into real, injected SVG, rasterises it with the
browser's own SVG renderer, and reads it back pixel by pixel against the app's live canvas at its own
viewport transform (`window.__tessera.viewport()`). Only painted cells are compared: a transparent
cell is the exporter's business by design (§1.4), not the canvas's, which paints a flat backdrop
there instead — comparing the two would be asserting two deliberately different things are equal.
