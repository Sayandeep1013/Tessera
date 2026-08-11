# 02 — Design System

**Owns:** `app/globals.css`, `tailwind.config.ts`, `components/ui/*`
**Research source:** `docs/research/newt/` — measured live on 11 Aug 2026 via `tools/inspect-newt.ts`

---

## 1. Reference measurements (Newt, measured)

These are **facts observed from the live site**, not guesses. They replace the speculative
reconstruction in the original PRD, which had the layout substantially wrong (it placed the tools in
a bottom cluster; they are actually a left rail, and it missed the code-panel, frames, and layers
affordances entirely).

### Stack fingerprint

| Signal | Value |
|---|---|
| Framework | Next.js App Router (`/_next/static/chunks/`, `?_rsc=` prefetch on `/login`) |
| Bundler | Turbopack (`turbopack-*.js`) |
| Host | Vercel (`?dpl=dpl_…` deployment param on every asset) |
| Font | Geist + Geist Fallback, self-hosted woff2 |
| Analytics | First-party-proxied script at a hashed path |
| AI endpoint | **Not called on load.** Nothing fires until a prompt is submitted. |

### Measured geometry @ 1440×900

| Region | Measurement |
|---|---|
| Top bar height | **48px** (canvas begins at `y=48`) |
| Canvas element | `x0 y48 1440×852` — **full viewport width and remaining height** |
| Canvas backing store | `2880×1704` @ DPR 2, `imageRendering: auto` |
| Tool rail | 8 buttons, `44×44`, radius `12px`, at `x=18`, pitch **48px** (`y` 284→620) |
| Rail vertical centre | `474` — exactly the canvas-area centre (`48 + 852/2`) |
| Tool icon | `24×24` inside `44×44` (10px inset) |
| Active tool | background `#18181b`, icon inverted |
| AI composer | `+` `32×32` @ `x20 y846`; input `232×36`; submit `32×32` @ `x292`; ~22px from bottom |
| Zoom control | `−` / `45×` / `+`, `32×32` buttons, right edge inset 16px |
| Top-bar icon buttons | `36×36`, pill radius |
| Segmented control | `Square` `60×24`, `Round` `56×24`, pill; active = white fill |
| Name input | `192×28`, radius `8px`, centred |

### Measured palette

Newt is **Tailwind `zinc`, light theme, with no chromatic accent at all.**

| Role | Value | Tailwind |
|---|---|---|
| Page background | `#f4f4f5` | zinc-100 |
| Panel / surface | `#ffffff` | white |
| Text | `#18181b` | zinc-900 |
| Muted text | `#71717a` | zinc-500 |
| Faint text | `#a1a1aa` | zinc-400 |
| Hover / inactive fill | `#f1f1f4` | ~zinc-100 |
| Default draw colour | `#1a1c2c` | Sweetie-16 darkest |

Its declared dark-theme custom properties:

```
--surface #17171b   --panel #202024   --panel2 #2c2c32
--fg #f4f4f5        --muted #a1a1aa   --faint #71717a
--line #ffffff21    --hover #ffffff12
--accent #f4f4f5    --onaccent #18181b
```

Note `--accent` is near-white. The design is **deliberately achromatic** so the artwork supplies all
the colour on screen. That is a genuinely good idea and we adopt the *principle*, not the values.

### Radii observed

`4px`, `8px`, `12px`, `16px`, and full-pill.

---

## 2. What we take, and what we do differently

**Take (conventional editor patterns, not branding):** 48px top bar; full-viewport canvas; left tool
rail; bottom-left AI composer; bottom-right zoom readout; achromatic chrome so artwork owns the colour;
tool rail rotating to a bottom row on mobile.

**Do differently (identity):**

| | Newt | Tessera |
|---|---|---|
| Default theme | Light | **Dark** |
| Accent | None (achromatic) | **One chromatic accent**, used only for focus, selection, and the primary action |
| Font | Geist | **System UI stack** — no webfont, no layout shift, zero font bytes |
| Corner language | Mixed 4/8/12/16 + pill | **4 / 8 / 12 + pill only** |
| Tool rail | Floating card, vertically centred | Same geometry, flush-top-aligned below a 16px gap |
| Diff overlay | n/a | Green/amber/red **plus pattern fills** |

**Never copy:** the Newt wordmark, the pixel-newt logo, any icon set traced from it, its copy strings
("Ask Newt…"), or its artwork.

---

## 3. Tokens

> **Superseded, 11 Aug 2026 (rule 10).** Everything this section used to specify is dead, and
> leaving it standing actively caused a bug. It declared a token vocabulary — `--bg`,
> `--surface-2`, `--fg-muted`, `--fg-faint`, `--fg-invert` — that `app/globals.css` never
> implemented. Components were written against **this document** while the stylesheet used a
> different set, and an undefined CSS custom property does not warn, does not throw and does not
> fail a typecheck: it silently resolves to nothing. Eight such references had accumulated in the AI
> proposal bar, which is a large part of why that panel looked unfinished. Recorded in
> `docs/research/ui-audit.md` and fixed in commit `aa8ed3c`.
>
> It also claimed enforcement by "an ESLint rule (`no-restricted-syntax` on hex literals in
> `.tsx`)". **There is no ESLint config in this repository and never was.** A spec that names a
> guard which does not exist is worse than one that names none, because it stops anyone looking.

**The token set now lives in exactly one place: `app/globals.css`.** That file is the source of
truth; this document does not restate it, because restating it is what broke it.

For the reasoning behind the current values — the surface ladder, the single accent taken from the
product's own default palette, the radius lattice, the type scale, the motion tokens — see
[13 — Visual identity](./13-visual-identity.md), direction 2.B.

### Enforcement, as actually built

`lib/__tests__/tokens.test.ts`, which runs in the normal suite:

| Check | Catches |
|---|---|
| Every `var(--token)` reference resolves to a declared token | The failure above — a component naming a token the stylesheet does not define |
| Both themes declare the same token set | A token defined only in dark, which renders as nothing in light |
| No hex literal in any `.tsx` | Colour bypassing the token layer |

The hex rule has real exceptions — a `themeColor` meta tag is read by the OS before any stylesheet
loads, and an artwork colour is document data rather than a design token. Those carry an explicit
`token-exempt:` comment on the line, so an exception has to be written down and argued in review
instead of the rule being watered down until it catches nothing.

Custom properties set per-element in JSX (`['--d' as string]: n`, used by the loaders to give each
cell its own animation delay) are read from the actual assignments rather than allowlisted, so a
typo in one still fails.

## 4. Type

**No webfont.** System stack only — it renders instantly, has no layout shift, and costs zero bytes.

```css
--font-ui:   ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable", "Segoe UI",
             Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", "Roboto Mono",
             Menlo, Consolas, monospace;
```

| Role | Size / weight / tracking | Font |
|---|---|---|
| Top-bar label (`Share`, `Sign in`) | 13px / 500 / -0.006em | UI |
| Segmented control | 13px / 500 | UI |
| Button label | 13px / 500 | UI |
| Composer input + placeholder | 14px / 400 | UI |
| Document name input | 13px / 500, centred | UI |
| Numeric readout (`1px`, `45×`, `16×16`) | 12px / 500 / tabular-nums | **Mono** |
| Code panel | 13px / 400 / line-height 1.55 | **Mono** |
| Popover heading | 12px / 600 / uppercase / 0.06em | UI |
| Helper + error text | 12px / 400 | UI |

`font-variant-numeric: tabular-nums` on **every** numeric readout — otherwise the zoom indicator
jitters as the value changes width.

No display serif. No italic. No font-weight above 600.

---

## 5. Scales

**Spacing** — 4px base: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 48`.

**Radius**

| Token | Value | Used for |
|---|---|---|
| `--r-sm` | `4px` | Swatches, inline chips |
| `--r-md` | `8px` | Inputs, popovers, small buttons |
| `--r-lg` | `12px` | Tool buttons, cards |
| `--r-xl` | `16px` | Floating rail / composer container |
| `--r-pill` | `999px` | Icon buttons, segmented controls, zoom control |

**Elevation** — two levels only.

```css
--shadow-1: 0 1px 2px #0000000d, 0 0 0 1px var(--line);          /* resting cards */
--shadow-2: 0 8px 24px -6px #00000026, 0 0 0 1px var(--line);    /* popovers, menus */
```

Dark theme swaps the shadow colour to `#00000059` and leans on `--line` for definition.

**Focus** — one treatment everywhere, never removed:

```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: inherit; }
```

---

## 6. Layout geometry

### Desktop (≥ 1024px)

```
┌────────────────────────────────────────────────────────────────────┐
│ ◆ Tessera ⌄ │ ⚙ │ ● │ − 1px + │ Square Round │ Solid ⌄   untitled   │  48px
│                                        ⤴ Share  </>  ▤  ◈   Sign in │
├────────────────────────────────────────────────────────────────────┤
│ ┌──┐                                                               │
│ │↖ │ 16px from left edge, top-aligned 16px under the bar           │
│ │🖌│ ← active: --accent fill, --accent-fg icon                     │
│ │◨ │                                                               │
│ │▧ │              ███████████████████                              │
│ │▢ │              ███████████████████   canvas, centred            │
│ │⬚ │              ███████████████████                              │
│ │💧│                                                               │
│ └──┘                                                               │
│                                                                    │
│  ┌────────────────────────────────┐               ┌─────────────┐  │
│  │ +  Ask AI…  "make it angrier" ↑│               │ − 32× + 16×16│ │
│  └────────────────────────────────┘               └─────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

**Exact values** (mirroring Newt's proven geometry — these are ergonomic constants, not decoration):

| Element | Value |
|---|---|
| Top bar | height `48`, padding-x `12`, `--surface`, bottom hairline `--line` |
| Canvas element | `position: absolute; inset: 48px 0 0 0` — full width, DPR-scaled backing store |
| Tool rail container | `x: 16`, `y: 64`, width `48`, padding `2`, `--r-xl`, `--shadow-1` |
| Tool button | `44×44`, `--r-lg`, icon `20×20` centred, pitch `48` |
| Composer | `left: 16`, `bottom: 16`, height `48`, min-width `320`, max-width `460`, `--r-xl` |
| Composer input | height `36`, font 14 |
| Zoom control | `right: 16`, `bottom: 16`, height `40`, `--r-pill` |
| Canvas-size readout | inline with zoom, `--fg-faint`, mono 12 |
| Code panel | right half, `min-width: 380`, resizable 320–800, hairline divider |

**Zoom vs. canvas size are separate and both always visible.** The bottom-right reads `32×` (display
zoom) and `16×16` (artwork resolution). Conflating these was called out as a defect in the source PRD
and must not recur.

### Tablet (640–1023px)

Tool rail stays left. Composer becomes `left: 16; right: 16` (full width minus the rail). Code panel
becomes an overlay sheet rather than a split.

### Mobile (< 640px)

Follows Newt's proven mobile pattern, which is genuinely the right answer:

```
┌──────────────────────────────┐
│ ◆ ⌄  ⚙   untitled   ↶ ↷ ◈ ▤ ⋯│  48px — undo/redo appear here
├──────────────────────────────┤
│                              │
│         ████████████         │  canvas
│         ████████████         │
│                              │
├──────────────────────────────┤
│ − 1px +  │ Square Round │ ▪⌄ │  brush options row, 44px
├──────────────────────────────┤
│ ██ │ ↖  🖌  ◨  ▧  ▢  ⬚  💧  │  swatch + tools, 48px, h-scroll
├──────────────────────────────┤
│ +  Ask AI…                  ↑│  composer, 56px, full width
└──────────────────────────────┘
```

- **Undo/redo become visible buttons** in the top bar (no keyboard on mobile).
- Share, code panel, and export collapse into `⋯`.
- The colour swatch joins the head of the tool row.
- Tool row scrolls horizontally if it overflows; it never wraps.
- Minimum touch target `44×44` everywhere.
- `touch-action: none` on the canvas; one finger draws, two fingers pan/zoom.

---

## 7. Components

### Icon button

`36×36` in the top bar, `44×44` in the tool rail. Icon `20×20`. Transparent by default,
`--hover` on hover, `--accent` fill + `--accent-fg` icon when active. Pill radius in the bar,
`--r-lg` in the rail. Every icon-only button carries an `aria-label` and a 400ms-delay tooltip.

### Segmented control (`Square` / `Round`)

Track `--surface-2`, `--r-pill`, 2px padding. Active segment: `--surface` fill + `--shadow-1`,
`--fg` text. Inactive: `--fg-muted`. Height 28, per-segment padding-x 12. Implemented as
`role="radiogroup"` with arrow-key navigation.

### AI composer

The most important control on the page.

- Container: `--surface`, `--r-xl`, `--shadow-1`, height 48.
- `+` button (32×32) opens an attach/context menu — **Phase 3+; in Phase 2 it is not rendered at all**
  rather than rendered disabled.
- Input placeholder: `Ask AI…  "make it angrier"` — the quoted example is `--fg-faint`, the lead-in is
  `--fg-muted`.
- Submit (32×32, pill): `--surface-2` at rest, `--accent` when the input is non-empty. `⏎` submits;
  `⇧⏎` is a newline.
- **Busy state:** submit swaps to a spinner, the input stays editable, and a cancel affordance appears.
  Never disable the whole composer.
- **Error state:** a one-line message appears above the composer in `--diff-remove`, with a `Retry`
  text button. It auto-dismisses on the next keystroke.

### Zoom control

`−  32×  +` plus a `16×16` size readout. Both numeric values are mono + tabular. `−`/`+` step through
the integer zoom ladder (§05). Clicking the `32×` label resets to fit.

### Colour swatch + palette popover

Swatch is a `28×28` `--r-sm` square showing the current colour over a checkerboard when alpha < 1.
Clicking opens a popover: the document palette as a grid of `24×24` swatches (max 36, so 6×6 fits
exactly), a hex input, an alpha slider, and `Add colour` (disabled with an explanatory tooltip at 36).
Index 0 renders as a checkerboard tile and is not removable.

### Diff overlay

Rendered by the renderer, not by DOM. Colour **plus** pattern, so it is legible without colour vision:

| Change | Colour | Pattern |
|---|---|---|
| Added (was transparent) | `--diff-add` | Dotted, 2px |
| Changed | `--diff-change` | Diagonal hatch, 45° |
| Removed (now transparent) | `--diff-remove` | Cross-hatch |

Overlay is drawn at 60% alpha above the preview. A `Before / After / Diff` 3-way segmented control
sits in the proposal bar so the user can flip between them.

### Proposal bar

Replaces the composer while a proposal is pending:

```
┌──────────────────────────────────────────────────────────┐
│ "Angled the eyebrows down and flattened the mouth."      │
│ +12  ~6  −0   ·  1 new colour     [Before|After|Diff]    │
│                              [ Reject ]      [ Accept ]  │
└──────────────────────────────────────────────────────────┘
```

`Accept` is the only `--accent`-filled button on the screen at that moment.

---

## 8. Motion

Fast, few, and never on the canvas.

| Thing | Duration | Easing |
|---|---|---|
| Hover / active state | 90ms | `ease-out` |
| Popover / menu enter | 140ms | `cubic-bezier(.16,1,.3,1)` |
| Popover exit | 90ms | `ease-in` |
| Proposal bar swap | 180ms | `cubic-bezier(.16,1,.3,1)` |
| Diff overlay pulse (once, on arrival) | 400ms | `ease-out` |

**Never animate:** canvas pixels, zoom, pan, or brush cursor. They must feel instantaneous.

All of the above sit inside `@media (prefers-reduced-motion: no-preference)`. With reduced motion,
transitions collapse to `0ms` and the diff pulse does not run.

---

## 9. Accessibility

- Every icon-only control has `aria-label`.
- The canvas has `role="img"` with an `aria-label` describing the artwork
  (`"Pixel artwork, 16 by 16, 4 colours"`), updated on change.
- An `aria-live="polite"` region announces: tool changes, undo/redo, autosave state, AI proposal
  arrival (`"AI proposed 18 changes"`), and accept/reject.
- Full keyboard operation: `Tab` order is top bar → rail → canvas → composer. On the canvas, arrow
  keys move a pixel cursor and `Enter` paints.
- Contrast: `--fg` on `--bg` and `--fg-muted` on `--surface` both meet WCAG AA. `--fg-faint` is used
  **only** for decorative placeholder text, never for information.
- Diff meaning never rides on colour alone (§7).
- `prefers-reduced-motion` honoured (§8).

---

## 10. Icons

One set, drawn as 20×20 inline SVG at `stroke-width: 1.5`, `currentColor`, no fills.
Checked into `components/icons/`. Do not add an icon dependency; there are ~18 of them.

`cursor · brush · eraser · fill · rect · marquee · eyedropper · pan · undo · redo · layers · frames ·
code · share · export · plus · minus · chevron · check · x · spinner`

The logo is a 16×16 pixel-art mark **drawn in our own format** and rendered through our own renderer —
which is a small, fitting proof that the pipeline works.

---

## 11. Verification

- Screenshot tests at 1440×900, 768×1024, and 390×844, in light and dark, checked into
  `tests/visual/`.
- A test asserts no `#rrggbb` literal appears in any `.tsx` file.
- A test asserts every `<button>` has either text content or an `aria-label`.
- Manual pass with `prefers-reduced-motion: reduce` and with forced-colors mode.
