# Tessera — UI audit

**Date:** 2026-08-11 · **Build:** `aa8ed3c` ("Add the agent panel, and a guard for silently
broken design tokens") · **Server:** `next dev` (Next 16.3.0, Turbopack) on `localhost:3000`

**Trigger:** the user's report — *"the page idk why doesnt look that great … our site doesnt
look that great .. and the icons and overall everything should be a bit bigger"*.

Everything below is a measured number or a screenshot taken during this audit. Nothing is
read off the source alone. Reproduce with:

```
npx tsx tools/audit-ui.ts        # geometry + computed styles + contrast + tab order, 4 bps x 2 themes
npx tsx tools/sample-box.ts <png> "<label>,<x>,<y>,<w>,<h>,<bgX>,<bgY>"   # real rendered-pixel contrast
npx tsx tools/probe-focus.ts     # focus ring, canvas focusability, toolbar arrow keys
npx tsx tools/probe-load.ts      # load timeline
npx tsx tools/probe-390tab.ts    # header scroll-on-focus at 390
```

Raw data: `docs/research/ui-audit-data.json`. Screenshots: `docs/shots/audit/`.
Reference spec: `docs/research/newt/VISUAL-SPEC.md`; reference raw data:
`docs/research/newt/dom-tree.json`, `responsive.json`, `canvas-geometry-breakpoints.json`.

---

## 0. Verdict

**(c) — both, but the two halves are very unevenly sized, and they are not the halves you'd
guess.**

The chrome is **faithful to the sub-pixel**. Tool rail, zoom pill, brush-size pill, segmented
control, dither button, filename input and every icon button match the measured reference
exactly — not approximately, exactly, including the reference's own odd half-pixel vertical
offset (§1.2). We did not drift on layout.

We drifted in exactly **three** places, and two of them are the ones you actually see:

| Drift | Where | Size of the effect |
| --- | --- | --- |
| **D1 — the artwork renders 29 % smaller than the reference** | `lib/editor/viewport.ts:9,55` | 514 px vs 722 px at 1440×900. Area −49 %. |
| **D2 — a third of the chrome renders at 1.4–2.0 : 1 contrast** | `components/Chrome.tsx:89` + 9 `disabled` call sites | 6 of 16 header controls and 3 of 8 tools are near-invisible ghosts |
| **D3 — the artwork backdrop is a theme token** | `app/globals.css:26,49` + `lib/renderer/canvas.ts:108` | in dark mode the document's darkest palette colour renders at **1.005 : 1** — literally invisible |

Everything the user described as "too small" is explained by D1 (the drawing) plus the fact
that the reference's chrome **is** small and we copied it precisely. On the chrome, the honest
finding is: *we are faithful, and the reference doesn't hold up at our scale.* That is a design
decision to take, not a bug list — §4 quantifies how much bigger, and against what.

And the reference genuinely does not hold up below 1280: it breaks at 768 (the reference's own
gotcha G1) and we have no mobile tree at all, so 390 is worse for us than for them (§3).

**One correction to the spec, per CLAUDE.md rule 10.** `VISUAL-SPEC.md` §6.1 lists the header
children at `y = 6`. The unrounded reference data in `dom-tree.json` says **`y = 5.5`**
(`117.13, 5.5`, `157.13, 5.5`, `203.13, 5.5`). §6.1's table was built from the rounded
`responsive.json`. We render at 5.5 too, so we match — but the spec should say 5.5, because
"6" made our correct output look like a defect. Fix noted as **P4** in §7.

---

## 1. Fidelity table — 1440 × 900, light

Spec column = `VISUAL-SPEC.md` §6. Ours = measured this run
(`ui-audit-data.json → ["1440x900-light"].inventory`).

### 1.1 Tokens, shape, elevation — all exact

| Property | Spec (§3.1, §5) | Ours | Δ |
| --- | --- | --- | --- |
| `--surface` / `--panel` / `--panel2` light | `#f4f4f5` / `#ffffff` / `#f1f1f4` | `#f4f4f5` / `#fff` / `#f1f1f4` | ✓ |
| `--fg` / `--muted` / `--faint` light | `#18181b` / `#71717a` / `#a1a1aa` | identical | ✓ |
| `--line` / `--hover` light | `#0000001a` / `#0000000d` | identical | ✓ |
| `--accent` / `--onaccent` light | `#18181b` / `#ffffff` | identical | ✓ |
| all ten tokens, dark | §3.1 dark column | identical | ✓ |
| radii | 4 / 8 / 12 / 16 / 9999 | 4 / 8 / 12 / 16 / 9999 | ✓ |
| S3 `shadow-sm` | `0 1px 3px 0 …,0 1px 2px -1px …` | identical | ✓ |
| S4 tool rail / zoom | `0 0 0 1px …, 0 1px 3px 0 …, 0 1px 2px -1px …` | identical | ✓ |
| S5 composer | `0 0 0 1px …, 0 10px 15px -3px …, 0 4px 6px -4px …` | identical | ✓ |
| header bg | `#FFFFFF/80` + `blur(8px)` | `color(srgb 1 1 1 / 0.8)` + `blur(8px)` | ✓ |
| tool rail / zoom bg | `#FFFFFF/90` + `blur(8px)` | `color(srgb 1 1 1 / 0.9)` + `blur(8px)` | ✓ |
| font | Geist, root 16 px, antialiased | Geist (`geist` pkg), 16 px, antialiased | ✓ |

Five tokens referenced by the old composer (`--fg-muted`, `--fg-faint`, `--surface-2`,
`--shadow-1`, `--accent-fg`) resolved to the **empty string** in the run at 09:35. They were
removed by commit `aa8ed3c` mid-audit and now resolve correctly — see §6.9 for the standing
risk.

### 1.2 Top bar geometry

| # | Element | Spec x,y w×h | **Ours** x,y w×h | Δ | Verdict |
| --- | --- | --- | --- | --- | --- |
| — | `<header>` | 0,0 1440×48 | 0,0 1440×48 | 0 | ✓ |
| 1a | File button | 12,**5.5** 101.13×32 | 12,5.5 **118.48**×32 | **+17.35 w** | wordmark width — see note |
| 1b | logo box | 16,11.5 24×24 | 16,11.5 24×24 | 0 | ✓ |
| 1c | wordmark | 46,11.5 39.13×24 | 46,11.5 **56.48**×24 | **+17.35** | "Tessera" is 4 glyphs longer than "Newt" |
| 1d | CaretDown | 91,15.5 16×16 | **108.48**,15.5 16×16 | +17.48 x | knock-on of 1c |
| 2 | Settings | **117.13**,5.5 36×36 | **136.48**,5.5 36×36 | +19.35 x | knock-on |
| 3 | Colour | 159.13,5.5 36×36 | 180.48,5.5 36×36 | +21.35 x | knock-on |
| 3a | swatch | 165,11.5 24×24 | 186.48,11.5 24×24 | +21.48 x | ✓ size |
| 4a | brush-size pill | 203.13,5.5 **149**×36 | 226.48,5.5 **149**×36 | +23.35 x | ✓ size |
| 4a1 | Smaller brush | 209,9.5 28×28 | 232.48,9.5 **28×28** | — | ✓ size |
| 4a2 | "1px" | 241,13.5 32×20 | 264.48,13.5 **32×20** | — | ✓ |
| 4a4 | divider | 311,13.5 1×20 | 334.48,13.5 **1×20** | — | ✓ |
| 4a5 | toggle btn | 318,9.5 28×28 | 341.48,9.5 **28×28** | — | ✓ size, wrong behaviour (D9) |
| 4b | segmented track | 360,9.5 **120.44**×28 | 383.48,9.5 **120.44**×28 | — | ✓ exact |
| 4b1 | "Square" active | 362,11.5 **60.23**×24 | 385.48,11.5 **60.23**×24 | — | ✓ exact |
| 4b2 | "Round" | 422,11.5 **56.20**×24 | 445.72,11.5 **56.20**×24 | — | ✓ exact |
| 4c | Dither: Solid | 489,9.5 **86.53**×28 | 511.92,9.5 **86.53**×28 | — | ✓ exact |
| 4c1 | dither swatch | 499,15.5 16×16 | 521.92,15.5 **16×16** | — | ✓ |
| 4c3 | CaretDown 12 | 555,17.5 12×12 | 578.45,17.5 **12×12** | — | ✓ |
| 5a | filename input | **624**,9.5 192×28 | **624**,9.5 **192×28** | **0** | ✓ exact |
| 6 | right group | 1118,5.5 310.19×36 | 1099.69,5.5 328.31×36 | +18 w | different content (ours has Undo/Redo/Saved, no Sign-in) |
| 6b–6e | icon buttons | 36×36, icon 20×20 | 36×36, icon 20×20 | 0 | ✓ |

**The only geometric drift in the top bar is the wordmark being 17.35 px wider**, which pushes
the whole left group right by the same amount. Every fixed-size control matches to two
decimal places. That has one real consequence at 1280 — see §3.1.

### 1.3 Tool rail — exact, every number

| Property | Spec §6.2 | Ours | Δ |
| --- | --- | --- | --- |
| outer / card | 12,278 56×392 | 12,278 56×392 | 0 |
| padding / gap / radius | 6 / 4 / 16 px | 6 / 4 / 16 px | 0 |
| buttons | 44×44 @ x=18, r 12 | 44×44 @ x=18, r 12 | 0 |
| button y | 284 332 380 428 476 524 572 620 | 284 332 380 428 476 524 572 620 | 0 |
| icon | 24×24 @ (28, y+10) | 24×24 @ (28, y+10) | 0 |
| active | `bg #18181b`, icon `#ffffff` | `bg rgb(24,24,27)`, icon `rgb(255,255,255)` | 0 |
| inactive icon | `#71717a` | `rgb(113,113,122)` | 0 |

### 1.4 Zoom control — exact, every number

| Property | Spec §6.4 | Ours | Δ |
| --- | --- | --- | --- |
| pill | 1304,848 124×40, r pill, pad 4, gap 2 | 1304,848 124×40, r pill, pad 4, gap 2 | 0 |
| Zoom out | 1308,852 32×32, icon 16 @1316,860 | identical | 0 |
| level readout | 1342,860 **48×16** | 1342,860 **48×16** | 0 (and see D6 — it fails WCAG) |
| Zoom in | 1392,852 32×32, icon 16 @1400,860 | identical | 0 |

### 1.5 AI composer — deliberately ours, not theirs

| Property | Spec §6.3 | Ours (`AgentPanel.tsx:29-36`) | Δ |
| --- | --- | --- | --- |
| card | 12,836 320×52, pad 8, r16, S5 | 12,**802** **380×86**, pad **10**, r16, S5 | +60 w, +34 h, 34 px higher |
| row | 20,844 304×36 | 22,812 360×**40** | +56 w, +4 h |
| options button | 20,846 32×32, icon 20 | 22,814 **36×36**, icon 20 | +4 |
| input | 56,844 232×36 | 64,812 **276×40** | +44 w, +4 h |
| send | 292,846 32×32, icon 16 | 346,814 **36×36**, icon 16 | +4 |
| footer line | — (does not exist) | 26,858 352×20, **11 px `--faint`** | new (D5 — 2.56 : 1) |

This one is intentional — it is our product surface, not a clone target. It is also the **only
part of the chrome already scaled up** (36 px buttons where the reference has 32, 40 px input
where the reference has 36). It is a useful precedent for §4.

### 1.6 Canvas & artwork — the big miss

| Viewport | Ref outer rect | Ref cell | **Ours outer** | **Ours cell** | Δ linear | Δ area |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | 722×722 @ (359,107) | **45×** | **514×514** @ (463,217) | **32×** | **−28.8 %** | **−49.3 %** |
| 1280×800 | 626×626 @ (327,105) | 39× | 514×514 @ (383,167) | 32× | −17.9 % | −32.6 % |
| 768×1024 | 530×530 @ (119,265) | 33× | 514×514 @ (127,279) | 32× | −3.0 % | −6.0 % |
| 390×844 | 338×338 @ (26,223) | 21× | 258×258 @ (66,317) | 16× | −23.7 % | −41.7 % |

Structure is faithful: canvas transparent outside the artwork (78.47 % of the backing store at
1440), one flat opaque backdrop, 1-CSS-px grid at the cell pitch with no major lines, and the
two-tone 1 px border (`#0000002e` top/left, `#0000003c` bottom/right — `0,0,0,60` appears in
the histogram at 0.0836 %). Backing store 2880×1704 at DPR 2, i.e. `cssSize × dpr`. ✓

Vertical centring: reference sits 6 CSS px **above** the canvas centre on desktop (gotcha G3);
ours is centred (`centreDeltaY = −0.25`). We chose not to reproduce G3. That is fine and I am
not filing it.

---

## 2. Where the "too small" comes from — root cause of D1

`lib/editor/viewport.ts:9`

```ts
export const ZOOM_LADDER = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64] as const
```

`lib/editor/viewport.ts:55` picks the largest **ladder** value that fits:

```ts
export function fitViewport(doc: Doc, cssW: number, cssH: number, margin = 48): Viewport {
  const maxScale = Math.min((cssW - margin * 2) / doc.w, (cssH - margin * 2) / doc.h)
  let scale: number = ZOOM_LADDER[0]!
  for (const s of ZOOM_LADDER) if (s <= maxScale) scale = s
```

At 1440×900 the canvas is 1440×852, so `maxScale = min(1344/16, 756/16) = 47.25`. The ladder's
next rung below 47.25 is **32**. We throw away 15.25 of the 47.25 available — 32 % of the linear
size, 49 % of the area — because the ladder jumps 32 → 48.

The reference does not use a ladder for fit: it lands on 45, 39, 33, 21 — arbitrary integers.

| Fix option | 1440 result | vs reference 722 |
| --- | --- | --- |
| keep ladder (today) | 32× → 514 px | −28.8 % |
| **any integer, `margin = 48`** | 47× → **754 px** | +4.4 % |
| any integer, `margin = 56` | 46× → 738 px | +2.2 % |
| any integer, `margin = 64` | 45× → **722 px** | **exact parity** |

The ladder should stay for the ± buttons. Fit should be free integer. Recommended: free
integer, and make `margin` breakpoint-aware — the reference effectively uses ~66 px at 1440
and ~26 px at 390 (`(390 − 338) / 2`); a flat 48 is too generous on mobile and too tight on
desktop.

Second, related bug: **fit never re-runs on resize.** `components/Canvas.tsx:49` re-fits only
when the viewport is still at its initial `offsetX === 0 && offsetY === 0`. Measured
(`ui-audit-data.json → resize`):

| Resize step | Canvas box | Zoom readout |
| --- | --- | --- |
| start 1440×900 | 1440×852 | 32× |
| → 1100×900 | 1100×852 | 32× |
| → 768×1024 | 768×976 | 32× |
| → **390×844** | 390×796 | **32×** ← 512 px artwork in a 390 px viewport |
| → back to 1440×900 | 1440×852 | 32× |

So a user who narrows the window ends up with the drawing hanging off both edges and no
indication that "Fit to screen" would help.

---

## 3. Responsive defects

`<body>` is `overflow: hidden` at every breakpoint and `document.scrollWidth === innerWidth`
everywhere, so overflowing controls are not merely ugly — they are **unreachable**.

### 3.1 — 1280 × 800 (new; not in the task list)

Shot: `docs/shots/audit/1280x800-light.png`

The absolutely-centred filename input (`544 → 736`) **collides with the Dither button**
(`511.92 → 598.45`) — **54.5 px of overlap**, full 28 px height.

The reference has this collision too, but only 32 px wide (its left group ends at 575). Our
17.35 px-wider wordmark makes it **70 % worse**. At 1440 we still clear it (598.45 vs 624 =
25.5 px of air, against the reference's 49 px) — so 1440 is already only half as safe as the
reference and any longer document name or an extra header control breaks it.

**Fix:** stop absolutely centring the filename. Make it a flex child with `margin-inline: auto`
and `min-width: 0`, or centre it only when `left group right edge + 12 < centre − 96`.
`components/Chrome.tsx:263-281`.

### 3.2 — 768 × 1024 (task #31)

Shot: `docs/shots/audit/768x1024-light.png`. Reference for comparison:
`docs/research/newt/shots/bp-768x1024.png`.

Still the desktop tree, exactly like the reference (its gotcha G1). Measured overflow of the
right group:

| Element | x | right edge | past 768 by |
| --- | --- | --- | --- |
| right group container | 604.45 | 932.76 | **164.76** |
| Share button | 726.45 | 812.76 | 44.76 |
| "Share" label | 764.45 | 802.76 | 34.76 |
| Code & Export | 816.77 | 852.77 | 84.77 |
| Animation timeline | 856.77 | 892.77 | 124.77 |
| **Layers** | 896.77 | 932.77 | **164.77** |

And header collisions with the centred filename (`288 → 480`):

| Overlapping control | overlap |
| --- | --- |
| Bigger brush | 28 × 28 |
| Show grid toggle | 28 × 28 |
| Square \| Round track | **96.5 × 28** |

Ours is slightly worse than the reference's G1: the reference loses `◈` (half-cut), the
divider and "Sign in"; we lose the whole of Code, Timeline and Layers plus most of Share, and
our Square/Round overlap is 96.5 px against the reference's 120 px track (spec §2.3 — theirs
overlaps 360→480, i.e. the whole control).

**Task #31 is executable from this table.** The reference explicitly says "do not reproduce
this" (G1). The two ways out:

- **A (cheap):** move the mobile breakpoint up to 1024 and give 768 the mobile tree.
- **B (better, matches the reference's own advice):** collapse the header at < 1100 — put
  Code / Timeline / Layers behind a single `⋯` overflow button, drop the "Share" label to
  icon-only, and un-absolute the filename (§3.1). Left group 226.48 + right group icon-only
  ≈ 190 → fits 768 with ~90 px for the filename.

### 3.3 — 390 × 844 (task #32)

Shot: `docs/shots/audit/390x844-light.png`. Reference:
`docs/research/newt/shots/bp-390x844.png`.

There is **no mobile tree at all**. Everything below is measured.

| Defect | Measurement |
| --- | --- |
| Header content overflows | container `226.48 → 598.45` and `604.45 → 932.76`; **542.77 px** past the right edge |
| Controls entirely off-screen | Square, Round, Dither, "Saved", Undo, Redo, Share, Code, Timeline, Layers — **10 controls** |
| Filename overlaps 4 controls | File button 31.5 px, Settings 36 px, Colour 36 px, Smaller brush 28 px — all full-height |
| Tool rail overlaps the artwork | rail `12,250 56×392` (right edge 68) vs artwork `66,317 258×258` (left edge 66) — **2 px overlap**, and the rail sits over the drawing for 258 of its 392 px |
| Composer overflows the viewport | card `12,746 380×86` → right edge **392** in a 390 px viewport |
| Composer and zoom pill overlap | composer card x 12→392, y 746→832; zoom pill `254,792 124×40` → x 254→378, y 792→832. **The zoom pill sits entirely inside the composer card**, covering the right 124 px of the footer line (`26,802 352×20`) — the text is cut mid-word ("bring your own ke") |
| No mobile-only controls | reference gains Undo / Redo / More at 390; we gain nothing |
| Artwork | 258 px (16×) vs reference 338 px (21×) — **−23.7 %** |
| **Focus scrolls the header away permanently** | see below |

**The focus-scroll bug is the worst of these.** Measured with `tools/probe-390tab.ts`
(shot: `docs/shots/audit/390-header-scrolled-by-tab.png`):

```
tab 6 → "Show grid"  focused x=341   logo button x=  12
tab 7 → "square"     focused x=385   logo button x=  12     (off-screen, right)
tab 8 → "round"      focused x=167   logo button x=-267     ← header scrolled 279 px
tab 9 → "Dither"     focused x=233   logo button x=-267     ← and stays there
```

Chromium scrolls the clipped container to reveal the focused element. `overflow: hidden` does
not prevent programmatic/focus scrolling. The logo, Settings and Colour buttons are now
permanently off-screen with no scrollbar and no gesture to bring them back. Same mechanism
would fire on the first `Tab` from a mobile keyboard.

**Task #32 shopping list**, derived from the reference's §2.4 and adjusted for our content:

1. Below 768, swap the header for a single-row mobile bar (reference: 40×40 buttons at 8 px
   padding, 2 px gap — but see §4, ours should be 44×44).
2. Move the brush/shape/dither group into a horizontally-scrolling options strip above the
   tool bar (reference: 48 px row, `overflow-x: auto`, scrollbar hidden). **Do not** reproduce
   the reference's G13 (8 × 44 px buttons in a 324 px scroller with zero affordance) — give it
   a fade edge or wrap to two rows.
3. Turn the tool rail into a bottom bar so it stops sitting on the artwork.
4. Make the composer `width: calc(100% − 24px)` instead of a fixed 380, and either hide the
   zoom pill (as the reference does) or move it above the composer.
5. Re-fit on resize (§2) and drop `margin` to ~24 below 768 so the artwork reaches ~21×.

---

## 4. Scale analysis — "everything should be a bit bigger"

### 4.1 What is actually rendered

All 30 interactive controls at 1440×900, `ui-audit-data.json → ["1440x900-light"].targets`:

| Control | Box | Min side | Nominal icon | **Ink** (path bbox) | Ink : button |
| --- | --- | --- | --- | --- | --- |
| Tool-rail button ×8 | 44×44 | **44** | 24 | 16.5 – 23.25 | **38 – 53 %** |
| Header icon button ×7 | 36×36 | **36** | 20 | 12.5 – 18.76 | **35 – 52 %** |
| File / wordmark | 118.5×32 | 32 | 24 | — | — |
| Brush −, +, toggle | 28×28 | **28** | 16 | 12 – 13 | 43 – 46 % |
| Square / Round | 60×24, 56×24 | **24** | — | 12 px text | — |
| Dither: Solid | 86.5×28 | **28** | 12 | 8.25 | — |
| Filename input | 192×28 | **28** | — | 14 px text | — |
| Zoom −, + | 32×32 | **32** | 16 | 12 | 38 % |
| **Zoom level ("32×")** | **48×16** | **16** | — | 12 px text | — |
| Composer options / send | 36×36 | 36 | 20 / 16 | 15 / 12 | 42 / 33 % |
| Composer input | 276×40 | 40 | — | 14 px text | — |
| Footer note | — | — | — | **11 px text** | — |

The "ink" column is the real reason things read small: Phosphor Regular art occupies roughly
75 % of its 256 viewBox, so a nominal 24 px icon paints 16.5–23 px of pixels. Set in a 44 px
button that is 38–53 % fill. It is a correct implementation of the reference — the reference
uses the same paths at the same sizes — but it is a **thin, airy** ratio for a desktop tool.

### 4.2 Against the accessibility floors

| Standard | Floor | Our violations |
| --- | --- | --- |
| WCAG 2.2 AA §2.5.8 Target Size (Minimum) | 24×24 CSS px | **1: zoom level readout, 48×16** (`Chrome.tsx:409`) |
| WCAG 2.2 AAA §2.5.5 / Apple HIG | 44×44 | 22 of 30 controls (everything except the 8 tool-rail buttons) |
| Material 3 | 48×48 dp | 30 of 30 controls |
| Microsoft Fluent | 40×40 | 27 of 30 controls |

So accessibility alone only *forces* one change (the zoom readout). It does not force the
whole UI up. The case for going bigger is the user's, and it is legitimate — but it should be
made deliberately, with numbers, not by nudging.

### 4.3 Recommended scale, with the arithmetic

Two independent moves. **Do the first one first and re-look**, because it is a bug fix and it
alone changes the page dramatically.

**Move 1 — free the artwork (bug fix, D1).** Linear +47 % at 1440 (514 → 754 px), area +115 %.
No design decision required; this is restoring what the spec already measured.

**Move 2 — a deliberate 1.1× chrome step**, chosen so every primary control clears Fluent's
40 px and the tool rail clears Material's 48 dp, while the header stays on the 8 px grid:

| Element | Today | Proposed | Rationale |
| --- | --- | --- | --- |
| Header height | 48 | **56** | 40 px buttons + 8 px above/below |
| Header icon button | 36 | **40** | clears Fluent 40 |
| Header icon | 20 | **24** | ink 15 → 18.8 px; fill 35–52 % → 38–56 % |
| Brush ± / toggle | 28 | **32** | clears WCAG 24 with margin |
| Segmented pill height | 24 | **28** | currently *at* the WCAG floor |
| Tool-rail button | 44 | **48** | clears Material 48 |
| Tool-rail icon | 24 | **28** | ink 16.5–23 → 19–27 px; fill 38–53 % → 40–56 % |
| Tool rail width | 56 | **60** | 48 + 2×6 padding |
| Zoom pill | 40 | **44** | 36 px buttons + 4 |
| **Zoom level button** | **48×16** | **56×28** | **fixes the only WCAG 2.5.8 failure** |
| Body text | 14 | **15** | |
| Small labels | 12 | **13** | |
| Micro-copy | 11 | **12** | 11 px is below every readability guideline |

Total header growth 48 → 56 px costs 8 px of canvas height; at 1440×900 that changes the free
integer fit from 47× to 46× — 738 px, still +44 % on today.

Implement it as **one `--ui-scale` multiplier** in `app/globals.css` rather than 30 edited
literals, so the next "a bit bigger" is one number, and so the reference-parity numbers stay
legible in the source (CLAUDE.md's "do not tidy the measured values" comment at
`Chrome.tsx:3-9`).

---

## 5. Accessibility defects

Contrast values below are computed from **real rendered pixels** sampled out of the audit
screenshots (`tools/sample-box.ts`), not from CSS. That matters here: six controls carry
`opacity: 0.5` (`Chrome.tsx:89`), which `getComputedStyle` on the `<svg>` does not report, so
the CSS-derived numbers under-state the problem by ~1 point.

| Element | Colour rendered | On | **Light** | **Dark** | Floor | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Tool-rail glyph, **disabled** (Select, Marquee, Gradient) | `rgb(208,208,212)` | `rgb(244,244,245)` | **1.40** | **1.97** | 3.0 | **FAIL badly** |
| Header icon, **disabled** (Undo, Redo, Share, Code, Timeline, Layers) | `rgb(206,206,211)` | `rgb(253,253,253)` | **1.54** | **1.80** | 3.0 | **FAIL badly** |
| Send button, disabled | `rgb(161,161,170)` | `rgb(255,255,255)` | **2.56** | 3.36 | 3.0 | FAIL (light) |
| Composer footer, 11 px text | `rgb(161,161,170)` | `rgb(255,255,255)` | **2.56** | 3.36 | 4.5 | **FAIL** |
| "Saved" status, 12 px text | `#a1a1aa` | `#fdfdfd` | **2.52** | 3.43 | 4.5 | **FAIL** |
| File-menu caret | `#a1a1aa` | `#fdfdfd` | **2.52** | 3.43 | 3.0 | FAIL (light) |
| Tool-rail glyph, enabled | `rgb(113,113,122)` | `rgb(244,244,245)` | 4.40 | 6.97 | 3.0 | ✓ |
| Header icon, enabled | `rgb(113,113,122)` | `rgb(253,253,253)` | 4.75 | 6.47 | 3.0 | ✓ |
| "Round" (inactive segment), 12 px | `#71717a` | `#f1f1f4` | 4.29 | 5.41 | 4.5 | **marginal FAIL (light)** |
| Primary text / active tool | `#18181b` / `#fff` | — | 15.7 – 17.7 | 12.6 – 16.3 | 4.5 | ✓ |
| Artwork grid line | `#ededed` on `#ffffff` | — | 1.13 | 1.16 | — | intentional hairline, faithful |

**D2 in words:** at 1440 the right third of the header is six ghost icons at 1.5 : 1 and the
tool rail has three ghost tools at 1.4 : 1 — **nine of the thirty interactive controls on the
page** rendering as smudges (a tenth, Send, is disabled at 2.56 : 1 without the opacity).
This is a large part of "doesn't look great" — the page reads as half-broken. The
reference has **exactly one** disabled control (the Send button, §6.3, `#F1F1F4` /`#A1A1AA` —
the same 2.56 : 1 we measure) and no `opacity` dimming at all, so there is no precedent in the
spec for what we are doing to nine controls. `Chrome.tsx:89`
`opacity: disabled ? 0.5 : 1` compounds an already-faint `--faint`; either drop the opacity and
use `--faint` alone (2.5 : 1, still failing) or — better — **use `--muted` at full opacity
(4.4 : 1) plus a `title` explaining why**, so "not built yet" reads as *pending*, not *broken*.

**Other a11y findings:**

| # | Defect | Evidence |
| --- | --- | --- |
| A1 | **The canvas is not keyboard reachable.** `canvas.focus()` returns `document.activeElement !== canvas`. No `tabIndex`, no arrow-key painting, no alternative path. A keyboard-only user cannot draw at all. | `probe-focus.ts` → `canvas focusable: false`; `Canvas.tsx:264-274` |
| A2 | **`role="toolbar"` promises behaviour we don't implement.** `ToolRail` declares `role="toolbar" aria-orientation="vertical"` (`Chrome.tsx:344-346`) but each button is its own tab stop (tab stops 11–15) and `ArrowDown` does nothing. ARIA APG requires one tab stop + arrow navigation. | `probe-focus.ts` → `toolbar ArrowDown: Brush (B) -> Brush (B)` |
| A3 | Same for the `role="radiogroup"` Square/Round control — two separate tab stops, no arrow keys. | tab stops 7, 8 |
| A4 | **"Settings" is not settings.** `Chrome.tsx:161` — `title`/`aria-label` say "Settings"; `onClick` is `toggleTheme`. Screen readers announce the wrong thing and there is no state exposed (`aria-pressed` absent). | source + measured `aria-label="Settings"` |
| A5 | `:focus-visible { border-radius: inherit }` (`globals.css:155`) overrides an element's own radius while focused. Chrome.tsx escapes it because it sets radius inline (inline beats stylesheet), but `AgentPanel`'s non-inline cases will square off on focus. Latent. | `globals.css:152-156` |
| A6 | `PalettePopover` is `role="dialog"` with no focus trap and no initial focus (`Chrome.tsx:444-454`). Escape and click-away work; Tab escapes the dialog. | source |
| A7 | Header focus scroll at 390 (§3.3) — a keyboard user destroys the layout on tab 8. | `probe-390tab.ts` |
| A8 | Focus ring itself is **good** — `2px solid var(--accent)`, `offset 1px`, visible on the active tool in both themes (`docs/shots/audit/focus-active-tool-light.png`, `-dark.png`). Better than the reference, which falls back to the Chromium UA ring (G8). No defect. | measured |

---

## 6. Polish defects

| # | Defect | Evidence / file |
| --- | --- | --- |
| **D3** | **The artwork backdrop is a theme token.** `--art-bg` is `#ffffff` in light and `#1e1e22` in dark (`globals.css:26,49`), painted at `renderer/canvas.ts:108`. The canvas histograms prove it: the same pixel population is `255,255,255` at 6.6606 % in light and `30,30,34` at 6.6606 % in dark. Consequence: the `face` starter's darkest palette entry `#2d1b00` renders at **1.005 : 1** against the dark backdrop — the outline of the drawing vanishes (`docs/shots/audit/1440x900-dark.png`). The reference never does this: its canvas paints exactly five colours and the artwork background is flat opaque white regardless of theme (§8.2, G5). This also cuts against CLAUDE.md rule 3 — the artwork is showing you a themed lie about what it contains. | `globals.css:26,49`; `renderer/canvas.ts:108` |
| **D4** | **Two hydration mismatches on every page load**, and React says "This won't be patched up." (a) the filename `<input>`'s `borderRadius: 'var(--r-md)'` — the server serialises the shorthand, the client DOM reports the four longhands as `""`; (b) `disabled` on the Undo/Redo buttons. Surfaces as the "1 Issue" badge in the dev overlay (`docs/shots/audit/load-t1600.png`), which also sits on top of our composer. | dev server log; `Chrome.tsx:275`, `Chrome.tsx:290-291` |
| **D5** | Composer footer is 11 px `--faint` at 2.56 : 1 — the single least readable text on the page, and it carries the quota message. | `AgentPanel.tsx:131` |
| **D6** | Zoom level readout is **16 px tall** — the only WCAG 2.5.8 failure. Faithful to the reference (§6.4 notes "only 16px tall, so its hover pill is a thin 48×16 lozenge") and it also has **no hover state at all** (measured: bg unchanged, colour unchanged), so it does not look clickable. | `Chrome.tsx:403-413`; `ui-audit-data.json → hovers["zoom-level"]` |
| **D7** | **Three dead controls that look live.** File/wordmark button (`Chrome.tsx:146-159`) has a caret and a hover wash but no `onClick` and no `aria-haspopup`. Dither: Solid (`Chrome.tsx:248-259`) has a caret and no `onClick`. Both invite a click that does nothing. | source |
| **D8** | **Six disabled header controls with no explanation.** Share, Code & Export, Animation timeline, Layers are permanently `disabled`; Undo/Redo are disabled until history exists. Combined with D2 this is what makes the top-right read as broken. | `Chrome.tsx:292-307` |
| **D9** | **The grid toggle never shows its state.** `Chrome.tsx:206-215` passes `active={false}` hard-coded and line 216 is dead code (`{showGrid && null}`). `showGrid` toggles the canvas correctly; the button looks identical either way. | source + measured `aria-pressed` absent |
| **D10** | **Inactive tool hover drifts from the reference.** Ours: `bg → rgba(0,0,0,0.05)` **and** `color → #18181b`. Reference §7: background only, "nothing else — no colour, transform, shadow or radius change". Small, but it is the one hover we got wrong; the other four measured hovers (active tool = no change, brush ± = lift to `#fff`, zoom ± = `--hover`, composer options = `--hover` + colour) all match. | `ui-audit-data.json → hovers` |
| **D11** | **`cursor: default` on every button** (`globals.css:117`). Faithful to the reference (G7) and wrong for a new product — every control reads as non-interactive. Flagging it because "we copied it" is not a reason to ship it. | measured: all 28 buttons compute `cursor: default` |
| **D12** | **Dead component.** `components/AiComposer.tsx` (233 lines) is no longer imported — `app/page.tsx:6,132` renders `AgentPanel`. Two composer implementations, one unreachable. Until commit `aa8ed3c` it also contained double-encoded UTF-8 in its placeholder (`Ask AIâ€¦ â€œmake it angrierâ€`, visible in the 09:35 screenshots) and five undefined CSS tokens. Both are fixed in the live component; the dead file is a trap for the next person. | `page.tsx:6,132` |
| **D13** | The 390 composer footer is **clipped mid-word** by the zoom pill ("bring your own ke"). Two absolutely-positioned panels with no shared layout contract. | `docs/shots/audit/390x844-light.png`; §3.3 |
| **D14** | **Canvas mounts 400 ms after the header.** Header at 96 ms, canvas at 497 ms — `app/page.tsx:127` gates the whole main area on `doc`, which waits for IndexedDB. For ~400 ms the page is a toolbar over an empty grey field. CLS is negligible (0.00036) because the canvas fills a pre-sized `<main>`, but it reads as a stall. Add a skeleton or render the canvas immediately and paint the document when it arrives. | `probe-load.ts`; `docs/shots/audit/load-t200.png` |
| **D15** | Header children sit on **half-pixel Y** (5.5, 9.5, 11.5, 13.5, 15.5, 17.5) — 40 header boxes measured at DPR 1, every one of them on a fractional coordinate. Everything blurs by half a device pixel on a 1× display. **This is faithful** (the reference is 5.5 too — see §0) and it is the reference's mistake: `h-12` + `border-b` with `box-sizing: border-box` gives a 47 px content box. Fix by moving the border to an inset ring or `::after`, or making the header 49 px. | `ui-audit-data.json → dpr1.subpixel`; `Chrome.tsx:136-142`; `docs/shots/audit/header-dpr1-crop.png` |

**Non-defects, checked and clean:** 0 console errors and 0 page errors at all four breakpoints
in both themes; CLS 0.00036; no horizontal page scroll anywhere; every interactive control has
an accessible name (30/30); font is Geist as specified; all ten tokens, five radii and three
shadows match the reference exactly.

---

## 7. Prioritised fix list

Ranked by (user-visible impact) ÷ (effort). **P1–P3 are one afternoon and change how the
whole product reads.**

### P1 — Free the artwork · impact ★★★★★ · effort XS

`lib/editor/viewport.ts:55-64`. Replace the ladder scan in `fitViewport` with a free integer
`Math.max(1, Math.floor(maxScale))`; keep `ZOOM_LADDER` for `nextScale`. Make `margin`
breakpoint-aware (≈64 desktop, ≈24 below 768).
→ **+47 % linear, +115 % area** at 1440. This is the single biggest answer to "everything
should be bigger", and it is a bug fix, not a redesign.

### P2 — Stop rendering half the chrome as ghosts · impact ★★★★★ · effort XS

`components/Chrome.tsx:89` — drop `opacity: disabled ? 0.5 : 1`; give disabled controls
`--muted` (4.4 : 1) and a `title` that says *why*. Then decide per control: Share / Code /
Timeline / Layers are not built — consider hiding them entirely rather than shipping four dead
buttons (`Chrome.tsx:292-307`), and same for the three unbuilt tools (`Chrome.tsx:23,28,30`).
→ fixes the 1.40 : 1 and 1.54 : 1 failures and removes the "half-broken" read.

### P3 — Un-theme the artwork backdrop · impact ★★★★★ · effort S

`app/globals.css:26,49` + `lib/renderer/canvas.ts:51,108`. The artwork background is document
state, not a theme token. Paint it from the document (or flat `#ffffff` as the reference does),
and if a dark-mode surround is wanted, theme the *area outside* the artwork instead — which is
DOM `--surface` already.
→ fixes the 1.005 : 1 invisible-artwork bug; restores CLAUDE.md rule 3.

### P4 — Correct VISUAL-SPEC.md §6.1 · impact ★★ · effort XS

Change the header children's `y` from `6` to `5.5` (source: `dom-tree.json`; `responsive.json`
is rounded and should be labelled as such). Add a note that the reference's own header has a
47 px content box. Without this, correct implementations keep looking like defects.
→ CLAUDE.md rule 10.

### P5 — Fix the header at ≤ 1280 (unblocks task #31) · impact ★★★★ · effort M

`components/Chrome.tsx:263-281` — un-absolute the filename (flex + `margin-inline: auto`).
`Chrome.tsx:284-308` — collapse Code / Timeline / Layers into one `⋯` below ~1100 and drop the
"Share" label to icon-only. Fixes the 54.5 px collision at 1280 *and* the 164.77 px overflow at
768 with one change. Numbers to hit: §3.1, §3.2.

### P6 — Build the mobile tree (task #32) · impact ★★★★ · effort L

Full spec in §3.3. Order: mobile header row → options strip → tool bar at the bottom → fluid
composer → hide/relocate the zoom pill → re-fit on resize. Do **not** reproduce the reference's
G13 (silent horizontal overflow with no affordance).

### P7 — Re-fit on resize · impact ★★★ · effort XS

`components/Canvas.tsx:42-53` — the `offsetX === 0 && offsetY === 0` guard means fit runs once,
ever. Re-fit when the canvas box changes and the user has not manually panned/zoomed (track an
explicit `userAdjusted` flag rather than inferring from the offset).
→ evidence: the resize table in §2 (32× at every size, including 390).

### P8 — Decide the chrome scale · impact ★★★★ · effort M

§4.3 table, implemented as one `--ui-scale` token. **Do this after P1** and re-look — P1 alone
may satisfy the request. If it doesn't, the 1.1× step in §4.3 is the measured recommendation,
and it fixes the zoom-readout WCAG failure on the way (48×16 → 56×28).

### P9 — Wire the dead controls · impact ★★★ · effort M

File menu (`Chrome.tsx:146`), dither picker (`Chrome.tsx:248`), grid-toggle state
(`Chrome.tsx:213`), and rename the "Settings" button to what it does (`Chrome.tsx:161`).

### P10 — Keyboard access to the canvas · impact ★★★ · effort M

`Canvas.tsx:264` — add `tabIndex={0}`, a visible focus ring, arrow-key cursor movement and
Space/Enter to paint. Then implement roving tabindex + arrow keys on the `role="toolbar"` rail
(`Chrome.tsx:344`) and the `role="radiogroup"` (`Chrome.tsx:220`), or drop the roles.

### P11 — Clear the hydration mismatches · impact ★★ · effort S

`Chrome.tsx:275` — move `borderRadius: 'var(--r-md)'` on the `<input>` into a class or use a
literal `8`. `Chrome.tsx:290-291` — make the initial `disabled` deterministic across
server/client.

### P12 — Housekeeping · impact ★ · effort XS

Delete `components/AiComposer.tsx` (dead since `aa8ed3c`). Reconsider `cursor: default`
(`globals.css:117`). Align the inactive tool hover with the reference (`Chrome.tsx:78-88`,
drop the colour change). Bump 11 px micro-copy to 12 px (`AgentPanel.tsx:131,167,188,249,272`).
Scope `:focus-visible { border-radius: inherit }` (`globals.css:155`).

---

## 8. Screenshot index — `docs/shots/audit/`

| File | What it shows |
| --- | --- |
| `1440x900-light.png`, `1440x900-dark.png` | Reference viewport, both themes. Dark shows D3 (artwork outline vanishing). |
| `1280x800-light/dark.png` | The 54.5 px filename/dither collision (§3.1) |
| `768x1024-light/dark.png` | Task #31: header overflow and collisions (§3.2) |
| `390x844-light/dark.png` | Task #32: no mobile tree, rail on the artwork, composer/zoom overlap (§3.3) |
| `390-header-scrolled-by-tab.png` | The focus-scroll bug — logo at x = −267 |
| `1440x900-light-dpr1.png`, `header-dpr1-crop.png` | DPR 1, where the half-pixel Y (D15) shows |
| `focus-active-tool-light/dark.png` | Focus ring on the active tool (clean) + the three ghost tools at 1.40 : 1 |
| `load-t80/200/400/800/1600.png` | Load timeline; canvas absent until 497 ms (D14); the "1 Issue" badge (D4) |
| `after-resize-1440.png` | Zoom still 32× after a resize round-trip (§2) |
| `*-focus-last.png` | Final tab stop at each breakpoint |
