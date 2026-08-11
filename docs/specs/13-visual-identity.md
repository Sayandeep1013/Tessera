# 13 — Visual identity, scale, loader and motion

Status: **spec, awaiting a direction choice.** §2 needs a human decision before §3–§7 can be
implemented; everything else is decided.

Scope: `app/globals.css`, `components/Chrome.tsx`, `components/AiComposer.tsx`,
`components/AgentPanel.tsx`, `lib/renderer/canvas.ts` (artwork edge + cursor only),
`lib/editor/viewport.ts` (`fitViewport` only). No document-format change, no `commit()` change.

This spec supersedes `docs/specs/02-design-system.md` §3 (Tokens), §5 (Motion) and §6 (Components).
02 is stale in three verifiable ways and must be corrected in the same change, per rule 10:

- its token vocabulary (`--bg`, `--surface-2`, `--fg-muted`, `--fg-faint`, `--accent-fg`,
  `--shadow-1`, `--grid-major`, `--checker-a/b`) does not exist in `app/globals.css` and is
  referenced by no `.tsx` file — verified: `grep -r 'fg-muted\|surface-2\|accent-fg\|shadow-1'`
  over `app/ components/ lib/` returns nothing;
- it specifies `:root[data-theme="dark"]`; the app ships `.dark` / `.light` classes on `<html>`
  (`app/layout.tsx:27-31`);
- it claims hex literals are "enforced by an ESLint rule". **There is no ESLint config in this
  repo at all** — no `eslint.config.*`, no `.eslintrc*`, no eslint dependency in `package.json`.
  Rule 8 is currently enforced by nothing. See §6.17.

---

## 1. Diagnosis — why the page reads as flat and unfinished

Measured against `docs/shots/editor-light.png` and `docs/shots/editor-dark.png` (1440×900 @ DPR 2)
and against the source. "Something is missing" resolves into eleven concrete defects, ordered by
how much each contributes.

Two of them are not design problems and cannot be fixed by design. **D2 is an editor bug** — the
fit calculation discards a third of the artwork's size. **D3 is missing features** — a third of the
tool rail does not work yet, and the UI says so. Both are named here because they dominate the
impression the user is reacting to, and no amount of §3–§7 will out-argue them.

### D1 — The artwork does not separate from the app *(largest single cause)*

| | shell | artwork bg | ΔL\* | contrast |
|---|---|---|---|---|
| dark | `--surface #17171b` | `--art-bg #1e1e22` | **3.5** | 1.08:1 |
| light | `--surface #f4f4f5` | `--art-bg #ffffff` | **3.8** | 1.10:1 |

The only thing saying "the artwork ends here" is a 1px hairline at `#ffffff2e` / `#0000002e`
(`lib/renderer/canvas.ts:128-136`). WCAG 1.4.11 asks 3:1 for a meaningful non-text boundary; this
is 1.1:1. In dark mode the artwork's backdrop is effectively invisible — in `editor-dark.png` the
yellow face floats in a void with no object under it.

Inherited from newt, where it survives because newt's default document is blank white and there is
nothing to separate. It does not survive here.

### D2 — Fit-to-screen throws away 30% of the artwork's linear size

`lib/editor/viewport.ts:55-64` snaps fit to `ZOOM_LADDER = [1,2,3,4,6,8,12,16,24,32,48,64]`
(`viewport.ts:9`) with a symmetric `margin = 48`.

At 1440×900 the main area is 852px tall. `maxScale = min((1440−96)/16, (852−96)/16) = 47.25`. The
largest ladder rung ≤ 47.25 is **32**, so the artwork renders at **512×512** — 60% of the short
axis. The reference at the same viewport renders at 45×, **720×720**, 85% of the short axis
(`docs/research/newt/VISUAL-SPEC.md` §8.3). At 1280×800 we also land on 32× / 512×512 against the
reference's 39× / 624×624.

**Our artwork is 71% of the reference's linear size and 51% of its area.** When the user says
"everything should be a bit bigger", this is the largest single instance of it — and it is not a
chrome problem at all. Fixed in §3.1.

### D3 — Three of eight tools and half the top-bar right group are visibly dead

`Chrome.tsx:23,28,30` mark `select`, `marquee`, `gradient` as `enabled: false`;
`Chrome.tsx:295,306,307,308` render Share, Code, FilmStrip and Layers with `disabled`. Disabled
styling is `opacity: 0.5` over `--faint` (`Chrome.tsx:78-90`), so 3/8 of the tool rail and 4/8 of
the right group are grey ghosts. The UI is accurately advertising that it is unfinished. No amount
of polish elsewhere out-shouts this. See §8, question 4.

### D4 — There is no colour in the chrome at all

Every pixel of chrome is `#18181b` / `#71717a` / `#a1a1aa` / `#f1f1f4` / `#ffffff`. The only colour
on screen is the artwork and one 24px palette swatch. Even the reference has a five-colour frog on
logo hover (`VISUAL-SPEC.md` §3.2, last row). Tessera has zero brand colour and therefore zero
recall. This is the "our own touch" gap in its most measurable form.

### D5 — Four floating islands, no structure

At 1440×900: a 56×392 rail at x=12, a 320×52 composer bottom-left, a 124×40 pill bottom-right, a
48px header, and 1440×852 of nothing else. The rail's vertical centre (`Chrome.tsx:340`, centred on
`main`), the composer's baseline (`AiComposer.tsx:11-12`, pinned to `bottom: 12`) and the artwork's
centre are three unrelated numbers, and none of them references another. Empty space reads as
"unfinished" rather than "spacious" when nothing in it is deliberate.

### D6 — `--faint` fails contrast and is used for real text

`#a1a1aa` on `--surface #f4f4f5` = **2.33:1**; on `--panel #ffffff` = **2.56:1**. Dark `#71717a` on
`#17171b` = **3.70:1**. All fail WCAG AA (4.5:1) and the 3:1 large-text floor. Applied to the AI
composer placeholder (`AiComposer.tsx:100`), the disabled Share label (`Chrome.tsx:299`), the
save-status text (`Chrome.tsx:286`) and the agent panel's free-tries line (`AgentPanel.tsx:131`).
Placeholder text is not exempt from 1.4.3.

### D7 — There is zero press feedback anywhere

`GlyphBtn` (`Chrome.tsx:43-95`) tracks hover in React state and writes inline styles. There is no
`:active` rule in `app/globals.css` and no `:active` handling in any component. Clicking a tool
produces a state change with no acknowledgement of the click itself — the cheapest possible "this
app is alive" signal, entirely absent.

Related: every pointer enter/leave re-renders the button, and the only transition in the product is
`button { transition: color, background-color 0.15s }` (`globals.css:118-121`), which does not
apply to the filename `<input>` (`Chrome.tsx:275-281`) — so that one control snaps while its
neighbours fade.

### D8 — The loader is a generic rotating ring

`AiComposer.tsx:129-140`: a 14px circle, `2px solid var(--faint)`, `border-top-color: transparent`,
`0.7s linear infinite`. In a pixel-art editor this is a wasted opportunity, and it is the only
loading affordance in the product. `AgentPanel.tsx:430` has a placeholder 3×3 pixel pulse whose own
comment (`AgentPanel.tsx:427`) says *"docs/specs/13 designs the real one"*. §4 does.

### D9 — Nothing at all is shown during boot

`app/page.tsx:127` gates the entire editor on `{doc && …}`. Until `loadLatestDraft()` resolves from
IndexedDB, `<main>` renders **empty** — a full-viewport blank field under a fully-populated top bar
whose controls all point at nothing. First paint is a broken-looking screen.

### D10 — The save-status text shifts the whole right group

`Chrome.tsx:286-288` renders `''` / `'Saving…'` / `'Saved'` / `'Save failed'` in an auto-width span
inside the `margin-left: auto` flex row. Every save nudges Undo/Redo/Share/Code/FilmStrip/Layers
horizontally by the width of the word. Layout jitter on a timer.

### D11 — Smaller, verifiable defects

| Where | What |
|---|---|
| `Chrome.tsx:409` | The zoom-level button is **48×16**. WCAG 2.5.8 (AA) floor is 24×24. Fails. |
| `AiComposer.tsx:170,187,226`; `AgentPanel.tsx:131,167,173,188,249,272,283,288,310,315,351` | 11px text — below the 12px floor, in 14 places. |
| `globals.css:152-156` | `:focus-visible { … border-radius: inherit }` — a focus rule that mutates the focused element's own geometry. Harmless today only because every button sets `borderRadius` inline (inline wins on specificity); it will silently break the first control styled from CSS. |
| `globals.css:158-165` | `prefers-reduced-motion` sets `animation-duration: 0.01ms !important` on `*`. This freezes **the loader**, leaving a static dot with no progress signal at all. See §5.4. |
| `Chrome.tsx:349` | The tool rail uses `gap: 4` between 8 buttons — seven 4px **dead zones** inside a control strip. In a list of adjacent targets the space between them should be the buttons' own padding, so a pointer travelling down the rail is never over nothing. |
| `Chrome.tsx:182,471` | The transparent-colour swatch uses `repeating-conic-gradient`. Conic gradients render visibly ragged edges at some sizes and were broken in iOS Safari 14. Two 45° `linear-gradient`s produce the same checker with hard edges everywhere. |
| `Chrome.tsx:216` | `{showGrid && null}` — dead expression. |
| `globals.css:1` | `@import 'tailwindcss'` ships preflight plus the utility engine; the only class used anywhere in `components/` is `.tabular`, hand-written at `globals.css:147-149`. |
| `components/AgentPanel.tsx` | 14.5 KB, complete, with a working step log — and imported by nothing. The mounted composer is the single-shot `AiComposer` (`app/page.tsx:6,132`). The richest surface in the product is dark. |
| `lib/renderer/canvas.ts:120-123,182` | The grid is drawn **over** the artwork, opaque (`--art-grid`). At 32× that puts a hard `#ededed` line through every painted cell — visible in `editor-light.png`. Drawing over is the right convention; the opaque value is the wrong one. See §6 item 10. |

---

## 2. Three identity directions

All three assume §3–§7 (scale, loader, motion, liveliness) are applied — those are
direction-independent. What differs here is **voice**: surface, colour, shape, type.

All three must satisfy two non-negotiable gates, because D1 and D6 are defects, not taste:

- **G1** — shell-to-artwork separation ≥ **ΔL\* 8**.
- **G2** — every token used for text meets **4.5:1** against every surface it appears on; every
  token used for a meaningful boundary or state indicator meets **3:1**.

### 2.A — "Darkroom"

**One sentence:** the app recedes to near-black, carries no colour of its own, and borrows the
user's currently-selected palette colour as its accent — the artwork is the only lit thing in the
room.

```css
:root, .dark {
  --surface: #0b0b0d;        /* was #17171b — L* 3.1 */
  --panel:   #141417;        /* L* 6.4 */
  --panel2:  #1c1c20;        /* L* 10.4 */
  --fg:      #f4f4f5;        /* 17.89:1 on surface */
  --muted:   #9a9aa3;        /* was #a1a1aa → 7.05:1 on surface ✓ */
  --faint:   #8a8a93;        /* was #71717a (3.70:1 ✗) → 5.75:1 ✓ */
  --line:        #ffffff1f;
  --line-strong: #ffffff33;
  --hover:   #ffffff12;
  --accent:  #f4f4f5;        /* stays neutral */
  --onaccent:#0b0b0d;
  --art-bg:  #1e1e22;        /* ΔL* 8.3 vs surface ✓ G1 */
  --art-grid:#ffffff14;      /* alpha overlay — see §6 item 10 */
}
.light {
  --surface: #e8e8ea;        /* was #f4f4f5 — L* 92.0 */
  --panel:   #ffffff;
  --panel2:  #f1f1f4;
  --fg:      #18181b;        /* 14.48:1 on surface */
  --muted:   #5f5f68;        /* was #71717a — 3.95:1 on the new surface ✗ → 5.16:1 ✓ */
  --faint:   #71717a;        /* 3.95:1 — decorative and disabled only, never body text */
  --art-bg:  #ffffff;        /* ΔL* 8.0 vs surface ✓ G1 */
  --art-grid:#00000014;
}
```

`--faint` in light stays at 3.95:1 on `--surface`, which is below AA. That is permitted **only**
because its remaining uses are decorative (chevrons, ≥3:1) or disabled (exempt from 1.4.3). The two
uses that are neither must move to `--muted` in the same change: the composer placeholder
(`AiComposer.tsx:100`) and the save-status text (`Chrome.tsx:286`).

**Elevation:** in dark, drop `--shadow-card` and `--shadow-lg` and replace with a surface ladder
plus `box-shadow: 0 0 0 1px var(--line), inset 0 1px 0 #ffffff0f`. Shadows on a dark ground read as
haze; a ladder reads as structure. Light keeps the existing shadows.

**The artwork's own edge and shadow are drawn by the renderer, not CSS** — the artwork lives inside
`<canvas>` and cannot take a `box-shadow`. Replace `canvas.ts:126-136` with: the existing two-tone
1px edge, plus, in light mode only, four `fillRect` bands below and right of the artwork at
`#00000014`, `#0000000d`, `#00000008`, `#00000004` (1px each, offset +1..+4 in x and y). Four flat
bands, no `ctx.shadowBlur` — blur on a hard-edged artwork is exactly the wrong texture.

**Runtime accent:** `--accent-live` is set from `doc.palette[colorIndex].c` on every colour change
and used only for the active-tool underline (3px) and the canvas cursor. **Never for text.** Because
that value is arbitrary user data its contrast is unpredictable; every use is wrapped in the double
ring of §5.5, which guarantees separation from any backdrop.

**Type:** Geist Sans throughout, weights 400/500/600, no mono. Sizes per §3.3.
**Radii:** unchanged (4/8/12/16/pill).

**What it feels like to use:** calm, serious, professional. Aseprite / Affinity / Figma-dark. The
eye goes to the artwork immediately and stays there. Nothing competes.

**Cost:** ~15 token edits, one shadow→ladder swap, one runtime-accent hook. **~1 day.** Lowest risk
in the set — nothing structural moves.

**What it costs you:** it is an excellent version of the category norm and nothing more. A stranger
could not describe it back to you. It fixes D1, D6, and D4 only by borrowing. If the real complaint
is "we look like everyone else", this does not answer it.

> **Correction, applied in build (rule 10).** The `--art-bg: #1e1e22` above is **not built**, in
> either theme. G1 asks the artwork to separate from the app and that gate is right, but this
> optimises the wrong pair. Transparent pixels are the ground the user's *own* colours are judged
> against, and those colours are arbitrary data — the shipped starter's outline is `#2d1b00`, which
> lands at **1.005:1** on `#1e1e22` and disappears entirely. Verified in a screenshot, twice: the
> defect was found, fixed, reintroduced by following this section, and found again the same way.
>
> Separation from the app is bought instead with the deeper `--surface` and the artwork's existing
> 1px two-tone edge, neither of which costs the artwork anything. **`--art-bg` is `#ffffff` in both
> themes**, as the reference paints it, and `--art-grid` is therefore `#00000014` in both — a white
> grid on a white ground would have been invisible, which is the same failure one level down.
>
> G1 should be restated as *the artwork must separate from the app*, not *the artwork background
> must sit on the surface ladder*.

### 2.B — "Mosaic"  ← **recommended**

**One sentence:** *tessera* means tile, so the chrome is built from the same unit as the artwork —
small hard radii, a 4px lattice, and one brand colour taken from the product's own default palette.

Same surface ladder and text tokens as 2.A (G1/G2 are gates, not flavour), plus:

```css
:root, .dark {
  --accent:      #41a6f6;   /* Sweetie 16 "sky" — lib/artwork-core/create.ts:25 */
  --accent-soft: #41a6f626; /* 15% — hover fill on accent-tinted controls */
  --onaccent:    #0b0b0d;   /* 7.50:1 on the accent ✓ */
}
.light {
  --accent:      #1565b0;   /* same hue, darkened for a light ground */
  --accent-soft: #1565b01f;
  --onaccent:    #ffffff;   /* 5.97:1 ✓ */
}

/* shape: the lattice */
--r-sm: 2px;  --r-md: 4px;  --r-lg: 6px;  --r-xl: 8px;  --r-pill: 9999px;
```

Measured: `#41a6f6` is 7.50:1 on `#0b0b0d` and 7.01:1 on `#141417`; `#1565b0` is 4.88:1 on
`#e8e8ea` and 5.97:1 on `#ffffff`. Both pass G2 for text and icons.

The accent is not invented — it is `"sky"`, index 11 of the Sweetie 16 palette the product already
ships as its default document palette (`lib/artwork-core/create.ts:15-29`). The chrome and the
artwork are drawn from the same box of colours. It is deliberately not green, amber or red: those
three hues are spoken for by `--diff-add` / `--diff-change` / `--diff-remove`, so **colour in the
chrome means "Tessera" and the diff triad means "the AI touched this"**, and the two never collide.

**Where the accent is allowed:** focus ring, active tool background, the enabled Send button, the
loader, the selection marquee, the lifted tile in the logo, checked states. Nowhere else. It is a
state colour, not a decoration.

**Radii:** `--r-xl` drops 16 → 8, so the tool rail and composer stop reading as soft app-store cards
and start reading as tiles. Pill survives only where the control is genuinely a capsule: the zoom
bar, the segmented track, the colour swatch.

**Type:** Geist Sans for words. **Geist Mono for every number** — brush size, zoom level, cursor
coordinates, diff counts, palette index. Geist Mono is already loaded (`app/layout.tsx:3,37`) and
currently used by nothing.

**What it feels like to use:** opinionated and specific. Squarer, tighter, one confident colour.
Everything on screen looks like it is made of the same material as the thing you are drawing.

**Cost:** every radius token changes, so every component needs a visual pass; the accent needs three
states across two themes; the mono swap touches ~10 call sites. **~2–3 days.**

**What it risks:** hard radii plus a saturated blue reads *cheap* if the type and spacing are not
tightened at the same time. **This direction must ship together with §3, not after it** — half of it
is worse than none of it. Second risk: a single brand hue is a real commitment and narrows the
product's mood, which is usually the point but is not free.

### 2.C — "Source"

**One sentence:** "pixel art, code underneath" taken literally — the chrome is an instrument panel,
monospace and numeric, always showing exactly what the document is.

Surface ladder as 2.A. **No accent at all** — the chrome stays greyscale and the diff triad becomes
the *only* colour in the UI, so any colour outside the artwork always means "the AI changed
something". Radii go near-square: `--r-sm 2 / --r-md 3 / --r-lg 4 / --r-xl 6`.

**Type:** Geist Mono becomes the chrome face for all labels and numbers at 12/13px. Geist Sans is
kept only for the wordmark, AI prose and button labels.

**Structural addition:** a persistent 28px status bar on the bottom edge — `--panel`, 1px top
`--line`, Geist Mono 12px:

```
16×16   idx 04 #ef7d57   x 07  y 11   brush 1px square   45×   saved
```

Plus a 20px keycap treatment on every shortcut in every tooltip:
`linear-gradient(var(--panel2), var(--panel))`, `--r-sm`, `--line` hairline.

**What it feels like to use:** precise, dense, legible at a glance. Raycast / Warp / an
oscilloscope. The status bar makes the app feel alive for free, because it changes on every pointer
move.

**Cost:** the status bar is new surface but small; the mono swap is mechanical. **~2 days.**

**What it risks:** it reads cold. Pixel art's audience is at least half artists, and a grey
monospace instrument panel says "developer tool" loudly enough to turn some of them away. It
permanently spends 28px of canvas height, directly opposing D2. And with no accent it does not fix
D4 — it converts "no colour" from an accident into a doctrine, which is defensible, but it is a bet.

### Recommendation

**Take 2.B — Mosaic.** Adopt 2.C's status bar as §6 item 3 regardless of which direction wins;
2.A's surface ladder is already inside 2.B.

Reasoning: the complaint is *"something is missing … our own touch"*. 2.A is the category norm
executed well; it answers the flatness but not the identity. 2.C answers the identity but narrows
the audience and spends canvas height against D2. 2.B is the only option where the product name,
the logo, the artwork's own unit and the shipped default palette all say the same thing — and it is
the only one that gives the product a colour, which matters because D4 (no colour anywhere in the
chrome) is the single most measurable reason the screen reads as unfinished.

The honest cost of 2.B is that it is the most work and the one that fails worst if half-done.

---

## 3. Scale pass

The user said "a bit bigger". Applied naively that steals canvas area and makes the product worse.
Order of operations matters: **make the artwork bigger first, then the chrome, and only where the
chrome is below a floor.** §3.1 buys more area than §3.2 spends.

Floors: **24×24 CSS px** minimum hit target (WCAG 2.5.8 AA), **44×44** preferred for primary tools
(2.5.5 AAA), **12px** minimum text.

### 3.1 — The artwork (do this first)

Change `fitViewport` (`lib/editor/viewport.ts:55-64`):

1. **Fit is not restricted to `ZOOM_LADDER`.** Fit picks `floor(maxScale)` — any integer ≥ 1. The
   ladder stays for `nextScale` / `snapScale`, because *stepped* zoom must be predictable; fit does
   not step, it fits.
2. **Margins become asymmetric and derived from the real chrome**, not a single symmetric number:
   ```
   EDGE      = 16   // floating-chrome inset (§3.4)
   RAIL_W    = 64   // §3.2
   BOTTOM_H  = 60   // composer card height (pad 10 ×2 + row 40)
   GAP       = 16

   MARGIN_LEFT   = EDGE + RAIL_W + GAP = 96
   MARGIN_RIGHT  = EDGE + GAP          = 32
   MARGIN_TOP    = 24
   MARGIN_BOTTOM = EDGE + BOTTOM_H + GAP = 92
   ```
   `MARGIN_BOTTOM` exists so the composer and zoom pill never occlude the artwork's bottom corners.
   Under the old symmetric margin they would: a 44×30 corner of the user's drawing would sit under
   the composer card, and in a pixel editor you cannot edit pixels you cannot see.
3. The artwork is centred in the **available** rect, not in the canvas. Drop the reference's
   6px-above-centre offset (`VISUAL-SPEC.md` §8.3) — that is a bug we copied, not a design.

**Result** (16×16 document; header 56 per §3.2):

| Viewport | now | after §3.1 | after §3.1 + status bar (§6 item 3) |
|---|---|---|---|
| 1440×900 | 32× · 512² · 60% of short axis | **45× · 720² · 85%** | 43× · 688² · 84% |
| 1280×800 | 32× · 512² · 68% | **39× · 624² · 84%** | 37× · 592² · 83% |

At 1440×900 that is **+41% linear and +98% area**, and it lands on exactly the reference's 45× /
720×720 — arrived at from our own chrome dimensions rather than copied.

### 3.2 — Chrome

| Element | file:line | now | proposed | why |
|---|---|---|---|---|
| Header height | `Chrome.tsx:138` | 48 | **56** | A 40px control needs 56 to sit with 8px above and below. |
| Tool-rail button | `Chrome.tsx:362` | 44×44 | **52×52** | Primary target; clears the 44 AAA floor with margin. |
| Tool-rail icon | `Chrome.tsx:363` | 24 | **28** | Preserves the 12px optical inset. |
| Tool-rail card | derived (`Chrome.tsx:349`) | 56×392 | **64×456** | pad 6, gap 4, 8 buttons: `52+12` × `8·52 + 7·4 + 12`. |
| Header icon button | `Chrome.tsx:44` (`size = 36`) | 36×36 | **40×40** | Default control height. |
| Header icon glyph | `Chrome.tsx:44` (`icon = 20`) | 20 | **22** | |
| Brush ± buttons | `Chrome.tsx:199,204` | 28×28 / 16 | **32×32 / 18** | Small control height; clears 24 with room. |
| Brush pill | `Chrome.tsx:195` | h 36 | **h 40** | |
| Segmented track | `Chrome.tsx:224` | h 28 | **h 32**, segment h 26 | |
| Dither button | `Chrome.tsx:252` | h 28 | **h 32** | |
| Filename input | `Chrome.tsx:275` | 192×28 | **240×32** | 28 is under the control floor; 192 truncates ordinary names. |
| Wordmark | `Chrome.tsx:156` | 16/600 | **17/600**, `-0.4px` | |
| Zoom bar | `Chrome.tsx:392` | h 40 | **h 44** | |
| Zoom ± buttons | `Chrome.tsx:401,415` | 32×32 / 16 | **36×36 / 18** | |
| **Zoom level button** | `Chrome.tsx:409` | **48×16** | **56×36** | Currently fails WCAG 2.5.8. A bug fix, not a scale change. |
| Composer card | `AiComposer.tsx:47` | w 320 | **w 400**, pad 10 | 320 truncates the placeholder at 14px. |
| Composer row | `AiComposer.tsx:71` | h 36 | **h 40** | |
| Composer buttons | `AiComposer.tsx:78,114` | 32×32 | **36×36** | |
| Proposal card | `AiComposer.tsx:162` | w 420 | **w 460**, pad 16 | |
| Agent panel | `AgentPanel.tsx:33` | w 380 | **w 400** | Same slot as the composer; must match. |

**No dead zones in the rail.** The 4px `gap` between tool buttons (`Chrome.tsx:349`) becomes
`gap: 0` with each button gaining 2px of vertical padding inside its 52px box. The visual rhythm is
identical; the difference is that a pointer travelling down the rail is never over nothing. Same
rule for the zoom bar's `gap: 2` (`Chrome.tsx:392`) and the header's icon-button row.

Net chrome cost to the canvas: +8px height (header) and +8px left inset (rail). §3.1 returns 208px
of artwork.

**Optical over geometric.** Where a glyph is optically off-centre in its box — the Export arrow and
the CaretDown are both top-heavy — nudge by ±1px rather than trusting the bounding box. Record the
nudge in a comment so the next person does not "fix" it back.

### 3.3 — Type scale

Three scales, not one: chrome labels ≠ prose ≠ headings. Weights **400/500/600 only**.

| Token | px / line-height / weight | Used for |
|---|---|---|
| `--t-label-lg` | 14 / 20 / 500 | Default chrome label: filename, Share, brush size |
| `--t-label` | 13 / 18 / 500 | Secondary: segmented control, dither, zoom level |
| `--t-label-sm` | **12** / 16 / 500 | Tertiary: save status, diff counts, step-log rows |
| `--t-copy` | 14 / 20 / 400 | Prose: AI summary, errors, key-dialog body |
| `--t-copy-sm` | 13 / 18 / 400 | Secondary prose |
| `--t-mono` | 13 / 18 / 500 | 2.B and 2.C: all numerics, always `tabular-nums` |
| `--t-title` | 17 / 24 / 600, `-0.4px` | The wordmark only |

All 14 occurrences of 11px (`AiComposer.tsx:170,187,226`;
`AgentPanel.tsx:131,167,173,188,249,272,283,288,310,315,351`) move to `--t-label-sm`.

### 3.4 — Spacing scale

4px base, closed set: **4, 8, 12, 16, 24, 32, 48**. No other gap or padding value is permitted.
Current code uses 2, 6, 10 and 14 in ten places; each rounds to the nearest member. The edge inset
for floating chrome goes 12 → **16** on all four sides.

### 3.5 — What must not grow

- The **canvas**. §3.1 is the whole point. Any chrome change that drops the artwork's share of the
  short axis below **84% at 1440×900** or **82% at 1280×800** is rejected.
- The **1px grid line** and the **1px artwork edge**. They are 1 CSS px at every zoom and every DPR
  (`VISUAL-SPEC.md` §8.4) and that is what makes the artwork read as pixels.
- Below **1100px viewport width** the tool rail reverts to 44×44 / 24px icons and the header to
  48px. This is a large-viewport pass.

---

## 4. The loader

Three distinct loading situations, three answers. Two are not a spinner, and one is deliberately
nothing.

### 4.0 — Which situations get an indicator

| Situation | Duration | Treatment |
|---|---|---|
| Document mutation — brush, fill, undo, tool switch | < 5 ms, local, synchronous | **Nothing. Ever.** The document is in memory and `commit()` is synchronous; a loading affordance here would be a lie. |
| Autosave to IndexedDB | typically tens of ms | **Nothing that moves.** §6 item 12 replaces the shifting text with a fixed-width 3-state dot. A spinner here would flash on every stroke. |
| App boot → document ready | usually tens of ms, but unbounded on a cold profile or a large draft | **§4.1 — the boot mosaic**, gated so it never flashes. |
| AI proposal / agent turn | 2–10 s, network, rate-limited to 5 rpm | **§4.2 inline mark + §4.3 elapsed counter + §6 item 7 step log.** Past 1 s an indeterminate indicator alone is not enough — the user needs to know it is progressing, not hung. |

**This is where part of the request needs pushing back on.** "A proper animated loader" must not
become "loaders everywhere". The product's persistence story is local and instant; if a spinner
appears when you press the brush, the app has been made to *feel* slower while getting no slower.

### 4.1 — Boot loader: "the mosaic"

A tessera being set: a ripple expanding from one tile across a 5×5 canvas. Not a spinner — a
miniature of the thing the app renders.

**Geometry.** A CSS grid, 5 columns × 5 rows.

```
cell    = var(--cell)    = 10px
gap     = 1px            (the app's own grid line)
padding = 1px
total   = 5·cell + 4·gap + 2·padding = 5·10 + 4 + 2 = 56px
```

The container background is `--art-grid`; each cell's own background is `--art-bg`. The gaps *are*
gridlines — the loader is literally a 5×5 document at 10× zoom. The lit fill is `--accent` (2.B),
`--accent-live` or `--fg` (2.A), or `--fg` (2.C).

**Animation.** Manhattan distance from the centre cell `(2,2)`: `d = |x−2| + |y−2|`, `d ∈ 0..4`
(ring sizes 1, 4, 8, 8, 4 = 25 ✓). **8 frames × 90 ms = 720 ms** loop.

At frame `t ∈ 0..7`, the cell at distance `d` has opacity:

| condition | opacity |
|---|---|
| `d == t` | **1.00** |
| `d == t − 1` | **0.45** |
| `d == t − 2` | **0.18** |
| otherwise | **0** |

This table is the authoritative definition. Rendered, with `#` = 1.00, `+` = 0.45, `-` = 0.18,
`·` = 0 (frame 7 is fully empty — the rest beat):

```
  f0        f1        f2        f3        f4        f5        f6        f7
 ·····     ·····     ··#··     ·#+#·     #+-+#     +-·-+     -···-     ·····
 ·····     ··#··     ·#+#·     #+-+#     +-·-+     -···-     ·····     ·····
 ··#··     ·#+#·     #+-+#     +-·-+     -···-     ·····     ·····     ·····
 ·····     ··#··     ·#+#·     #+-+#     +-·-+     -···-     ·····     ·····
 ·····     ·····     ··#··     ·#+#·     #+-+#     +-·-+     -···-     ·····
```

**Implementation** — 25 elements, one keyframe, no JS beyond setting `--d` per cell:

```css
@keyframes tessera-ripple {
  0%    { opacity: 1 }
  12.5% { opacity: .45 }
  25%   { opacity: .18 }
  37.5% { opacity: 0 }
  100%  { opacity: 0 }
}

.tessera-loader {
  display: grid;
  grid-template-columns: repeat(5, var(--cell, 10px));
  grid-auto-rows: var(--cell, 10px);
  gap: 1px;
  padding: 1px;
  background: var(--art-grid);
  color: var(--accent);
}
.tessera-loader i { position: relative; background: var(--art-bg) }
.tessera-loader i::after {
  content: ''; position: absolute; inset: 0;
  background: currentColor;
  opacity: 0;                                 /* the resting state, held during the delay */
  animation: tessera-ripple 720ms step-end infinite;
  animation-delay: calc(var(--d) * 90ms);     /* --d is 0..4, set per cell */
}
```

`step-end` is what makes it read as pixel art rather than as a fade: each value holds for a whole
frame and then snaps, exactly like a sprite sheet advanced by `steps()`. No interpolation, ever.

The positive `animation-delay` against a resting `opacity: 0` means the outer rings stay dark for
the first 360 ms of the first loop. That reads as a wind-up and is desirable; from loop 2 the rings
are in phase.

**Where it appears.** Centred in `<main>`, at the position the artwork will occupy, with the
wordmark 16px below in `--muted`. It replaces the empty `<main>` of D9.

**Anti-flash gate (required).** Under ~200 ms a loader is worse than nothing:

```css
@keyframes tessera-loader-in { from { opacity: 0 } to { opacity: 1 } }
.tessera-loader { animation: tessera-loader-in 120ms 200ms var(--ease-out) both }
```

`both` plus the 200 ms delay means nothing is painted for the first 200 ms. If the document
resolves before then the user sees no loader at all — the correct outcome, not a missed
opportunity.

**Minimum visible time (also required).** Once shown, the loader stays for at least **400 ms** even
if the document arrives at 210 ms — otherwise the gate merely moves the flash later instead of
removing it. Two numbers, both mandatory: **show-delay 200 ms, minimum-visible 400 ms.**

**Markup.** 25 `<i>` elements, each with `style={{ ['--d' as string]: Math.abs(x-2) + Math.abs(y-2) }}`.
That is the only JS in the loader.

**Reduced motion:** cells do not animate. The loader renders **static** with rings 0 and 1 at full
opacity — a five-cell plus — and the label `Loading…` in `--muted` beside it. The affordance
survives; only the movement is removed. See §5.4.

### 4.2 — Inline mark: "the turn"

For the Send button while an AI request is in flight (`AiComposer.tsx:120`, `AgentPanel.tsx:126`).
This one is **the logo, moving** — the four tesserae of `Chrome.tsx:315-329`, with the lifted tile
travelling clockwise.

```
cell 7px · gap 2px · total 16px    (exactly replaces the 16px ArrowUp glyph)
4 frames × 150 ms = 600 ms loop
grid order:  TL(--i:0)  TR(--i:1)
             BL(--i:3)  BR(--i:2)
```

```css
@keyframes tessera-turn {
  0%   { opacity: 1 }
  25%  { opacity: .3 }
  100% { opacity: .3 }
}
.tessera-turn i {
  background: currentColor;
  opacity: .3;
  animation: tessera-turn 600ms step-end infinite;
  animation-delay: calc(var(--i) * 150ms);
}
```

**Accessibility:** do **not** replace the button's children with a bare spinner node. The button
keeps its identity, gains `aria-busy="true"`, keeps `aria-label="Working"`, and stays focusable;
the mark goes inside it. `AiComposer.tsx:110-121` currently swaps the child and never sets
`aria-busy` — fix both. Same at `AgentPanel.tsx:115-127`.

**Reduced motion:** static, top-left tile lit; the state is carried by `aria-busy` and §4.3.

### 4.3 — Elapsed counter, for the AI only

AI turns run 2–10 s and are rate-limited to 5 rpm, so an indeterminate mark alone leaves the user
unable to tell "slow" from "hung". Next to the inline mark, in `--t-mono` / `--muted`:

```
Thinking… 3s                      at t ≥ 1000 ms, updated once per second, tabular-nums
Still working… 12s                at t ≥ 10000 ms
Rate-limited — retrying in 41s    on 429, counting down
```

One `setInterval(1000)`, cleared on settle. Highest value per line in the whole of §4.

### 4.4 — What has no loader

Saving, undo, redo, tool switch, zoom, pan, palette change, grid toggle, theme toggle, file
download. All local and synchronous. Adding an indicator to any of them is a regression.

---

## 5. Motion system

The governing rule is **frequency, not taste**. An interaction that happens 100+ times an hour gets
no animation at all — animation on a repeated action is a tax paid every repetition.

### 5.1 — Tokens

```css
:root {
  --dur-0: 0ms;      /* instant — anything the user does more than ~20×/hour */
  --dur-1: 100ms;    /* hover fills, press, colour changes */
  --dur-2: 150ms;    /* tooltips, popovers, dismissals */
  --dur-3: 200ms;    /* proposal-bar swap, panel enter, toasts — the ceiling */

  --ease-out:    cubic-bezier(0.23, 1, 0.32, 1);   /* enter and exit — the default */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* on-screen movement */
  --ease:        cubic-bezier(0.4, 0, 0.2, 1);     /* colour only (existing) */
}
```

`--dur` (`globals.css:75`) is retired; its two call sites (`globals.css:118-121`) move to `--dur-1`.

**Ceiling: 200 ms.** Nothing animates longer, with two named exceptions: the two loaders (which
loop) and the diff reveal of §6 item 5 (one 300 ms pass, once per proposal).

The ceiling is not fashion. Nielsen's thresholds put **0.1 s** as the limit at which an interface
still feels like *direct manipulation* rather than a response, and that is the governing constraint
for a canvas tool where a stroke is a continuous gesture — not the 1 s "flow of thought" limit or
Doherty's 400 ms. Rauno Freiberg's interface guidelines state the same ceiling from the other
direction: *"Animation duration should not be more than 200ms for interactions to feel immediate."*
Everything above 200 ms in Material 3's `long*` and `extra-long*` ranges (450–1000 ms) and IBM
Carbon's *expressive* set is designed for phone screen transitions and marketing surfaces. Carbon's
**productive vs expressive** split is the right frame: this product is productive everywhere.

**Never `ease-in` on UI.** Never spring, bounce or overshoot — in a tool, overshoot reads as the
interface losing control of the element. Scaling is also one of the five named vestibular triggers,
so scale is capped at Rauno's proportional range (**0.96–0.9** for a press, **0.97** for a
dismissal), never 1 → 0.8.

**Only compositor and paint properties:** `transform`, `opacity`, colour. Never `width`, `height`,
`margin`, `padding`, `top`/`left`. **Never `transition: all`** — list the properties.

**Animations must be interruptible.** Anything running when the user acts again is cancelled, not
queued.

### 5.2 — Asymmetry: appearance is free, dismissal is graceful

Anything summoned by a direct user action appears at `--dur-0` (instantly) and leaves over
`--dur-2` with `opacity` + `scale(0.97)`. Popovers, tooltips, the palette, menus. Waiting 150 ms to
see the thing you just clicked is the most common way a tool feels slow.

Exception: surfaces that appear *without* a click — the proposal bar, the error row, step-log
entries — enter over `--dur-3`, because an unrequested change of state must be perceived as
arriving rather than as having always been there.

### 5.3 — The table

| Thing | Property | Duration | Easing |
|---|---|---|---|
| Button / tool hover fill | `background-color` | `--dur-1` | `--ease` |
| Button press | `transform: scale(0.97)` | `--dur-1` | `--ease-out` |
| Tool-rail active swap | `background-color`, `color` | `--dur-1` | `--ease` |
| Tool-icon confirm pop (§6 item 11) | `transform: scale(1 → 1.12 → 1)` | 120 ms total | `--ease-out` |
| Palette popover in | — | `--dur-0` | — |
| Palette popover out | `opacity`, `scale(1 → .97)` | `--dur-2` | `--ease-out` |
| Palette swatch stagger (§6 item 13) | `opacity`, `translateY(3px → 0)` | 90 ms each, 6 ms apart, cap 16 | `--ease-out` |
| Composer → proposal bar | `opacity` cross-fade | `--dur-3` | `--ease-out` |
| Step-log row in | `opacity`, `translateY(3px → 0)` | `--dur-3` | `--ease-out` |
| Toast / notice in | `opacity`, `translateY(6px → 0)` | `--dur-3` | `--ease-out` |
| **Theme change** | — | **`--dur-0`** | — |
| Focus ring | `box-shadow` | `--dur-0` | — |

**Theme change is instant and suppresses every other transition while it happens.** `toggleTheme`
(`Chrome.tsx:121-132`) sets a `.theming` class on `<html>` for one frame; `html.theming * {
transition: none !important }`. Cross-fading a whole screen of tokens repaints every element at
once and reads as jank, not polish. This corrects an earlier draft of this spec which had it at
`--dur-3`.

**Popovers open on `pointerdown`, not `click`** — `Chrome.tsx:170` and `PalettePopover` currently
open on `onClick`, which waits for the release. On a mousedown-open menu the panel is already there
when the finger lifts.

`AgentPanel.tsx:189` currently uses `.18s var(--ease)` for the step row — retarget to `--dur-3`
`--ease-out`.

### 5.4 — `prefers-reduced-motion`, per element

The current blanket rule (`globals.css:158-165`) is wrong: `animation-duration: 0.01ms !important`
on `*` freezes the loader, which is the one animation that carries information. Replace it with an
explicit policy — no `*` selector.

| Element | Reduced-motion behaviour |
|---|---|
| Hover fills, colour transitions | **Unchanged.** Colour is not motion and it aids comprehension. |
| Button press `scale(0.97)` | Becomes a `--hover` background flash at `--dur-1`. |
| Tool-icon confirm pop | Removed entirely. The colour swap already carries it. |
| Popover / panel `scale` + `translate` | `transform` dropped; `opacity` cross-fade kept at `--dur-2`. |
| Step-log row entry | `translateY` dropped; `opacity` kept. |
| **Boot mosaic (§4.1)** | Animation off. Static five-cell plus (rings 0–1) + the text `Loading…`. |
| **Inline turn mark (§4.2)** | Animation off. Static, top-left tile lit; state carried by `aria-busy`. |
| **Elapsed counter (§4.3)** | **Unchanged, and now load-bearing** — it is the only progress signal left. |
| Diff reveal (§6 item 5) | The 300 ms pass is skipped; the overlay draws at final opacity immediately. |
| **Canvas pan, zoom, brush stroke** | **Unchanged.** These are user-driven direct manipulation, not animation — the user sets the speed frame by frame. Removing them would break the tool without helping anyone. |
| Selection marquee (when the marquee tool ships) | The marching-ants loop **freezes to a static dashed border.** Looping motion in the periphery is a named vestibular trigger, and it is the one animation in a canvas app that runs continuously. |

The guiding principle is **reduce, don't remove**: only the five known vestibular triggers — scaling,
spinning, parallax, plane-shifting, and peripheral looping motion — need to go. Colour transitions
and instant state changes stay.

**Implementation caution.** Where a per-element rule sets `animation: none`, any JS awaiting
`animationend` will never resolve. Prefer `animation-duration: 0.01ms` (which still fires the event)
for anything with a JS listener, and reserve `none` for purely decorative rules. The blanket rule
being replaced used `0.01ms` for exactly this reason; do not lose that property while removing the
`*` selector.

`AgentPanel.tsx:463` currently kills `tessera-step-in` via an attribute-substring selector
(`[style*="tessera-step-in"]`). That works only because the animation is inline; it must move into
`globals.css` against a real class when the panel is restyled.

**Test (rule 9):** a vitest case asserting that `globals.css` contains no `prefers-reduced-motion`
block whose selector list includes `*`, and that every rule inside such a block which sets
`animation: none` also has a sibling rule revealing the static label. Otherwise the app silently
loses its only "we are working" signal.

### 5.5 — Focus

Replace `globals.css:151-156` entirely. The current rule sets `border-radius: inherit`, which
mutates the focused element's geometry (D11).

```css
:root { --focus-ground: var(--surface) }   /* overridden inline on children of a --panel card */

:focus { outline: none }
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-ground), 0 0 0 4px var(--accent);
}

/* box-shadow is not painted in forced-colors mode — fall back to a real outline */
@media (forced-colors: active) {
  :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; box-shadow: none }
}
```

The double ring — a ground-coloured buffer inside the accent ring — is required here specifically
because in a pixel editor the ring can land on a palette swatch that is *the same colour as the
accent*, and a single ring would vanish. A custom property rather than a utility class, because the
codebase styles inline and the only existing class is `.tabular`. Meets WCAG 2.4.11: ≥2px
perimeter, ≥3:1 against the adjacent colour on both sides.

Gate hover so touch does not leave stuck states:

```css
@media (hover: hover) and (pointer: fine) { /* all :hover rules */ }
```

### 5.6 — What deliberately does not animate

Canvas contents. The brush cursor rect. Zoom. Pan. Undo/redo. The tool-rail active indicator's
*position* — it swaps colour, it does not slide, because a 150 ms slide behind a `B`/`E`/`F`
keystroke reads as lag. The palette swatch selection ring. The document, at any time, for any
reason.

---

## 6. Lively elements, ranked by impact per unit of effort

Effort: **S** ≤ 2 h · **M** ≤ 1 day · **L** > 1 day. Implement top-down; the list is ordered so
that stopping anywhere still leaves a coherent product.

| # | Element | Effort | What it is |
|---|---|---|---|
| **1** | **Fit-zoom fix (§3.1)** | **S** | Artwork +41% linear, +98% area. Highest impact in the spec, and ~15 lines in `viewport.ts`. |
| **2** | **Artwork separation (§2, G1)** | **S** | Shell moves by ΔL\* 8; the artwork gains a real edge and, in light mode, a four-band renderer shadow. Fixes D1. |
| **3** | **Live status bar** | **M** | 28px bottom bar in `--t-mono`: `16×16 · idx 04 #ef7d57 · x 07 y 11 · 1px square · 45× · saved`. Cursor coords already exist in `useEditorStore.cursor` (`Canvas.tsx:210`). It updates on every pointer move, so the app stops being static the moment the mouse enters the canvas. Costs 32px of artwork against §3.1's 208px gain — a 6× trade. Adopt regardless of direction. |
| **4** | **Press states (§5.3)** | **S** | `:active { transform: scale(0.97) }` on every button. Currently there is none (D7). Requires moving `GlyphBtn` (`Chrome.tsx:43-95`) off React hover state onto real CSS `:hover`/`:active`, which also removes a re-render per pointer move. |
| **5** | **The two loaders (§4.1, §4.2) and the boot state (D9)** | **M** | Asked for by name. Includes the diff-reveal pass: on entering review, the three diff colours ramp `0 → 0.6` alpha over 300 ms once, so the change announces itself instead of appearing to have always been there. |
| **6** | **Elapsed counter (§4.3)** | **S** | Turns "is it hung?" into "3s". Highest value per line in the AI flow. |
| **7** | **Mount `AgentPanel`, restyle its step log** | **M** | `components/AgentPanel.tsx` is complete and imported by nothing (D11). Rows enter over `--dur-3` with a 3px rise; the per-row `--diff-add` / `--diff-remove` dot already exists (`AgentPanel.tsx:196`). The largest "the product does something" win available, and most of the work is already done. |
| **8** | **Cursor treatment** | **M** | `renderCursor` (`canvas.ts:214-229`) draws a 2px `--accent` rect. Replace with: the brush footprint filled at the current palette colour at `globalAlpha 0.35`, plus a 1px two-tone outline (`--fg` inner, `--art-bg` outer) so it stays visible on any artwork colour. The eyedropper shows a 1-cell swatch of what it will pick. The fill tool outlines the flood region on hover, gated behind **hover-intent: fire only if the pointer moves &lt; 6 px between 100 ms polls** (the established default) — recomputing flood fill per pointer move is fine at 16×16 and is not at 512×512. Set `cursor: none` over the artwork whenever the on-canvas preview is drawn (`globals.css:143` currently forces `crosshair`), so there are never two cursors. **The preview is drawn into the canvas, not as a CSS cursor**, because Chrome scales any custom cursor over 64 DIP down and Firefox/Safari drop anything over 128 px — a brush preview that must scale with zoom cannot survive as a `cursor:` image. Aseprite's shipped convention is an *inverting* cursor colour; the two-tone outline is chosen instead because it is deterministic and stays correct against a mid-grey artwork, where inversion approaches invisibility. |
| **9** | **Focus rings (§5.5)** | **S** | Correctness; the keyboard path currently looks broken. |
| **10** | **Grid: alpha value + fade-in** | **S** | Two changes. (a) `--art-grid` becomes an alpha overlay (`#00000014` light / `#ffffff14` dark) instead of opaque `#ededed` / `#2a2a30`, so it stops cutting hard lines through painted pixels at high zoom (D11). (b) `GRID_MIN_SCALE = 6` (`canvas.ts:45`) is a **binary on/off**, which reads as broken — the grid pops into existence at one zoom step. Aseprite, Pixelorama and Piskel all independently gate on on-screen cell size and all **ramp alpha** instead. Adopt Aseprite's shape: nothing below 4×, then `alpha = base × (scale − 4) / (16 − 4)` clamped to 1, so the grid is fully opaque from 16× up. Keep 1px. Keep no major lines — that was measured, not assumed (`canvas.ts:36-44`). |
| **11** | **Tool-switch confirm pop** | **S** | 120 ms `scale(1 → 1.12 → 1)` on the newly-active tool's *icon only*. Confirms keyboard tool switches (`page.tsx:76-95`), which currently produce no acknowledgement at the point of attention — the eye is on the canvas, not the rail. |
| **12** | **Save-status dot (D10)** | **S** | Fixed 16px slot, three states: `--muted` hollow ring (saving), `--diff-add` dot (saved; fades to `--faint` after 2 s), `--diff-remove` dot (failed, keeping the existing escape hatch). No layout shift, no text on a timer. |
| **13** | **Palette popover stagger** | **S** | 6 ms per swatch, capped at 16 swatches / 96 ms total. Cheap delight in the one place the product is unambiguously about colour. |
| **14** | **Logo motion** | **S** | On hover, the wordmark's four tesserae (`Chrome.tsx:315-329`) run exactly **one** cycle of `tessera-turn` (§4.2) — 600 ms, once, not looping. The loader and the logo being the same animation is what makes it read as a mark rather than a decoration. |
| **15** | **Empty states** | **M** | (a) A blank document shows a `--muted` 12px hint centred under the artwork: `Pick a colour and draw — or ask the AI.` (b) The `notice` toast (`page.tsx:136-148`) gets the §5.3 entry motion. (c) Disabled tools (D3). **Not a tooltip** — a `disabled` button is not in the tab order, so its tooltip is never announced and is unreachable by keyboard. Either drop `disabled` and use `aria-disabled` + a click handler that shows an inline "not built yet" line in the rail, or remove the buttons entirely. See §8, question 4. |
| **16** | **Keycaps in tooltips** | **S** | Every `title` on an *enabled* control becomes a real tooltip with a 20px keycap: `Brush` `[B]`. Timing: **700 ms delay on the first tooltip in a group, 0 ms for subsequent peers** while the pointer stays inside the group. The keyboard model is currently discoverable only by reading `page.tsx:76-95`. |

### 6.17 — Enforcement (must ship in the same change, rule 9)

There is no linter (D11), so rule 8 is unenforced. Add two vitest cases:

1. Read every `.tsx` under `components/` and `app/`; fail on `/#[0-9a-fA-F]{3,8}\b/` outside
   `components/icons.tsx` path data.
2. Parse `app/globals.css` for every declared custom property, collect every `var(--…)` reference
   in `.tsx`, and fail on a reference with no declaration. This is the failure mode that silently
   produces `currentColor` or `unset` instead of an error, and it is exactly how `docs/specs/02`'s
   dead vocabulary would have leaked back in.

---

## 7. What not to do

Each of these is tempting, and each would actively make an hour-long tool worse.

1. **No spinner on any local operation** — saving, undo, tool switch. See §4.4. A loading indicator
   on a 3 ms operation makes the app feel slower than no indicator at all.
2. **No animated background behind the canvas.** Aurora, gradient mesh, flickering grid, retro grid,
   meteors, particles. The artwork is the only thing on screen allowed to have colour and movement.
   Anything behind it competes with the exact thing the user is trying to judge, and colour
   judgement is the core task of a pixel editor. This rules out most of what 21st.dev, Aceternity
   UI and Magic UI exist to provide.
3. **No border-beam / shine-border / shimmer on cards.** A 6 s looping gradient sweep on the tool
   rail becomes visual tinnitus by minute three.
4. **No spring, bounce or overshoot**, including overshoot easing curves. In a tool, an element that
   overshoots reads as the interface being surprised.
5. **No cursor trails, paint particles or ripple-on-click over the canvas.** The canvas is where
   1-pixel decisions are made. Anything drawn there that is not the document or a precise preview
   is noise.
6. **No typewriter, text-scramble or staggered reveal on the AI summary** (`AiComposer.tsx:163`).
   That text is the evidence the user needs to choose Accept or Reject. Delaying it delays the
   decision and invites accepting before reading.
7. **No confetti or celebration on Accept.** It is a routine action performed many times per
   session; celebration on a repeated action is condescending by the third time.
8. **No skeleton screens.** The app is one canvas and a toolbar; a skeleton would be drawing a fake
   toolbar over a real one. §4.1 is honest about what is happening.
9. **No sliding "magic" indicator on the tool rail.** Tools are switched by keyboard as often as by
   click. See §5.6.
10. **No sound.**
11. **No `backdrop-filter` on the tool rail or zoom bar** (`Chrome.tsx:352,395`). They exist because
    the reference has them. On the reference the backdrop is a static white page; here the artwork
    pans underneath, so the rail's contrast changes as the user works and can drop below G2 without
    warning. Replace with opaque `--panel` plus the §2 hairline. Keep the 8px blur on the header
    only (`Chrome.tsx:141`), where the backdrop is `--surface` in practice.
12. **Do not install `framer-motion`, `motion`, or any component library.** Everything specified
    here is CSS plus roughly 40 lines of JS: the elapsed counter, the loader's per-cell `--d`, and
    the hover-intent timer. `motion` is ~34 kB gzipped to buy transitions we have explicitly capped
    at 200 ms and restricted to `transform`/`opacity` — precisely the set CSS already runs on the
    compositor. Nothing on 21st.dev, Aceternity or Magic UI can be dropped in regardless: all three
    are authored as React + Tailwind class strings, and this codebase styles inline. If a future
    feature needs layout-aware or gesture-driven animation, that is the moment to reopen this, and
    the justification has to name the feature.
13. **Do not animate the theme-toggle icon.** It fires rarely and the whole screen already
    cross-fades (§5.3); two motions for one action.
14. **Do not make the chrome bigger than §3.2.** "A bit bigger" is bounded by §3.5: the artwork's
    share of the short axis must stay ≥ 84% at 1440×900 and ≥ 82% at 1280×800.
15. **Do not remove `@import 'tailwindcss'` (`globals.css:1`) as part of this change.** It is dead
    weight (D11) and worth removing, but its preflight currently supplies the UA-reset defaults that
    the inline-styled components sit on top of. Removing it is its own unit with its own visual
    regression pass, not a footnote in this one.

---

## 8. Open questions for the direction review

1. **§2 — which direction.** Nothing in §3–§7 depends on the answer except the accent tokens and
   the radii, both isolated to `app/globals.css`.
2. **§3.2 — header 48 → 56** costs 8px of canvas height at every viewport, and the status bar costs
   another 28. §3.1 returns 208px. Confirm the trade, or hold the header at 48 and take only the
   control-height changes inside it.
3. **§6 item 3 — the status bar is permanent surface.** It is the largest liveliness win per unit of
   effort and the largest permanent canvas cost in the spec. Alternative: auto-hide it when the
   pointer leaves the canvas. Cheaper on space, worse on liveliness.
4. **D3 — the dead controls.** Out of scope here, but no amount of §3–§7 will make the product look
   finished while 3/8 of the tool rail and 4/8 of the top-bar right group are greyed out. The
   options are build them, hide them, or move them behind an affordance that is honest rather than
   broken-looking. A tooltip is **not** one of the options (§6 item 15). This needs its own
   decision and probably its own spec.

### Adjacent findings — not this spec, but do not lose them

Surfaced while researching this one. Each is a real defect in `Canvas.tsx` / `canvas.ts` that
affects how the product *feels* without being a visual-identity question.

- **`Canvas.tsx:191-224` does not use `PointerEvent.getCoalescedEvents()`.** Browsers throttle
  `pointermove` to one event per frame; every intermediate position in a fast stroke is discarded.
  `linePoints()` interpolation (`Canvas.tsx:217`) papers over this with straight segments, which is
  why fast curves come out faceted. This is the single largest stroke-quality win available.
- **`resizeCanvas` (`canvas.ts:63-80`) caps DPR at 2 and sizes from `getBoundingClientRect()`.**
  On fractional device pixel ratios the CSS-px box and the device-px box disagree by a fraction,
  which puts Moiré into the 1px grid. The fix is a `ResizeObserver` with
  `{ box: ['device-pixel-content-box'] }` reading `devicePixelContentBoxSize[0]`, with the current
  path as the Safari fallback.
- **`Canvas.tsx:80` requests `getContext('2d', { alpha: false })` while `canvas.ts:77` requests
  `{ alpha: true }`.** Only the first call's attributes take effect, so `alpha: true` wins and the
  behaviour is correct — but the two lines contradict each other and the next person to read them
  will believe the wrong one.
- **`Canvas.tsx:251-260` handles `wheel` without checking `e.ctrlKey`.** A trackpad pinch arrives
  as a wheel event with `ctrlKey === true`; treating it as a scroll makes pinch-zoom feel wrong.
  `deltaMode` is also unhandled — mouse wheels report lines or pages, not pixels.
