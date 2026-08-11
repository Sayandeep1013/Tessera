# newt.sh — pixel-exact visual specification

Reverse-engineered from the live public page at `https://newt.sh/` (signed-out,
default document) with headless Chromium. **Every number below was read off the
page** — computed styles, `getBoundingClientRect()`, and per-pixel `getImageData()`
sampling of the `<canvas>`. Where something is genuinely not inspectable it says
so explicitly instead of guessing.

- Captured: 2026-08-11, deployment `dpl_FrbjG3ZZ7T2JY4B6D6gJnCz4jLU6`
- Document title: `Newt — pixel art, code underneath`
- Theme captured: **light** (`<html class="… light">`). Dark tokens are published
  in the same stylesheet and are listed in §3.
- Stack (for context only — the spec is framework-agnostic): Next.js + Tailwind CSS v4.

## Raw data files in this folder

| File | Contents |
| --- | --- |
| `dom-tree.json` | Full nested DOM + computed-style tree, 1440×900 |
| `dom-tree-390.json` | Full nested DOM + computed-style tree, 390×844 (different component tree) |
| `icons.json` / `icons-390.json` | Every `<svg>`: `outerHTML`, shapes, host button |
| `icons.md` | Human-readable icon inventory with inline SVG |
| `canvas.json`, `canvas-probe-1440-dsf2.json`, `canvas-probe-1440-dsf3.json`, `canvas-probe-390.json` | Per-pixel canvas analysis (scanlines, exact histograms, corner ASCII maps) |
| `canvas-geometry-breakpoints.json` | Artwork rect + grid pitch + zoom at all 4 breakpoints |
| `stylesheets.json` | All 620 CSS rules, custom properties, `@font-face` |
| `interaction.json` | Hover diffs + focus-visible probe |
| `responsive.json` | Geometry of every visible element at all 4 breakpoints |
| `buttons.json`, `network.json` | Button map, network log |
| `shots/` | All screenshots (see §9) |

---

## 1. Page skeleton

```
html.light  (font-family: Geist; -webkit-font-smoothing: antialiased; height:100%)
└ body      (h-full; overflow:hidden; overscroll-behavior:none; background: var(--surface))
  └ div     (display:flex; flex-direction:column; height:100dvh; overflow:hidden;
             background: var(--surface); color: var(--fg))
    ├ header  flex-none, height 48px          ← top bar
    ├ main    flex:1 1 0; position:relative; overflow:hidden
    │  ├ div.relative.h-full.w-full > canvas  ← full-bleed canvas
    │  ├ div  absolute left-3 top-1/2         ← tool rail
    │  ├ div  absolute inset-y-3 right-3 z-30 ← right drawer slot (0px wide when closed)
    │  ├ div  absolute bottom-3 left-3        ← AI composer
    │  ├ div  absolute bottom-3 right-3 z-20  ← zoom control
    │  └ div  absolute inset-x-0 bottom-0     ← bottom-centre toast slot (empty)
    └ (mobile only) options strip + tool bar as extra flex rows
```

There is **no page scrolling** at any breakpoint (`document.scrollWidth/Height`
equals the viewport). `overscroll-behavior: none` on `<body>`.

---

## 2. Layout diagrams (real pixel values)

### 2.1 — 1440 × 900 (reference)

```
x=0                                                                        x=1440
┌───────────────────────────────────────────────────────────────────────────────┐ y=0
│ HEADER  1440×48 · bg #FFFFFF @80% + backdrop-blur(8px) · z-index 40            │
│ border-bottom 1px #0000001A · padding 0 12px · display:flex · gap 6px          │
│                                                                               │
│  ┌ left group @ (12,6) 563×36, gap 4 ─────────────────────────────┐           │
│  │ [🐸 Newt ⌄]  (⚙)  (●)  [ − 1px + │ ▣ ]  [Square|Round]  [■ Solid ⌄]        │
│  │ 12,8 101×32 117,6  159,6   203,6 149×36   360,10 120×28  489,10 87×28      │
│  │              36×36  36×36                                                  │
│  └────────────────────────────────────────────────────────────────┘           │
│                        ┌ centred, absolutely positioned ┐                     │
│                        │   input "untitled" 192×28 @ (624,10)                 │
│                        └──────────────────────────────┘                       │
│                    ┌ right group, ml-auto @ (1118,6) 310×36, gap 4 ─────────┐ │
│                    │ [⇧ Share ⌄] (</>) (▤) (◈) │ [Sign in]                  │ │
│                    │ 1118,6      1230  1270 1310 1352  1359,6 69×36         │ │
│                    │ 108×36      36×36 36×36 36×36 1×20                     │ │
│                    └────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────────────────────┤ y=48
│ MAIN 1440×852 (canvas occupies the whole rect, transparent except the artwork) │
│                                                                               │
│ ┌ TOOL RAIL              ┌───────────── ARTWORK (drawn INSIDE canvas) ──────┐ │
│ │ (12,278) 56×392        │ outer rect 722×722 @ page (359,107)              │ │
│ │ radius 16, bg #FFF/90  │ 1px hairline border + 720×720 white content      │ │
│ │ 8 × 44×44 @ x=18       │ 16×16 logical pixels · 45 CSS px per cell        │ │
│ │  y = 284 332 380 428   │ grid lines 1px #EDEDED every 45px                │ │
│ │      476 524 572 620   │ content (360,108) → (1080,828)                   │ │
│ │ (pitch 48 = 44 + 4)    └──────────────────────────────────────────────────┘ │
│ └──────────────────────┘                                                      │
│                                                                               │
│ ┌ COMPOSER (12,836) 320×52 ──────┐                    ┌ ZOOM (1304,848)     ┐ │
│ │ radius 16 · bg #FFF · shadow-lg│                    │ 124×40 · pill       │ │
│ │ (+) [Ask Newt… "make it …"] (↑)│                    │ (−) 45× (+)         │ │
│ └────────────────────────────────┘                    └─────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘ y=900
```

### 2.2 — 1280 × 800

Identical structure; only the free space shrinks.

```
header 1280×48. Left group unchanged at (12,6) 563×36  ← never reflows
filename input      (544,10) 192×28   (= 1280/2 − 96)
right group ml-auto (958,6)  310×36 → Share 958 · </> 1070 · ▤ 1110 · ◈ 1150
                                       divider 1192 · Sign in (1199,6) 69×36
main 1280×752 @ y=48
tool rail (12,228) 56×392        ← vertically centred on main: 48 + (752−392)/2 = 228
                                   (first tool button at y=234 = card top + 6px padding)
artwork outer 626×626 @ (327,105); content 624×624 @ (328,106); cell 39px; zoom 39×
composer (12,736) 320×52
zoom     (1144,748) 124×40
```

### 2.3 — 768 × 1024  ⚠ broken on the live site

Still the **desktop** component tree (the mobile tree only switches in below 768).
The header content does not fit and visibly collides — see §10 Gotcha G1.

```
header 768×48
  left group   (12,6) 563×36 — unchanged, runs to x=575
  filename     (288,10) 192×28 — absolutely centred, so it spans 288→480 and
               OVERLAPS the "Square | Round" segmented control at 360→480
  right group  (581,6) 295×36 — runs to x=876, i.e. 108px past the viewport:
               Share (581) · </> (693) · ▤ (733) · ◈ (773, half cut)
               divider (815) · "Sign in" (822) — entirely off-screen
main 768×976 @ y=48
tool rail (12,340) 56×392        ← 48 + (976−392)/2 = 340; first button at y=346
artwork outer 530×530 @ (119,265); content 528×528 @ (120,266); cell 33px; zoom 33×
composer (12,960) 320×52
zoom     (632,972) 124×40
```

### 2.4 — 390 × 844 (mobile — a different component tree)

```
x=0                                            x=390
┌───────────────────────────────────────────────┐ y=0
│ HEADER 390×48 · bg #FFFFFF (SOLID, no blur)   │
│ z-index 30 · border-bottom 1px #0000001A      │
│ padding 0 8px · gap 2px                       │
│ [🐸⌄56×40] (⚙40) [untitled 64×28] (↶)(↷)(◈)(▤)(⋯)
│   8,4        66,4    108,10        174 216 258 300 342  (all 40×40 @ y=4)
├───────────────────────────────────────────────┤ y=48
│ MAIN 390×687 — canvas                         │
│                                               │
│      ┌ artwork 338×338 @ (26,223) ┐           │
│      │ content 336×336 @ (27,224) │           │
│      │ 16×16 px · 21 CSS px/cell  │           │
│      └────────────────────────────┘           │
│                                               │
├───────────────────────────────────────────────┤ y=735
│ OPTIONS STRIP 390×48 · transparent (surface)  │  ← flex row, NOT absolute
│ overflow-x:auto · content 396px wide (scrolls)│
│ [ − 1px + │ ▣ ] [Square|Round] [■ Solid ⌄]    │
│  12,741 149×36  169,745 120×28  297,745 87×28 │
├───────────────────────────────────────────────┤ y=783
│ TOOL BAR 390×61 · bg #FFF · border-top 1px    │
│ padding 8px · content row 374×44 @ (8,792)    │
│ [■]  [▸][🖌][◪][🪣][□][⬚][💉][▤ →scrolls]     │
│ 8,792  58 106 154 202 250 298 346 (394 off)   │
│ 44×44  (44×44 each, gap 4, h-scroll, no bar)  │
└───────────────────────────────────────────────┘ y=844
```

**No AI composer, no zoom control, no Share button, no "Sign in", no "Newt"
wordmark at 390.** Undo / Redo / "More (⋯)" appear that the desktop bar does not have.

---

## 3. Colour system

### 3.1 CSS custom properties

Ten semantic tokens, defined twice. `:root, .dark { … }` is the *default* (dark),
`.light { … }` overrides. The captured page runs with `class="light"` on `<html>`.

| Token | **light** (captured) | dark |
| --- | --- | --- |
| `--surface` | `#f4f4f5` | `#17171b` |
| `--panel`   | `#ffffff` | `#202024` |
| `--panel2`  | `#f1f1f4` | `#2c2c32` |
| `--fg`      | `#18181b` | `#f4f4f5` |
| `--muted`   | `#71717a` | `#a1a1aa` |
| `--faint`   | `#a1a1aa` | `#71717a` |
| `--line`    | `#0000001a` (rgba 0,0,0,.102) | `#ffffff21` |
| `--hover`   | `#0000000d` (rgba 0,0,0,.051) | `#ffffff12` |
| `--accent`  | `#18181b` | `#f4f4f5` |
| `--onaccent`| `#ffffff` | `#18181b` |

Also on `:root` (Tailwind `@theme`, mostly unused by this screen):
`--color-red-400 #ff6568`, `--color-red-500 #fb2c36`, `--color-red-600 #e40014`,
`--color-amber-400 #fcbb00`, `--color-amber-500 #f99c00`, `--color-amber-700 #b75000`,
`--color-emerald-500 #00bb7f`, `--color-emerald-600 #009767`,
`--color-zinc-100 #f4f4f5`, `--color-zinc-950 #09090b`, `--color-black #000`,
`--color-white #fff`, `--spacing .25rem`,
radii `--radius-sm .25rem / -md .375 / -lg .5 / -xl .75 / -2xl 1rem / -3xl 1.5rem`,
text sizes `--text-xs .75rem / -sm .875 / -base 1 / -lg 1.125 / -xl 1.25 / -2xl 1.5rem`,
`--tracking-tight -.025em`, `--tracking-wide .025em`,
`--default-transition-duration .15s`,
`--default-transition-timing-function cubic-bezier(.4,0,.2,1)`,
`--default-font-family var(--font-geist-sans)`,
`--default-mono-font-family var(--font-geist-mono)`.
Font families come from CSS-module classes on `<html>`:
`--font-geist-sans: "Geist","Geist Fallback"`, `--font-geist-mono: "Geist Mono","Geist Mono Fallback"`.

`meta[name=theme-color]` is `#f4f4f5`. `<html>` computed `color-scheme: normal`.

### 3.2 Every distinct colour actually rendered

| Hex | rgb()/rgba() | Token | Used by |
| --- | --- | --- | --- |
| `#F4F4F5` | `rgb(244,244,245)` | `--surface` | `<body>` and app shell background; the "canvas area" colour (the canvas itself is transparent — this shows through) |
| `#FFFFFF` | `rgb(255,255,255)` | `--panel` / `--onaccent` | Composer card; mobile header + tool bar; segmented **active** pill; pixel-perfect toggle **on**; active tool-button *icon* colour; brush ± hover background |
| `#FFFFFF` @ 80% | `oklab(.999994 … / .8)` | `--panel/80` | Desktop header background (with `backdrop-filter: blur(8px)`) |
| `#FFFFFF` @ 90% | `oklab(.999994 … / .9)` | `--panel/90` | Tool-rail card, zoom-control pill (both with `backdrop-filter: blur(8px)`) |
| `#F1F1F4` | `rgb(241,241,244)` | `--panel2` | Brush-size pill track, Square/Round track, Dither button, disabled Send button |
| `#18181B` | `rgb(24,24,27)` | `--fg` / `--accent` | Primary text; dither swatch fill; **active tool-rail button background**; hover text colour on muted controls |
| `#71717A` | `rgb(113,113,122)` | `--muted` | Inactive tool icons, "Round", "Share", "Sign in", zoom label, all secondary icon buttons |
| `#A1A1AA` | `rgb(161,161,170)` | `--faint` | Chevrons (`text-faint`), composer placeholder, disabled Send icon, mobile Undo/Redo |
| `rgba(0,0,0,0.10)` | `#0000001A` | `--line` | 1px header bottom border, 1px hairline dividers (`w-px`), every `ring-1 ring-line`, the outer ring layer of `shadow-*` composites |
| `rgba(0,0,0,0.05)` | `#0000000D` | `--hover` | Hover fill for icon buttons, tool-rail buttons, zoom buttons, logo button, filename input |
| `#1A1C2C` | `rgb(26,28,44)` | — (state) | The currently-selected paint colour swatch. This is DB32 / SWEETIE-16 `#1a1c2c`; it is **document state, not a design token** |
| `#EDEDED` | `rgb(237,237,237)` | — (canvas) | Canvas grid lines |
| `rgba(0,0,0,0.180)` | `#0000002E` | — (canvas) | Artwork border, **top + left edges** |
| `rgba(0,0,0,0.235)` | `#0000003C` | — (canvas) | Artwork border, **bottom + right edges** |
| `#191E43` `#79D265` `#9DEE72` `#33993A` `#E56666` | — | — | The five colours of the **hover** state of the Newt logo (pixel-art frog). The resting logo is monochrome `currentColor` = `--fg`. |

Nothing else is painted. The full-canvas per-pixel histogram contains exactly five
values: `#00000000`, `#ffffff`, `#ededed`, `#0000002e`, `#0000003c`.

---

## 4. Typography

### 4.1 Font stack

```css
font-family: Geist, "Geist Fallback";   /* var(--font-geist-sans) */
```

- `Geist` — variable, `font-weight: 100 900`, `font-display: swap`, 5 subsets.
- `Geist Fallback` — `local("Arial")` with `ascent-override: 95.94%`,
  `descent-override: 28.16%`, `line-gap-override: 0%`, `size-adjust: 104.76%`.
- `Geist Mono` / `Geist Mono Fallback` are declared and the latin subset is
  preloaded, but **no visible element uses them** on this screen.
- Root font size `16px`. `-webkit-font-smoothing: antialiased` (class `antialiased`).

Font files actually fetched (only two — the rest are unicode-range-gated):

```
https://newt.sh/_next/static/media/caa3a2e1cccd8315-s.p.09~u27dqhyhd6.woff2   (Geist, latin)
https://newt.sh/_next/static/media/797e433ab948586e-s.p.08e28id.o-okb.woff2   (Geist Mono, latin)
```
Both `<link rel=preload as=font type=font/woff2>`. Stylesheet:
`https://newt.sh/_next/static/chunks/07bxp6vx.1px6.css`. All assets are same-origin;
no third-party hosts are contacted.

### 4.2 Every text element at 1440×900

| Text | Box (x,y,w,h) | size | weight | line-height | letter-spacing | colour |
| --- | --- | --- | --- | --- | --- | --- |
| `Newt` | 46,12 39×24 | 16px | 600 | 24px | **−0.4px** (`tracking-tight`) | `#18181B` |
| `1px` | 241,14 32×20 | 14px | 500 | 20px | normal | `#18181B` |
| `untitled` (input value) | 624,10 192×28 | 14px | 500 | 20px | normal | `#18181B` |
| `Square` | 362,12 60×24 | 12px | 500 | 16px | normal | `#18181B` |
| `Round` | 422,12 56×24 | 12px | 500 | 16px | normal | `#71717A` |
| `Solid` | 521,16 29×16 | 12px | 500 | 16px | normal | `#18181B` |
| `Share` | 1156,14 38×20 | 14px | 500 | 20px | normal | `#71717A` |
| `Sign in` | 1359,6 69×36 | 14px | 500 | 20px | normal | `#71717A` |
| `45×` (U+00D7) | 1342,860 48×16 | 12px | 500 | 16px | normal | `#71717A` · `font-variant-numeric: tabular-nums` |
| `Ask Newt… “make it angrier”` (placeholder) | 56,844 232×36 | 14px | 400 | 20px | normal | `#A1A1AA` |

The exact placeholder string is `Ask Newt… “make it angrier”` — U+2026 ellipsis and
U+201C/U+201D curly quotes. `1px` and `45×` both use `tabular-nums`.

---

## 5. Elevation & shape language

### 5.1 Distinct `box-shadow` values (computed, verbatim)

Tailwind emits a five-slot composite; the meaningful layers are listed.

| # | Effective shadow | Tailwind | Used by |
| --- | --- | --- | --- |
| S0 | *(all-transparent placeholder)* | `md:shadow-none` | brush-size pill, Square/Round track, Dither button — **at ≥768px only** |
| S1 | `inset 0 0 0 1px rgba(0,0,0,.1)` | `ring-1 ring-inset ring-line` | colour swatch `<span>` (24×24) |
| S2 | `0 0 0 1px rgba(0,0,0,.1)` | `ring-1 ring-line` | dither swatch (16×16); mobile colour button |
| S3 | `0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)` | `shadow-sm` | pixel-perfect toggle (on), "Square" active pill |
| S4 | `0 0 0 1px rgba(0,0,0,.1), 0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)` | `ring-1 ring-line shadow-sm` | **tool rail card**, **zoom control** |
| S5 | `0 0 0 1px rgba(0,0,0,.1), 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1)` | `ring-1 ring-line shadow-lg` | **AI composer card** |
| S6 | `0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)` | `shadow-md` | brush-size pill, Square/Round track, Dither button — **below 768px only** |

The header uses **no** shadow — it is separated by a 1px `--line` bottom border plus
`backdrop-filter: blur(8px)`.

### 5.2 Distinct `border-radius` values

| Radius | Tailwind | Used by |
| --- | --- | --- |
| `9999px` (reported as `3.3554432e7px`) | `rounded-full` | Every icon button (28/32/36/40), Share, Sign in, brush-size pill, Square/Round track + both pills, Dither button, colour swatch, zoom pill + its three buttons, composer + / Send buttons |
| `16px` | `rounded-2xl` | Tool-rail card, AI composer card |
| `12px` | `rounded-xl` | All 8 tool-rail buttons (44×44); mobile colour button |
| `8px` | `rounded-lg` | Logo/File button, filename input; mobile colour-swatch inner span |
| `4px` | `rounded` | Dither swatch (16×16) |
| `0` | — | canvas, layout wrappers |

### 5.3 Motion

- `transition-colors` = `color, background-color, border-color, outline-color,
  text-decoration-color, fill, stroke, --tw-gradient-* 0.15s cubic-bezier(.4,0,.2,1)`
- `transition` (colour swatch button) = the full property list incl. `opacity`,
  `box-shadow`, `transform`, `filter`, `backdrop-filter`, `display`, `overlay`.
- `transition-transform` on both chevrons (they rotate when their menu opens).
- No animations were running on the idle page.

---

## 6. Region tables (1440 × 900)

`R` = border-radius, `bg` = background-color. All coordinates are page-absolute CSS px.
`—` = transparent / none.

### 6.1 Top bar (`<header>`)

Container: `0,0 1440×48` · `display:flex; align-items:center; gap:6px; padding:0 12px`
· `bg #FFFFFF/80` · `backdrop-filter: blur(8px)` · `border-bottom: 1px solid rgba(0,0,0,.1)`
· `z-index: 40` · `position: relative`

| # | Element | x,y | w×h | bg | R | Font / icon | Colour | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `div.relative` wrapper | 12,8 | 101×32 | — | — | — | — | menu anchor |
| 1a | `button` File — new, recent, import | 12,8 | 101.13×32 | — | 8px | 16/600, −0.4px | `#18181B` | `padding 4px 6px 4px 4px; gap 6px`; `aria-haspopup=menu` |
| 1b | `span` logo box | 16,12 | 24×24 | — | — | two stacked 16-viewBox SVGs | — | `h-4 w-4 sm:h-6 sm:w-6` → 16px below 640, 24px above |
| 1c | `span` "Newt" | 46,12 | 39.13×24 | — | — | 16/600 | `#18181B` | `hidden sm:inline` |
| 1d | `svg` CaretDown | 91,16 | 16×16 | — | — | — | `#A1A1AA` | `transition-transform` |
| 2 | `button` Settings | 117,6 | 36×36 | — | pill | 20×20 icon | `#71717A` | hover `bg #0000000D` |
| 2z | menu anchor `div` | 117,48 | 0×0 | — | — | — | — | `absolute left-0 top-full z-50 mt-1.5` |
| 3 | `button` Color | 159,6 | 36×36 | — | pill | — | — | `margin-left 2px`; wrapper `div` at 157,6 38×36 |
| 3a | `span` swatch | 165,12 | 24×24 | `#1A1C2C` | pill | — | — | `inset 0 0 0 1px rgba(0,0,0,.1)` |
| 3z | menu anchor `div` | 157,48 | 0×0 | — | — | — | — | z-50, mt 6px |
| 4 | `div.ml-1` → `div.flex.gap-2` | 203,6 | 371.97×36 | — | — | — | — | gap 8px |
| 4a | brush-size pill | 203,6 | 149×36 | `#F1F1F4` | pill | 14px | `#18181B` | `padding 4px 6px; gap 4px`; `md:shadow-none` |
| 4a1 | `button` Smaller brush | 209,10 | 28×28 | — | pill | Minus 16×16 @215,16 | `#18181B` | hover `bg #FFFFFF` (**not** `--hover`) |
| 4a2 | `span` "1px" | 241,14 | 32×20 | — | — | 14/500 tabular | `#18181B` | `w-8 text-center` |
| 4a3 | `button` Bigger brush | 277,10 | 28×28 | — | pill | Plus 16×16 @283,16 | `#18181B` | hover `bg #FFFFFF` |
| 4a4 | `span` divider | 311,14 | 1×20 | `rgba(0,0,0,.1)` | — | — | — | `margin 0 2px` |
| 4a5 | `button` Pixel-perfect (switch, on) | 318,10 | 28×28 | `#FFFFFF` | pill | 16×16 @324,16 | `#18181B` | `shadow-sm`; `role=switch aria-checked=true` |
| 4b | segmented track | 360,10 | 120.44×28 | `#F1F1F4` | pill | — | — | `padding 2px` |
| 4b1 | `button` "Square" (active) | 362,12 | 60.23×24 | `#FFFFFF` | pill | 12/500 | `#18181B` | `padding 4px 10px`; `shadow-sm` |
| 4b2 | `button` "Round" | 422,12 | 56.20×24 | — | pill | 12/500 | `#71717A` | `hover:text-fg` only — no background change |
| 4c | `button` Dither: Solid | 489,10 | 86.53×28 | `#F1F1F4` | pill | 12/500 | `#18181B` | `padding 6px 8px 6px 10px; gap 6px`; hover `bg #0000000D` |
| 4c1 | `span` swatch | 499,16 | 16×16 | `#18181B` | 4px | — | — | `0 0 0 1px rgba(0,0,0,.1)` |
| 4c2 | `span` "Solid" | 521,16 | 28.53×16 | — | — | 12/500 | `#18181B` | |
| 4c3 | `svg` CaretDown | 555,18 | 12×12 | — | — | — | `#71717A` | |
| 5 | centring wrapper | 0,10 | 1440×28 | — | — | — | — | `absolute inset-x-0 flex justify-center; pointer-events:none` |
| 5a | `input` Filename | 624,10 | 192×28 | — | 8px | 14/500 centre | `#18181B` | `padding 4px 8px`; value `untitled`; hover & focus `bg #0000000D`; `focus:outline-none`; `pointer-events:auto`; `spellcheck=false` |
| 6 | right group | 1118,6 | 310.19×36 | — | — | — | — | `margin-left:auto; gap 4px` |
| 6a | `button` Share | 1118,6 | 108.31×36 | — | pill | 14/500 | `#71717A` | `padding 0 10px 0 12px; gap 6px`; hover `bg #0000000D` **and** `color → #18181B` |
| 6a1 | `svg` Export | 1130,14 | 20×20 | — | — | — | `#71717A` | |
| 6a2 | `span` "Share" | 1156,14 | 38.31×20 | — | — | 14/500 | `#71717A` | |
| 6a3 | `svg` CaretDown | 1200,16 | 16×16 | — | — | — | `#A1A1AA` | |
| 6b | `button` Code & Export | 1230,6 | 36×36 | — | pill | 20×20 @1238,14 | `#71717A` | |
| 6c | `button` Animation timeline | 1270,6 | 36×36 | — | pill | 20×20 @1278,14 | `#71717A` | `aria-pressed=false` |
| 6d | `button` Layers | 1310,6 | 36×36 | — | pill | 20×20 @1318,14 | `#71717A` | `aria-pressed=false` |
| 6e | `div` divider | 1352,14 | 1×20 | `rgba(0,0,0,.1)` | — | — | — | `margin 0 2px` |
| 6f | `a` "Sign in" → `/login` | 1359,6 | 68.88×36 | — | pill | 14/500 | `#71717A` | `padding 0 12px`; `cursor:pointer` (the only pointer cursor in the chrome — every `<button>` computes `cursor:default`) |

### 6.2 Tool rail

Outer: `12,278 56×392` · `position:absolute; left:12px; top:50%; transform:translateY(-50%)`
· `pointer-events:none` (relative to `<main>`, so the vertical centre is `48 + 852/2 = 474`).

Card: `12,278 56×392` · `display:flex; flex-direction:column; gap:4px; padding:6px`
· `border-radius:16px` · `bg #FFFFFF/90` · `backdrop-filter: blur(8px)` · shadow **S4**
· `pointer-events:auto`.

Each row is a bare `<div>` 44×44 wrapping one `<button>`.

| Slot | y | Button | title | `aria-pressed` | bg | icon colour |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 284 | 44×44 @ x18 | `Select / Move (V)` | false | — | `#71717A` |
| 2 | 332 | 44×44 | `Brush (B)` | **true** | **`#18181B`** | **`#FFFFFF`** |
| 3 | 380 | 44×44 | `Eraser (E)` | false | — | `#71717A` |
| 4 | 428 | 44×44 | `Fill (G)` | false | — | `#71717A` |
| 5 | 476 | 44×44 | `Shapes (U)` | false | — | `#71717A` (wrapper is `.relative` — sub-menu anchor) |
| 6 | 524 | 44×44 | `Select region (M)` | false | — | `#71717A` |
| 7 | 572 | 44×44 | `Eyedropper (I)` | false | — | `#71717A` |
| 8 | 620 | 44×44 | `Gradient (H)` | false | — | `#71717A` |

All buttons: `border-radius:12px`, `display:flex; align-items:center; justify-content:center`,
icon `24×24` centred at `(28, y+10)`. Inactive hover ⇒ `background-color: rgba(0,0,0,.05)`
(no colour change, no scale, no shadow). The **active** button has no hover rule at all —
hovering it produces zero computed-style change (measured).

### 6.3 AI composer

Outer: `12,836 320×52` · `absolute bottom:12px left:12px` · `pointer-events:none`.
Card: `12,836 320×52` · `display:flex; flex-direction:column` · `width:320px` (`w-80`)
· `padding:8px` · `border-radius:16px` · `bg #FFFFFF` · shadow **S5** · `pointer-events:auto`.
Row: `20,844 304×36` · `display:flex; align-items:center; gap:4px`.

| Element | x,y | w×h | bg | R | Font/icon | Colour | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `div.relative.flex-none` | 20,846 | 32×32 | — | — | — | — | menu anchor |
| `button` AI options | 20,846 | 32×32 | — | pill | Plus 20×20 @26,852 | `#71717A` | hover `bg #0000000D` **and** `color → #18181B` |
| `input` prompt | 56,844 | 232×36 | — | 0 | 14/400 | `#18181B` | `flex:1 1 0; min-width:0; padding 8px 4px; background:transparent; focus:outline-none`; placeholder `#A1A1AA` |
| `button` Send (**disabled**) | 292,846 | 32×32 | `#F1F1F4` | pill | ArrowUp 16×16 @300,854 | `#A1A1AA` | `flex-none`; `disabled` attribute present |

### 6.4 Zoom control

Outer: `1304,848 124×40` · `absolute bottom:12px right:12px` · `z-index:20` · `pointer-events:none`.
Pill: `1304,848 124×40` · `display:flex; align-items:center; gap:2px; padding:4px`
· `border-radius:9999px` · `bg #FFFFFF/90` · `backdrop-filter: blur(8px)` · shadow **S4**
· `color: #71717A`.

| Element | x,y | w×h | R | Icon / text | Notes |
| --- | --- | --- | --- | --- | --- |
| `button` Zoom out | 1308,852 | 32×32 | pill | Minus 16×16 @1316,860 | `title="Zoom out (⌘−)"`; hover `bg #0000000D` |
| `button` zoom level | 1342,860 | 48×16 | pill | `45×` 12/500 tabular | `min-width:48px; padding:0 8px`; `title="Fit to screen (⌘0 / ⇧1)"`; **only 16px tall**, so its hover pill is a thin 48×16 lozenge |
| `button` Zoom in | 1392,852 | 32×32 | pill | Plus 16×16 @1400,860 | `title="Zoom in (⌘+)"` |

### 6.5 Empty / invisible slots (present in the DOM, size 0 or empty)

| Element | Box | Purpose (inferred from classes) |
| --- | --- | --- |
| `div.absolute.inset-y-3.right-3.z-30.flex` | 1428,60 0×828 | Right drawer rail (Layers / Timeline panel mounts here) |
| `div.absolute.inset-x-0.bottom-0.flex.justify-center.px-3.pb-4` | 0,884 1440×16 | Bottom-centre toast / status slot |
| `div.absolute.left-0.top-full.z-50.mt-1.5` ×2 | 117,48 and 157,48 · 0×0 | Settings and Colour popover anchors |
| `input.hidden` | `display:none` | File import picker |
| `next-route-announcer` | 0,900 0×0 | Next.js a11y announcer |

---

## 7. Interaction states (hover-only probing — nothing was clicked)

| Target | Change on hover |
| --- | --- |
| Tool-rail button, **inactive** (Fill, 18,428) | `background-color: rgba(0,0,0,0) → rgba(0,0,0,0.05)`. **Nothing else** — no colour, transform, shadow or radius change. |
| Tool-rail button, **active** (Brush, 18,332) | **No change at all.** The active state (`bg-accent text-onaccent`) has no hover variant. |
| Top-bar Share button (1118,6) | `background-color → rgba(0,0,0,0.05)` **and** `color: #71717A → #18181B` (which also drives the child `<svg>` `fill`, since icons are `currentColor`). The `text-faint` chevron stays `#A1A1AA`. |
| Brush "Smaller/Bigger" buttons (209,10 / 277,10) | `background-color → #FFFFFF` (i.e. `hover:bg-panel`, **not** the `--hover` wash — these sit on a `--panel2` track so they lift to white). |
| Zoom −/+ (1308,852 / 1392,852) | `background-color → rgba(0,0,0,0.05)`. |
| Composer "AI options" (20,846) | `background-color → rgba(0,0,0,0.05)` **and** `color → #18181B`. |
| "Round" segmented pill | `hover:text-fg` only — text goes `#71717A → #18181B`, background unchanged. |
| Logo / File button, filename input | `hover:bg-hover` → `rgba(0,0,0,0.05)`. |
| Newt logo | Hover swaps the two stacked SVGs via opacity (`group-hover:opacity-0` / `group-hover:opacity-100`) — monochrome mark becomes a 5-colour pixel frog. Instant (opacity is not in `transition-colors`). |

**Focus-visible:** there is **no custom focus ring** on the header buttons.
Tabbing gives `outline: rgb(16,16,16) auto 1px; outline-offset: 0px; box-shadow: none`
— i.e. the Chromium default UA ring. (Tab 1 = logo/File button, Tab 2 = Settings.)
Utility classes for a designed ring **do** exist in the stylesheet but are not
applied to anything on this screen:

```css
.focus-visible\:ring-2:focus-visible   { box-shadow: 0 0 0 2px var(--tw-ring-color, currentcolor) … }
.focus-visible\:ring-accent:focus-visible       { --tw-ring-color: var(--accent) }
.focus-visible\:ring-offset-1/2:focus-visible   { --tw-ring-offset-width: 1px / 2px }
.focus-visible\:ring-offset-surface:focus-visible { --tw-ring-offset-color: var(--surface) }
.focus-visible\:outline-none:focus-visible      { outline-style: none }
```

Cursors: `<canvas>` is `crosshair`; both `<input>`s are `text`; the `Sign in` `<a>`
is `pointer`; **every `<button>` computes `cursor: default`** (no `cursor-pointer`
utility anywhere).

---

## 8. The canvas

### 8.1 Element

```html
<canvas class="h-full w-full touch-none select-none" width="2880" height="1704"></canvas>
```

| Property | 1440×900 @ DPR 2 | 1440×900 @ DPR 3 | 1280×800 | 768×1024 | 390×844 |
| --- | --- | --- | --- | --- | --- |
| CSS box (page) | 0,48 1440×852 | 0,48 1440×852 | 0,48 1280×752 | 0,48 768×976 | 0,48 390×687 |
| `width`/`height` attrs | 2880×1704 | 4320×2556 | 2560×1504 | 1536×1952 | 780×1374 |
| backing scale | ×2 | ×3 | ×2 | ×2 | ×2 |

The backing store is sized `cssSize × devicePixelRatio` and the 2D context carries
`ctx.getTransform() = {a:2, b:0, c:0, d:2, e:0, f:0}` at DPR 2 — i.e. the app calls
`ctx.scale(dpr, dpr)` once and then draws in CSS pixel units. `image-rendering`
computes to `auto` (the crispness comes from integer-aligned drawing, not from
`pixelated`). `cursor: crosshair`, `touch-action: none`. The canvas is `position: static`
inside `div.relative.h-full.w-full.overflow-hidden`; there is **exactly one** canvas.

### 8.2 What it renders — measured per-pixel

Reading `getImageData()` over the *entire* backing store yields exactly **five**
distinct RGBA values. That is the complete inventory of what the canvas paints:

| Colour | Share of canvas | Meaning |
| --- | --- | --- |
| `#00000000` (fully transparent) | 57.5114 % | Everything outside the artwork. **The canvas paints no background** — the `#F4F4F5` you see around the artwork is `--surface` from the app shell showing through. |
| `#FFFFFF` | 40.3965 % | Artwork background. Flat opaque white — **not** a checkerboard, not a transparency pattern, no vignette, no texture. |
| `#EDEDED` | 1.8571 % | Grid lines |
| `#0000002E` (`rgba(0,0,0,0.180)`) | 0.1177 % | Artwork border — top and left edges |
| `#0000003C` (`rgba(0,0,0,0.235)`) | 0.1174 % | Artwork border — bottom and right edges |

### 8.3 Artwork geometry

| Viewport | Zoom label | Cell (CSS px) | Outer rect (page px) | Content rect (page px) |
| --- | --- | --- | --- | --- |
| 1440×900 | `45×` | 45 | 359,107 722×722 | 360,108 720×720 |
| 1280×800 | `39×` | 39 | 327,105 626×626 | 328,106 624×624 |
| 768×1024 | `33×` | 33 | 119,265 530×530 | 120,266 528×528 |
| 390×844 | (hidden) | 21 | 26,223 338×338 | 27,224 336×336 |

The document is **16 × 16 logical pixels** at every breakpoint
(`contentSize / cell = 16` exactly, in all four cases). "Fit to screen" always lands
on an **integer** zoom factor.

Horizontal centring is exact (`artwork centre x == canvas centre x` at all four sizes).
Vertical centring is **not**: on the three desktop/tablet sizes the artwork centre sits
exactly **6 CSS px above** the canvas centre (measured 420 vs 426, 370 vs 376, 482 vs 488).
On mobile it is centred (344 vs 343.5 — a half-pixel rounding). See Gotcha G3.

### 8.4 Grid

Measured by run-length-encoding scanlines through the artwork:

- **Pitch:** exactly one grid line every `cell` CSS px (45 / 39 / 33 / 21), both axes.
  Device-pixel pitch at DPR 2 = 90, at DPR 3 = 135 — i.e. the pitch is defined in CSS px.
- **Line width:** exactly **1 CSS px** (2 device px at DPR 2, 3 at DPR 3). Not hairline-scaled.
- **Line colour:** `#EDEDED`, opaque, single value. There is **no** alpha.
- **No major/heavier lines at any interval.** Verified exhaustively: 16 interior grid
  lines per axis, all identical colour and width, and the whole-canvas histogram
  contains no other line colour. There is no 8-px or 16-px accent line.
- **Phase:** the *first* grid line coincides with the left/top edge of the content
  area. Cell *n* occupies `[originX + n·cell, originX + (n+1)·cell)`, of which the
  first 1px is the grid line and the remaining `cell − 1` px is white. The right and
  bottom edges are closed by the border instead of a 17th grid line.

At 1440×900 the vertical grid lines land at page x = **360, 405, 450, 495, 540, 585,
630, 675, 720, 765, 810, 855, 900, 945, 990, 1035** and the horizontal ones at page
y = **108, 153, 198, 243, 288, 333, 378, 423, 468, 513, 558, 603, 648, 693, 738, 783**.

### 8.5 Border

A 1-CSS-px hairline drawn immediately **outside** the 720×720 content box, so the
outer rect is `content + 2px`. Its colour is **not uniform**:

```
        ← 1px #0000002E (rgba 0,0,0,.180) →
      ┌────────────────────────────────────┐ ┐
   1px│                                    │ │ 1px
#0000 │        720×720  #FFFFFF            │ │ #0000
002E  │        + 1px #EDEDED grid          │ │ 003C
      │                                    │ │
      └────────────────────────────────────┘ ┘
        ← 1px #0000003C (rgba 0,0,0,.235) →
```

Corner ownership (from the 14×14 device-px corner maps): the **top** edge runs the
full width in `#0000002E` and the **left** edge the full height; the **right** and
**bottom** `#0000003C` edges start one pixel in, so the top-right and bottom-left
corners are `#0000002E`, and only the bottom-right corner pixel is `#0000003C`.
This is stable across DPR 2 and DPR 3 and across all four viewports.

**Not determinable from the outside:** why the two alphas differ. It is consistent
with a `rgba(0,0,0,0.18)` stroke plus an un-blurred `(+1,+1)`-offset shadow of ~0.067
alpha compositing on the bottom/right, but the drawing code is not observable. If you
want a 1:1 result, just hard-code the two measured colours.

There is **no** glow, blur, spread or second shadow ring: the pixel immediately
outside the border is fully transparent on every edge.

### 8.6 What could not be determined

- Whether the grid is suppressed below some zoom threshold (would require zooming,
  which needs interaction beyond hover).
- The internal draw order, layer compositing, or off-screen buffers.
- Selection / hover-cell / cursor-preview rendering (needs pointer movement over
  the artwork, which risks painting).
- Whether the artwork ever renders a transparency checkerboard for empty pixels —
  the default document is opaque white, so this could not be observed.

---

## 9. Icons

Full inventory with verbatim `outerHTML` is in **`icons.md`** and **`icons.json`**
(machine-readable, includes each icon's host button and that button's box, background,
colour and radius). Summary:

- **25 SVGs** at 1440×900, **20** at 390×844.
- **Family:** [Phosphor Icons](https://phosphoricons.com/), *Regular* weight.
  Every UI glyph is `viewBox="0 0 256 256"`, `width="1em" height="1em"`,
  `fill="currentColor"`, a **single `<path>`**, and computed `stroke: none`.
  These are filled silhouettes — `stroke-width` / `stroke-linecap` / `stroke-linejoin`
  are not used and have no effect. Sizing is entirely by CSS
  (`h-3 w-3` = 12px, `h-4 w-4` = 16px, `h-5 w-5` = 20px, `h-6 w-6` = 24px).
- **Exception:** the Newt logo is hand-authored 16×16 pixel art made of `<rect>`
  elements with `shape-rendering="crispEdges"` — two stacked copies, monochrome
  (`fill="currentColor"`, 44 rects) and full-colour (80 rects, hover-only).

### 9.1 Icon → function map (desktop)

| # | Icon box | Host button | Function |
| --- | --- | --- | --- |
| 0 | 16,12 24×24 | 12,8 101×32 | Newt logo, monochrome (resting) |
| 1 | 16,12 24×24 | same | Newt logo, colour (hover, `opacity 0→1`) |
| 2 | 91,16 16×16 | same | CaretDown — File menu |
| 3 | 125,14 20×20 | 117,6 36×36 | **Settings** (Faders) |
| 4 | 215,16 16×16 | 209,10 28×28 | **Smaller brush** (Minus) |
| 5 | 283,16 16×16 | 277,10 28×28 | **Bigger brush** (Plus) |
| 6 | 324,16 16×16 | 318,10 28×28 | **Pixel-perfect strokes** toggle |
| 7 | 555,18 12×12 | 489,10 87×28 | CaretDown — Dither picker |
| 8 | 1130,14 20×20 | 1118,6 108×36 | **Share** (Export) |
| 9 | 1200,16 16×16 | same | CaretDown — Share menu |
| 10 | 1238,14 20×20 | 1230,6 36×36 | **Code & Export** (`</>` CodeSimple) |
| 11 | 1278,14 20×20 | 1270,6 36×36 | **Animation timeline** (FilmStrip) |
| 12 | 1318,14 20×20 | 1310,6 36×36 | **Layers** (StackSimple) |
| 13 | 28,294 24×24 | 18,284 44×44 | **Select / Move (V)** (CursorClick) |
| 14 | 28,342 24×24 | 18,332 44×44 | **Brush (B)** — active |
| 15 | 28,390 24×24 | 18,380 44×44 | **Eraser (E)** |
| 16 | 28,438 24×24 | 18,428 44×44 | **Fill (G)** (PaintBucket) |
| 17 | 28,486 24×24 | 18,476 44×44 | **Shapes (U)** (Square) |
| 18 | 28,534 24×24 | 18,524 44×44 | **Select region (M)** (Selection) |
| 19 | 28,582 24×24 | 18,572 44×44 | **Eyedropper (I)** |
| 20 | 28,630 24×24 | 18,620 44×44 | **Gradient (H)** (Table-like glyph) |
| 21 | 26,852 20×20 | 20,846 32×32 | **AI options** (Plus) |
| 22 | 300,854 16×16 | 292,846 32×32 | **Send** (ArrowUp) — disabled |
| 23 | 1316,860 16×16 | 1308,852 32×32 | **Zoom out** (Minus) |
| 24 | 1400,860 16×16 | 1392,852 32×32 | **Zoom in** (Plus) |

Mobile-only glyphs (not present on desktop): **Undo** (ArrowUUpLeft), **Redo**
(ArrowUUpRight), **More** (DotsThree). Full markup in `icons.md` §Mobile.

### 9.2 The most-reused paths (copy-paste ready)

```html
<!-- CaretDown — used at 12px (dither) and 16px (File menu, Share menu) -->
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path></svg>

<!-- Minus — Smaller brush (16), Zoom out (16) -->
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256"><path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z"></path></svg>

<!-- Plus — Bigger brush (16), Zoom in (16), AI options (20) -->
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path></svg>
```

```html
<!-- Tool rail, in order. All h-6 w-6 (24px), fill=currentColor, viewBox 0 0 256 256 -->

<!-- Select / Move (V) -->
<path d="M168,132.69,214.08,115l.33-.13A16,16,0,0,0,213,85.07L52.92,32.8A15.95,15.95,0,0,0,32.8,52.92L85.07,213a15.82,15.82,0,0,0,14.41,11l.78,0a15.84,15.84,0,0,0,14.61-9.59l.13-.33L132.69,168,184,219.31a16,16,0,0,0,22.63,0l12.68-12.68a16,16,0,0,0,0-22.63ZM195.31,208,144,156.69a16,16,0,0,0-26,4.93c0,.11-.09.22-.13.32l-17.65,46L48,48l159.85,52.2-45.95,17.64-.32.13a16,16,0,0,0-4.93,26h0L208,195.31Z"></path>

<!-- Brush (B) -->
<path d="M232,32a8,8,0,0,0-8-8c-44.08,0-89.31,49.71-114.43,82.63A60,60,0,0,0,32,164c0,30.88-19.54,44.73-20.47,45.37A8,8,0,0,0,16,224H92a60,60,0,0,0,57.37-77.57C182.3,121.31,232,76.08,232,32ZM124.42,113.55q5.14-6.66,10.09-12.55A76.23,76.23,0,0,1,155,121.49q-5.9,4.94-12.55,10.09A60.54,60.54,0,0,0,124.42,113.55Zm42.7-2.68a92.57,92.57,0,0,0-22-22c31.78-34.53,55.75-45,69.9-47.91C212.17,55.12,201.65,79.09,167.12,110.87Z"></path>

<!-- Eraser (E) -->
<path d="M225,80.4,183.6,39a24,24,0,0,0-33.94,0L31,157.66a24,24,0,0,0,0,33.94l30.06,30.06A8,8,0,0,0,66.74,224H216a8,8,0,0,0,0-16h-84.7L225,114.34A24,24,0,0,0,225,80.4ZM108.68,208H70.05L42.33,180.28a8,8,0,0,1,0-11.31L96,115.31,148.69,168Zm105-105L160,156.69,107.31,104,161,50.34a8,8,0,0,1,11.32,0l41.38,41.38a8,8,0,0,1,0,11.31Z"></path>

<!-- Fill (G) -->
<path d="M234.53,139.07a8,8,0,0,0,3.13-13.24L122.17,10.34a8,8,0,0,0-11.31,0L70.25,51,45.65,26.34A8,8,0,0,0,34.34,37.66l24.6,24.6L15,106.17a24,24,0,0,0,0,33.94L99.89,225a24,24,0,0,0,33.94,0l78.49-78.49Zm-32.19-5.24-79.83,79.83a8,8,0,0,1-11.31,0L26.34,128.8a8,8,0,0,1,0-11.31L70.25,73.57l29.12,29.12a28,28,0,1,0,11.31-11.32L81.57,62.26l35-34.95L217.19,128l-11.72,3.9A8.09,8.09,0,0,0,202.34,133.83Zm-86.83-26.31,0,0a13.26,13.26,0,1,1-.05.06S115.51,107.53,115.51,107.52Zm123.15,56a8,8,0,0,0-13.32,0C223.57,166.23,208,190.09,208,208a24,24,0,0,0,48,0C256,190.09,240.43,166.23,238.66,163.56ZM232,216a8,8,0,0,1-8-8c0-6.8,4-16.32,8-24.08,4,7.76,8,17.34,8,24.08A8,8,0,0,1,232,216Z"></path>

<!-- Shapes (U) -->
<path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208Z"></path>

<!-- Select region (M) -->
<path d="M152,40a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,40Zm-8,168H112a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM208,32H184a8,8,0,0,0,0,16h24V72a8,8,0,0,0,16,0V48A16,16,0,0,0,208,32Zm8,72a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V112A8,8,0,0,0,216,104Zm0,72a8,8,0,0,0-8,8v24H184a8,8,0,0,0,0,16h24a16,16,0,0,0,16-16V184A8,8,0,0,0,216,176ZM40,152a8,8,0,0,0,8-8V112a8,8,0,0,0-16,0v32A8,8,0,0,0,40,152Zm32,56H48V184a8,8,0,0,0-16,0v24a16,16,0,0,0,16,16H72a8,8,0,0,0,0-16ZM72,32H48A16,16,0,0,0,32,48V72a8,8,0,0,0,16,0V48H72a8,8,0,0,0,0-16Z"></path>

<!-- Eyedropper (I) -->
<path d="M224,67.3a35.79,35.79,0,0,0-11.26-25.66c-14-13.28-36.72-12.78-50.62,1.13L142.8,62.2a24,24,0,0,0-33.14.77l-9,9a16,16,0,0,0,0,22.64l2,2.06-51,51a39.75,39.75,0,0,0-10.53,38l-8,18.41A13.68,13.68,0,0,0,36,219.3a15.92,15.92,0,0,0,17.71,3.35L71.23,215a39.89,39.89,0,0,0,37.06-10.75l51-51,2.06,2.06a16,16,0,0,0,22.62,0l9-9a24,24,0,0,0,.74-33.18l19.75-19.87A35.75,35.75,0,0,0,224,67.3ZM97,193a24,24,0,0,1-24,6,8,8,0,0,0-5.55.31l-18.1,7.91L57,189.41a8,8,0,0,0,.25-5.75A23.88,23.88,0,0,1,63,159l51-51,33.94,34ZM202.13,82l-25.37,25.52a8,8,0,0,0,0,11.3l4.89,4.89a8,8,0,0,1,0,11.32l-9,9L112,83.26l9-9a8,8,0,0,1,11.31,0l4.89,4.89a8,8,0,0,0,11.33,0l24.94-25.09c7.81-7.82,20.5-8.18,28.29-.81a20,20,0,0,1,.39,28.7Z"></path>

<!-- Gradient (H) -->
<path d="M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-64,80h64v16H136Zm0-16V88h64v16Zm0,48h64v16H136Zm64-80H136V56h64ZM56,56h64V200H56ZM200,200H136V184h64v16Z"></path>
```

The remaining single-path glyphs (Settings/Faders, Pixel-perfect, Export, CodeSimple,
FilmStrip, StackSimple, ArrowUp, Undo, Redo, DotsThree) are in `icons.md` verbatim.

### 9.3 The logo

```html
<!-- resting: fill=currentColor (= --fg #18181B). Rendered at 24×24 (16×16 below sm) -->
<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" class="h-full w-full group-hover:opacity-0"><rect x="3" y="1" width="3" height="1"></rect><rect x="10" y="1" width="3" height="1"></rect><rect x="2" y="2" width="1" height="1"></rect><rect x="6" y="2" width="1" height="1"></rect><rect x="9" y="2" width="1" height="1"></rect><rect x="13" y="2" width="1" height="1"></rect><rect x="2" y="3" width="1" height="1"></rect><rect x="4" y="3" width="1" height="1"></rect><rect x="6" y="3" width="1" height="1"></rect><rect x="9" y="3" width="1" height="1"></rect><rect x="11" y="3" width="1" height="1"></rect><rect x="13" y="3" width="1" height="1"></rect><rect x="2" y="4" width="1" height="1"></rect><rect x="4" y="4" width="1" height="1"></rect><rect x="6" y="4" width="1" height="1"></rect><rect x="9" y="4" width="1" height="1"></rect><rect x="11" y="4" width="1" height="1"></rect><rect x="13" y="4" width="1" height="1"></rect><rect x="1" y="5" width="1" height="1"></rect><rect x="4" y="5" width="1" height="1"></rect><rect x="6" y="5" width="4" height="1"></rect><rect x="11" y="5" width="1" height="1"></rect><rect x="14" y="5" width="1" height="1"></rect><rect x="0" y="6" width="1" height="1"></rect><rect x="7" y="6" width="2" height="1"></rect><rect x="15" y="6" width="1" height="1"></rect><rect x="0" y="7" width="1" height="1"></rect><rect x="15" y="7" width="1" height="1"></rect><rect x="0" y="8" width="1" height="1"></rect><rect x="2" y="8" width="1" height="1"></rect><rect x="13" y="8" width="1" height="1"></rect><rect x="15" y="8" width="1" height="1"></rect><rect x="0" y="9" width="1" height="1"></rect><rect x="3" y="9" width="10" height="1"></rect><rect x="15" y="9" width="1" height="1"></rect><rect x="0" y="10" width="1" height="1"></rect><rect x="15" y="10" width="1" height="1"></rect><rect x="1" y="11" width="1" height="1"></rect><rect x="14" y="11" width="1" height="1"></rect><rect x="1" y="12" width="3" height="1"></rect><rect x="12" y="12" width="3" height="1"></rect><rect x="3" y="13" width="2" height="1"></rect><rect x="11" y="13" width="2" height="1"></rect><rect x="4" y="14" width="8" height="1"></rect></svg>
```

The hover version is the same 16×16 grid with per-rect `fill` from the palette
`#191E43` (outline/dark), `#79D265` (body), `#9DEE72` (highlight), `#33993A` (shadow),
`#E56666` (cheeks) — 80 rects, verbatim in `icons.md` entry **D #1**.

---

## 10. Gotchas

**G1 — The 768px layout is broken on the live site.** At exactly 768×1024 the page
still renders the *desktop* component tree, but the header does not fit: the
absolutely-centred filename input (`288 → 480`) sits **on top of** the "Square | Round"
segmented control (`360 → 480`), and the right-hand cluster runs to x = 876, so
"Layers" is half-clipped and the divider plus the entire "Sign in" link are off-screen.
`<body>` has `overflow:hidden`, so there is no way to scroll to them. See
`shots/bp-768x1024.png`. If you are rebuilding this, **do not reproduce this**;
either move the mobile breakpoint up or make the header collapse.

**G2 — Two different "hover" fills.** Most controls use `--hover` = `rgba(0,0,0,0.05)`.
But controls that sit *inside* a `--panel2` track (the brush −/+ buttons) use
`hover:bg-panel` = **solid `#FFFFFF`**. Getting this wrong makes the brush-size pill
look dead on hover.

**G3 — The artwork is not vertically centred in the canvas on desktop.** Its centre is
exactly 6 CSS px above the canvas centre at 1440×900, 1280×800 *and* 768×1024, but it
*is* centred at 390×844. Deterministic across reloads and DPRs. Treat viewport pan as
explicit state rather than assuming `centre = canvasSize/2`.

**G4 — The artwork border is two colours.** Top+left `rgba(0,0,0,0.180)`,
bottom+right `rgba(0,0,0,0.235)`. A single uniform `strokeRect` will not match.

**G5 — No canvas background.** The canvas is transparent everywhere except the
artwork. The surrounding grey is the DOM background (`--surface`). If you paint
`#F4F4F5` into the canvas instead, `backdrop-filter: blur(8px)` on the tool rail and
zoom pill will composite differently.

**G6 — No grid emphasis lines.** Many pixel editors draw a heavier line every 8 or 16
cells. Newt does not — verified against every pixel of the backing store.

**G7 — Buttons are `cursor: default`.** Only the `Sign in` anchor and the two text
inputs get a non-default cursor. This is unusual and easy to "fix" accidentally.

**G8 — No custom focus ring.** Focus-visible falls back to the Chromium UA outline
(`rgb(16,16,16) auto 1px`). The Tailwind `focus-visible:ring-*` utilities are compiled
into the stylesheet but never applied on this screen.

**G9 — `border-radius: 9999px` reads back as `3.3554432e+07px`** in computed styles
(Chromium clamps `rounded-full` at 2²⁵). It is just a pill.

**G10 — The default theme is dark.** `:root` carries the dark token set; the light
palette only applies because `<html>` has `class="light"`. A rebuild that puts light
values on `:root` will invert the dark-mode behaviour.

**G11 — Mobile is a different component tree, not a reflow.** At 390 the tool rail
becomes a bottom bar, the options row becomes a horizontally-scrolling strip
(content 396px in a 390px box — it genuinely scrolls 6px), the AI composer and zoom
control disappear entirely, and Undo / Redo / "More" appear that the desktop bar
never shows. The mobile header is opaque `#FFF` with `z-index:30` (desktop is
`#FFF/80` + blur with `z-index:40`).

**G12 — `md:shadow-none`.** The brush-size pill, segmented control and dither button
carry `shadow-md` **only below 768px**. At ≥768px their computed `box-shadow` is the
all-transparent placeholder. Same markup, two different elevations.

**G13 — The mobile tool bar overflows by design.** Eight 44px buttons + 4px gaps =
380px of content in a 324px scroller with `scrollbar-width:none` and
`&::-webkit-scrollbar{display:none}`. The 8th tool (Gradient) starts at x = 394,
off-screen, with no visual affordance that more exists.

**G14 — `viewport` meta blocks zoom:** `width=device-width, initial-scale=1,
maximum-scale=1, user-scalable=no, viewport-fit=cover`.

**G15 — The colour swatch `#1A1C2C` is document state, not a token.** It is the
SWEETIE-16 / DB-family dark navy and will change with the user's selected colour.
Do not bake it into a palette.

---

## 11. Screenshots

All in `shots/`, captured at `deviceScaleFactor: 2` unless noted.

| File | What |
| --- | --- |
| `full-1440x900.png` | Reference viewport |
| `bp-1440x900.png`, `bp-1280x800.png`, `bp-768x1024.png`, `bp-390x844.png` | The four breakpoints |
| `bp-390x844-dsf3.png` | Mobile at DSF 3 |
| `region-topbar.png`, `region-topbar-left.png`, `region-topbar-right.png` | Header crops |
| `region-toolrail.png`, `region-composer.png`, `region-zoom.png` | Floating panels |
| `canvas-corner-topleft-200-dsf3.png` | **200×200 CSS px around the artwork's top-left corner at DSF 3** — read the border/grid pixel treatment here |
| `canvas-corner-topleft-40-dsf3.png` | 40×40 extreme close-up of the same corner |
| `canvas-corner-bottomright-200-dsf3.png` | Bottom-right corner (the darker `#0000003C` edges) |
| `canvas-grid-mid-200-dsf3.png` | Grid in the middle of the artwork |
| `canvas-artwork-topleft-200.png`, `-60.png`, `canvas-artwork-center-120.png`, `canvas-artwork-bottomright-200.png`, `canvas-outside-200.png` | Earlier DSF-3 crops |
| `canvas-390-topleft-120.png` | Mobile artwork corner |
| `hover-toolrail-second.png`, `hover-toolrail-inactive.png`, `hover-topbar-right-icon.png`, `hover-topbar-left-icon.png`, `hover-zoom-plus.png`, `hover-composer-send.png` | Hover states |
| `focus-visible-1.png`, `focus-visible-2.png` | First and second Tab stop |

## 12. Reproducing this capture

```
npx tsx tools/extract-newt.ts          # tree, icons, stylesheets, hover, responsive, shots
npx tsx tools/extract-newt-detail.ts   # mobile tree + high-precision canvas probe + DSF-3 crops
npx tsx tools/probe-newt-canvas-bp.ts  # canvas geometry at all 4 breakpoints
npx tsx tools/write-newt-icons-doc.ts  # regenerates icons.md from icons.json
```

Public-page inspection only: `page.goto`, `getComputedStyle`, `getBoundingClientRect`,
`getImageData`, `page.mouse.move` (hover) and `Tab`. Nothing was clicked, submitted or
authenticated; no non-public endpoint was requested.
