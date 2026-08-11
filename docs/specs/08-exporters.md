# 08 — Exporters

**Owns:** `lib/exporters/**`
**Depends on:** [01 — Document Format](./01-document-format.md), [03 — artwork-core](./03-artwork-core.md)
**Phase:** 3 (PNG/SVG/CSS/React/JSON) · 5 (sprite sheet, GIF)

---

## 1. Contract

```ts
type Exporter<O> = (doc: Doc, opts: O) => ExportResult
type ExportResult = { filename: string; mime: string; data: string | Uint8Array }
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
canvas at the same scale. This is the test that proves the whole pipeline is consistent.

---

## 6. JSON

`serializeDoc(doc)` verbatim ([01 §8](./01-document-format.md)). Filename `{name||'artwork'}.tessera.json`.

The same bytes the code panel displays. A test asserts all three — export, panel, and autosave payload
— are byte-identical.

---

## 7. Sprite sheet (Phase 5)

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

## 8. GIF (Phase 5)

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

## 9. Export UI

Popover, not a modal ([02 §7](./02-design-system.md)).

```
┌─────────────────────────────┐
│ EXPORT                      │
│  PNG        1×  2×  4×  8×  │
│  SVG                        │
│  CSS                        │
│  React      TS ▾            │
│  JSON                       │
│  ─────────────────────────  │
│  GIF                        │  (Phase 5, hidden until then)
│  Sprite sheet               │
└─────────────────────────────┘
```

Each row triggers a download immediately at its default options; the chevron opens per-format
options. Nothing here is a multi-step wizard.

Failures (the CSS pixel cap, a GIF worker error) surface inline in the popover, never as a toast.

---

## 10. Test requirements

- Every exporter × every fixture → golden output, byte-compared
- SVG: `optimize: true` and `false` render identically (rasterised comparison), and optimised output
  has strictly fewer rects for `face`
- SVG: output parses as valid XML; `shape-rendering="crispEdges"` present
- CSS: shadow count equals the non-transparent pixel count; over-cap returns an error not a truncation
- React: output is valid TS and JS; `componentName` sanitisation over hostile inputs (`"1 bad-name"`,
  `""`, `"class"`); Playwright pixel-identity against the canvas
- JSON: byte-identical to code panel and autosave payload
- PNG: alpha preserved; `1×1` fixture; all-transparent fixture is fully transparent
- GIF: frame count and delays match the document; palette maps 1:1 with no quantisation
- **No exporter imports another** — asserted by a module-graph walk
