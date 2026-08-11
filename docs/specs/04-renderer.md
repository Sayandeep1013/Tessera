# 04 — Renderer

**Owns:** `lib/renderer/**`
**Depends on:** [01 — Document Format](./01-document-format.md), [03 — artwork-core](./03-artwork-core.md), [02 — Design System](./02-design-system.md) (tokens)

---

## 1. Architecture: one full-viewport canvas

**Decision: a single `<canvas>` fills the entire area below the top bar, and the artwork is drawn
into it under a viewport transform.** The canvas element is *not* sized to the artwork.

This is what Newt does — measured: `canvas` at `x0 y48 1440×852`, i.e. full width and all remaining
height, with a `2880×1704` backing store at DPR 2. It is worth adopting because:

- **Pan and zoom are a transform, not a layout change.** No reflow, no scroll containers, no
  translating a DOM node and fighting subpixel positioning.
- **The grid, checkerboard, canvas border, selection, brush cursor, and diff overlay all live in the
  same coordinate space** as the artwork. With an artwork-sized canvas each of those needs its own
  overlay element and its own transform, kept in sync.
- **Hit-testing is one inverse transform**, not a DOM traversal.
- Zooming to 45× on a 32×32 artwork would otherwise mean a 1440px-wide element inside a scroller,
  which browsers handle badly at extreme scales.

The cost is that the renderer owns everything visual inside the canvas region. That is the intended
trade.

### Coordinate spaces

| Space | Unit | Origin |
|---|---|---|
| **Document** | pixel (artwork cell) | top-left of the artwork |
| **Canvas CSS** | CSS px | top-left of the canvas element |
| **Device** | device px | top-left of the backing store |

```ts
type Viewport = {
  scale: number      // device-independent zoom; integer ≥ 1 (see 05 §5)
  offsetX: number    // CSS px from canvas left edge to artwork pixel (0,0)
  offsetY: number
}

// document → canvas CSS
cssX = offsetX + docX * scale
cssY = offsetY + docY * scale

// canvas CSS → document (floor, so a partial cell still resolves)
docX = Math.floor((cssX - offsetX) / scale)
docY = Math.floor((cssY - offsetY) / scale)
```

Device space is handled once, at setup, and never appears in drawing code:

```ts
const dpr = Math.min(window.devicePixelRatio || 1, 2)   // cap at 2 — see §6
canvas.width  = Math.round(cssWidth  * dpr)
canvas.height = Math.round(cssHeight * dpr)
canvas.style.width  = `${cssWidth}px`
canvas.style.height = `${cssHeight}px`
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
ctx.imageSmoothingEnabled = false
```

After `setTransform`, all drawing is in CSS pixels. **Never multiply by `dpr` in drawing code.**

---

## 2. Purity

```ts
function renderDoc(ctx: CanvasRenderingContext2D, doc: Doc, frame: number, vp: Viewport, opts?: RenderOptions): void
function renderDiffOverlay(ctx: CanvasRenderingContext2D, d: PixelDiff, vp: Viewport, theme: ThemeColors): void
function renderBrushCursor(ctx: CanvasRenderingContext2D, cursor: BrushCursor, vp: Viewport, theme: ThemeColors): void
function renderThumbnail(doc: Doc, frame: number, maxPx: number): ImageData
```

Every function is a pure function of its arguments onto pixels on the passed context.

**The renderer must not:** read a store, read `window` or `document`, make a network call, touch
IndexedDB, know about the AI, mutate the document, or read CSS custom properties itself.

Theme colours are **passed in** as a resolved `ThemeColors` object, not read from
`getComputedStyle` inside the render loop. Reading computed style per frame is both slow and
untestable; resolving once on theme change is neither.

```ts
type ThemeColors = {
  canvasBg: string; grid: string; gridMajor: string
  checkerA: string; checkerB: string; canvasEdge: string
  diffAdd: string; diffChange: string; diffRemove: string
  accent: string
}
```

Consequence: `renderDoc` runs unchanged in Node against a `pngjs`-backed 2D context shim, which is
what makes golden-image testing possible without a browser.

---

## 3. Pipeline

`renderDoc` draws in this exact order. The order is normative — a reviewer should be able to check it.

1. **Clear** the full canvas region to `--bg`.
2. **Artwork backdrop** — fill the artwork rect with `--canvas-bg`, or the checkerboard if
   `opts.showChecker` (default `true`).
3. **Layers**, bottom to top, skipping `hidden`. For each non-transparent pixel, `fillRect` at the
   transformed position.
4. **Grid** — only when `scale >= GRID_MIN_SCALE` (8). Minor lines every 1 document pixel in
   `--grid`; major lines every 8 in `--grid-major`.
5. **Artwork border** — 1px `--canvas-edge` around the artwork rect, drawn on the *outside* so it
   never covers a pixel.
6. **Overlays**, if any: selection marching ants, diff overlay, brush cursor.

### Drawing pixels

```ts
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = px[y * w + x]
    if (i === 0) continue                       // transparent — leave the backdrop
    ctx.fillStyle = paletteCss[i]!              // precomputed, see below
    ctx.fillRect(
      Math.round(vp.offsetX + x * vp.scale),
      Math.round(vp.offsetY + y * vp.scale),
      vp.scale,
      vp.scale,
    )
  }
}
```

- **`Math.round` on position, raw `scale` on size.** Rounding both would accumulate gaps; rounding
  neither produces seams from subpixel edges. Because `scale` is an integer and offsets are rounded,
  cells tile exactly.
- **`paletteCss` is precomputed** once per render: `doc.palette.map(e => e.c)`. Building a colour
  string inside the inner loop is the single easiest way to make this slow.
- Alpha in `#rrggbbaa` is handled by the canvas natively; no manual compositing.

### Run-merging

Consecutive horizontal pixels of the same index are merged into one `fillRect`:

```ts
let runStart = x, runIndex = i
// extend while px[y*w + x+1] === runIndex
ctx.fillRect(..., runLength * scale, scale)
```

On typical pixel art this cuts `fillRect` calls by 3–5×. It is the only optimisation the renderer
performs by default, and it is behaviour-neutral — a test asserts merged and unmerged output are
byte-identical.

### Grid

```ts
const GRID_MIN_SCALE = 8     // below this, grid lines would dominate the artwork
const GRID_MAJOR_EVERY = 8
```

Lines are drawn at `Math.round(offset + n * scale) + 0.5` with `lineWidth = 1` — the half-pixel
offset is what makes a 1px line crisp rather than a 2px blur.

The grid is drawn **above** the artwork (as Newt does — the measured screenshot shows grid lines
crossing the canvas surface) and is never exported.

---

## 4. Checkerboard

Indicates transparency. Cell size is **fixed in CSS pixels** (8px), not in document pixels — it must
not zoom with the artwork, or it becomes a distracting moiré at high zoom.

Clipped to the artwork rect. Colours `--checker-a` / `--checker-b`.

Disabled via `opts.showChecker = false` for export and thumbnail rendering, where a transparent
background must stay genuinely transparent.

---

## 5. Diff overlay

Drawn above the preview document during an AI proposal. **Colour plus pattern**, so the diff is
readable without colour vision ([02 §7](./02-design-system.md)).

| Bucket | Colour | Pattern |
|---|---|---|
| `added` | `--diff-add` | Dots, 2px, 4px pitch |
| `changed` | `--diff-change` | Diagonal hatch, 45°, 3px pitch |
| `removed` | `--diff-remove` | Cross-hatch, 3px pitch |

Implementation: build three `CanvasPattern`s once per theme via `createPattern` on small offscreen
canvases, cache them keyed by theme, then for each diff cell `fillRect` with `globalAlpha = 0.6`
followed by the pattern fill.

Patterns are in **screen space**, deliberately. A pattern that scaled with zoom would be invisible at
1× and enormous at 45×.

`renderDiffOverlay` takes the `PixelDiff` directly, not two documents — the diff is computed once when
the proposal arrives, not per frame.

---

## 6. DPR and performance

- **DPR is capped at 2.** A 3× device on a 1440px viewport would allocate a 4320px-wide backing store
  for artwork whose largest legal size is 256 pixels. There is no visual gain — the artwork is
  hard-edged rectangles.
- **Redraw is full-canvas.** At ≤ 256×256 with run-merging this is comfortably inside frame budget.
  `renderDoc` accepts an optional `opts.dirtyRect` in document space and clips to it; **the dirty-rect
  path is implemented but not used by default.** Wire it up only if a profile shows a real problem.
- Render is driven by `requestAnimationFrame`, coalescing multiple state changes in a frame into one
  draw. Never render synchronously from a pointer event.
- The context is created once with `{ alpha: false }` — the canvas always paints its own background,
  and opaque contexts composite faster.

### Budget

| Scenario | Budget |
|---|---|
| 32×32 @ 45× zoom, full redraw | < 2ms |
| 256×256 @ 4× zoom, full redraw | < 8ms |
| Pointer-move to painted pixel | < 16ms end to end |
| Diff overlay, 2000 cells | < 4ms |

---

## 7. Thumbnail

```ts
function renderThumbnail(doc: Doc, frame: number, maxPx: number): ImageData
```

Nearest-neighbour scale to fit `maxPx` on the long edge, at an **integer** scale where possible
(falling back to `Math.floor` and letterboxing rather than producing a blurred fractional scale).
Transparent stays transparent — no checkerboard.

Used for: the starter-sprite picker, the frame timeline, and share OG images. Runs in Node for the
last of these, so it must not touch the DOM — it builds an `ImageData`-shaped object directly rather
than going through a canvas element.

---

## 8. Golden-image testing

The renderer's real test surface. Unit tests cannot catch an off-by-one in the viewport transform or
a wrong palette lookup; a golden image catches both immediately.

**Mechanism:** a minimal 2D-context shim over a `pngjs` buffer implementing exactly the surface the
renderer uses — `fillRect`, `fillStyle`, `setTransform`, `save`/`restore`, `beginPath`/`moveTo`/
`lineTo`/`stroke`, `clip`, `globalAlpha`, `createPattern`. Anything the renderer needs that the shim
lacks is a signal the renderer is doing something it should not.

**Cases** — every fixture from [03 §8](./03-artwork-core.md), each rendered at:

- `scale: 1`, `scale: 8`, `scale: 32`
- grid on and off
- checkerboard on and off
- light and dark `ThemeColors`
- one case per diff bucket, plus one with all three

Goldens live in `lib/renderer/__tests__/golden/`. Comparison is byte-exact.

**Regenerating goldens:** `pnpm test:golden --update`. A changed golden must be reviewed visually in
the diff, never accepted blind — that is the one way this test suite can be defeated.

### Additional assertions

- `renderDoc` called twice with identical arguments produces identical output (determinism).
- Run-merged output is byte-identical to a naive per-pixel render.
- `imageSmoothingEnabled` is `false` on every context the renderer receives — asserted by the shim,
  which throws if a draw happens while it is `true`.
- Rendering an all-transparent document with `showChecker: false` produces a fully transparent image.
- A `hidden` layer contributes nothing.
- Layer order: `multilayer.tessera.json` renders top layer over bottom.
