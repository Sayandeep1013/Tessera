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

**`animated: true` (unit G, §13.4):** one `@keyframes` rule drives the whole class's `box-shadow`
across every frame, cut hard at each frame boundary rather than left to interpolate between two
unrelated pictures. Ignores `frame`. The pixel-count thresholds above now count every frame's pixels
*together* — §13.4 says why.

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

**`animated: true` (unit G, §13.4):** every frame as its own `<g>`, `visibility` cycled by a
`@keyframes` rule per frame on a shared timeline sized to the sum of every frame's `ms`. Ignores
`frame` — there is no one frame to pick once the whole document is animating.

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

Built by unit G. §13.1 is the one place this section understated its own contract.

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

Built by unit G — §13.2 and §13.3 are its corrections and decisions.

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

**Revisited in phase 2, and the answer is: stays an approximation, deliberately.** Opacity and blend
modes (`14 §12`) do make the two rules disagree the moment a layer uses either — `flattenFrame` still
returns the topmost non-transparent index, which is no longer the same colour the renderer actually
draws. `14 §12.4` is the decision and its reasoning in full; the summary here is that building a real
compositor for export would mean synthesizing RGB values that have no palette entry, for a format
whose entire premise (§1) is that the exported grid *is* the document's own palette. Merge and flatten
(`14 §12.5`) are the escape hatch: baking a blend into the palette is exactly what they are for, and
once that has happened `flattenFrame` is exact again because there is only one layer to be topmost of.
Nothing in this file changed to make that true — it was already correct for the case that matters.

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

---

## 13. What unit G built and corrected

Five decisions, made rather than routed around (rule 10). `10-animation.md §0.5` is the record of
*why* this was its own unit rather than riding along inside F; this is what actually got built.

### 13.1 A sprite sheet is genuinely two files, and §1's contract carries exactly one

§8 was written before anyone had to answer "then how does one `ExportOk` return a PNG *and* its
JSON atlas." It cannot — `ExportOk` is `{ filename, mime, data, warning? }`, one of each. Rather than
bend that shape for the one format that needs two (a `data: [png, json]` union would be a lie for
every other exporter, which really do have one file), `lib/exporters/spritesheet.ts` exports two
plain functions, `exportSpriteSheet` (the PNG) and `exportSpriteSheetAtlas` (the JSON), sharing one
pure `sheetLayout(doc, opts)` so the PNG's grid and the atlas's coordinates cannot drift apart. The
popover fires both from the one "Sprite sheet" row — two real downloads, not a zip, because a zip
would need a third dependency for a two-file archive nobody asked to unpack.

### 13.2 The GIF encoder needed a bug the decoder could never have out-argued

The LZW code-width growth has a real, well-known trap: an encoder that grows its code size the
instant its dictionary crosses a power-of-two threshold desyncs from any decoder built the standard
way, because a decoder cannot form dictionary entry *N* until it has read the code *after* the one
that made entry *N* possible — it needs that next code's first character to complete the string. So
a decoder's own dictionary is structurally one entry behind the encoder's at every point, and a width
change the encoder applies "immediately" lands one code early from the decoder's side. The fix is a
two-step delay on the encoder (`growPending` → `growArmed` → applied, in `lib/exporters/gif/lzw.ts`),
not a decoder change — found by writing a real decoder (`decodeLzw`, kept only for
`__tests__/lzw.test.ts`'s round-trip proof, since this sandbox has no independent GIF library to
check against) and watching it disagree with genuinely random pixel data at exactly the third code of
the stream. Solid runs and small palettes never exercised the bug, which is exactly how it would have
shipped unnoticed on `face`-sized artwork and only shown up on a busier document, in someone else's
GIF viewer, with no way to blame this repo's own tests.

**Disposal method is 2 (restore to background), on every frame.** Each of this document's frames is
a complete, independent picture — never a delta against the one before it, unlike most hand-authored
GIFs — so without disposing, a transparent cell in frame 2 would show frame 1's opaque pixel bleeding
through underneath it. Restoring to a background that is itself the transparent index (0) before each
frame draws is what makes "this frame's transparent cells are transparent" true frame over frame, not
just on frame 0.

**Alpha is dropped to a colour table, the same simplification as `flattenFrame` everywhere else
(§12.1/§12.4).** GIF only has binary transparency — one colour is the transparent index, everything
else is opaque — so an `#rrggbbaa` palette entry's alpha byte is discarded; only its RGB reaches the
colour table. This is one more instance of the accepted gap merge/flatten exist to close, not a new
one.

### 13.3 The Worker protocol, and the bundle question measured the same way PNG's was

`lib/exporters/gif-worker.ts` speaks three message types (`progress`, `done`, `error`) to
`lib/editor/gif-export.ts`'s `runGifExport`, which is the only DOM-touching part of any of this —
`lib/exporters/gif.ts` itself stays pure and synchronous, taking an optional `onProgress` callback
so the worker can turn each frame's completion into a `postMessage` without the encoder knowing a
worker exists. `self` inside the worker file is narrowed to exactly the two members it uses
(`onmessage`/`postMessage`) rather than fought into matching `DedicatedWorkerGlobalScope`, because
this project's one `tsconfig.json` types `self` as `Window`, which demands a `targetOrigin` a
worker's global scope does not have — see the comment in `gif-worker.ts` for the full reasoning.

**Verified with a real network trace, not a grep, on the same reasoning §12.4 already used for
PNG.** `import { runGifExport } from '@/lib/editor/gif-export'` sits as a static, module-scope import
in `ExportPopover.tsx` — no dynamic `import()` needed — because `new Worker(new URL('./gif-worker.ts',
import.meta.url))` is itself the thing that makes Turbopack split `gif-worker.ts` and everything it
pulls in (`gif.ts`, `gif/lzw.ts`) into their own chunk, loaded only when a `Worker` is actually
constructed. Grepping the built chunks for `GIF89a` still finds the string reachable from the initial
page's own script graph — exactly the false trail §12.4 already hit once with `pngjs`'s internals —
because a chunk-loader's *manifest* legitimately mentions a chunk it has not fetched yet. A cold-load
Playwright trace settles it the only way that counts: zero requests for the worker chunk or
`gif.ts`'s code before Export is even opened, and exactly four — the worker bootstrap plus its three
dependency chunks — the instant GIF is actually clicked.

### 13.4 The animated hooks — a hard cut, not an interpolation, between frames

Both React's `visibility` cycling and CSS's `box-shadow` cycling share `lib/exporters/timeline.ts`:
`frameWindows` turns each frame's `ms` into a `[start, end)` percentage of the total, and
`hardCutEpsilon` picks a gap — 0.01% normally, shrinking to a tenth of a frame's own share on a
document with many very short frames — used to place two keyframes an instant apart, so the browser
holds one frame's value for its whole window and then jumps, rather than blending two frames the
document never drew as one. `steps()` was the first instinct and turned out to be the wrong tool: it
only subdivides a single transition *segment*, not a whole multi-keyframe timeline, so it cannot
express "hold, then jump" across more than two keyframes on its own — the paired-keyframe gap does,
without it.

**React gets one `@keyframes` rule per frame** (one `<g>` each, `visibility` toggled) because a
`<g>`'s visibility is independent of its siblings'. **CSS gets exactly one `@keyframes` rule** driving
the whole class's `box-shadow`, because a single element has only one `box-shadow` to animate — every
frame's full shadow list is a value in that one rule, switched at the same hard-cut boundaries.

**The CSS pixel-count thresholds (§4) now sum every frame, not the worst one, once `animated` is
true.** All of them ship in the one stylesheet at once — only one is ever visible, but the browser
still has to parse every `@keyframes` value up front — so the number that actually determines whether
a tab hangs is the total across frames, not any single frame's own count. A three-frame document
where each frame is comfortably under the cap alone can still refuse as an animated export; the error
message says why.

### 13.5 GIF and sprite sheet are absent on a single frame, never disabled

The same rule `17-file-menu.md §7` already established for Open recent and Paste image before they
existed: a control that looks live and is not is worse than no control. `visibleFormats(frameCount)`
in `lib/editor/export-menu.ts` drops the `gif` and `spritesheet` rows — and the popover drops the
React/CSS Animated toggles — the moment a document has only one frame, rather than rendering them
disabled with no explanation. `tools/probe-export.ts` proves the gating both ways: absent on `face`
as loaded, present the instant a second frame exists.
