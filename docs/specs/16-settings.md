# 16 — Settings

**Status:** specced from live measurement, 12 Aug 2026. Not built.
**Covers:** the settings panel, and the four capabilities behind it.

Our Settings button toggles dark/light and nothing else. The reference has a
whole panel behind it. This spec records what is actually there, measured, and
what it takes to offer the same capabilities.

---

## 0. What was measured

`tools/inspect-newt-settings.ts`, live at 1440×900, DPR 2. Screenshots in
`docs/research/newt/shots/settings-*.png`, raw dump in `settings-probe.json`.

**On copying.** `docs/SPEC.md §0` puts the reference's branding, icons, copy and
artwork off-limits, and nothing here derives from its code. What is taken is the
**capability set and the structure** — which options a pixel editor of this kind
offers and how they are grouped. Every string in our panel is written fresh; the
reference's wording is quoted below only so the capability behind it is
unambiguous, and the attribution line in its footer is obviously theirs.

### Geometry

| Thing | Measured |
|---|---|
| Panel | 256 wide, ~427 tall, anchored at x=117 y=48 — directly under the Settings button |
| Title row | 224×28, with a 28×28 close button at the right |
| Tab row | two buttons, 110×24 each |
| Segmented option | 24 tall; 73 wide at three-up, 3 or 4 options per row |
| Section rhythm | label, then the control, ~62px per section |

### Editor tab — the default

| Section | Control | Options | Default |
|---|---|---|---|
| Theme | segmented | Dark · Light · Auto | **Auto** |
| Pixel grid | segmented | Auto · On · Off | **Auto** |
| Transparency grid | switch | on/off | **off** |
| Symmetry | segmented | Off · H · V · Both | **Off** |

Symmetry carries a helper line: *"Mirrors your strokes as you paint. Both
reflects into all four quadrants."*

### Canvas tab

| Section | Control | Options |
|---|---|---|
| Size | preset buttons | 16 · 32 · 64 · 128 · 256 (square) |
| | preset buttons | 16:9 · Banner · Portrait · Custom |
| | number inputs | W × H, showing the current size |

Helper: *"Keeps art centered — grow pads, shrink crops. Undo to revert."*

---

## 1. What we already have, and what is genuinely new

This matters because three of the six are wiring and three are real features.

| Capability | State here |
|---|---|
| Theme | **Partly.** A binary toggle on the Settings button. Needs a third state, Auto, following the system. |
| Pixel grid | **Partly.** `showGrid` boolean plus the `G` key. `GRID_MIN_SCALE` already implements the *behaviour* Auto describes — the grid is suppressed below a zoom where it would dominate — so Auto is exposing a rule that exists rather than writing one. |
| Canvas size | **No UI.** `createDoc({ w, h })` exists; nothing can resize an existing document. Needs a new command, so it is undoable. |
| Transparency grid | **No, and it contradicts a recorded decision.** See §2. |
| Symmetry | **No.** A real drawing feature — see §3. |
| Panel itself | **No.** Needs a tabbed popover and a segmented-control primitive. |

---

## 2. Rule 13 note — the transparency grid contradicts the renderer

`lib/renderer/canvas.ts` says, in the pipeline itself:

```
// 2. artwork backdrop — flat and opaque, never a checkerboard
```

That was a deliberate call and it should not be quietly reversed. The case for
reversing it anyway: a flat ground cannot distinguish *transparent* from *a
pixel painted the same colour as the ground*, and in a format whose whole first
principle is that `.` is transparent, that is a real ambiguity — the user hit it
this session ("they aren't empty transparent pixels"). The case against: a
checkerboard under pixel art is visual noise competing with the artwork.

**Resolution:** build it as an option, defaulting **off**, which is what the
measurement shows the reference does too. The comment in `canvas.ts` becomes
"flat by default, never a checkerboard unless asked" and cites this section. The
`--art-bg` translucency added this session stays as the default ground.

---

## 3. Symmetry is the only one that touches the document

The other five are view state. Symmetry changes what a stroke *writes*, so it
belongs to the input path, not the renderer.

- `Off` — one cell per painted cell.
- `H` — mirror across the vertical centre line: `x → w - 1 - x`.
- `V` — mirror across the horizontal centre line: `y → h - 1 - y`.
- `Both` — all four quadrants: the cell, its H mirror, its V mirror, and both.

Rules that fall out of the format and the invariants:

1. **It expands the cell set inside one stroke, not into extra commands.** A
   symmetric stroke is still one undo. `stroke.current` is already a
   `Map<y*w+x, PaintCell>`, so mirrored cells are added to the same map and
   deduplicate for free — which matters on an odd-width canvas where a stroke
   down the centre column mirrors onto itself.
2. **It applies to every tool that paints cells**, not just the brush: eraser,
   rect, gradient and fill all go through the same path. Fill is the interesting
   one — mirroring a flood fill means filling from each mirrored seed, not
   mirroring the result.
3. **It does not apply to the eyedropper, marquee or select/move.** Reading and
   moving are not painting.
4. **Odd dimensions work.** `w - 1 - x` is exact for both parities; the centre
   column of an odd canvas maps to itself and dedupes.
5. **It is view state, not document state.** A document does not remember it was
   drawn symmetrically, and the format gains no field.

---

## 4. Canvas resize

### 4.1 Measured layout

From `docs/research/newt/shots/settings-canvas-tab.png`. The Canvas tab is one
section, and its shape matters because it is doing more than it looks:

```
Size
┌────────┬────────┬────────┐
│   16   │   32   │   64   │      3x3 grid of pills, ~73x36, gap 8
├────────┼────────┼────────┤
│  128   │  256   │  16:9  │
├────────┼────────┼────────┤
│ Banner │Portrait│ Custom │
└────────┴────────┴────────┘
┌──────────────┐ x ┌──────────────┐
│ W       16   │   │ H       16   │   paired number inputs, label inside
└──────────────┘   └──────────────┘
┌───────────────────────────────────┐
│              16x16                │   full-width APPLY, showing the target
└───────────────────────────────────┘
Keeps art centered - grow pads, shrink crops. Undo to revert.
```

The two things worth copying, because they are not obvious:

1. **The apply button shows the pending size, not the word "Apply".** It reads
   `16x16` and is disabled while that equals the current size. So the control
   answers "what will I get" before it answers "do it", and the disabled state
   needs no explanation.
2. **The presets and the inputs are one mechanism.** Clicking `64` fills W and H
   with 64; typing in W and H selects `Custom`. Nothing applies until the button
   is pressed, so a half-typed `1` in a width field never resizes anything.

Our aspect presets, sized to keep the pixel count sane rather than copied:
`16:9` -> 64x36, `Banner` -> 128x32, `Portrait` -> 48x64.

### 4.2 The command

**Correction, written during the build.** This section originally specified a
new command carrying `prev: Uint8Array[]`. A `resize` command **already exists**
in `commands.ts` and has since the format was written:

```ts
{ type: 'resize'; label: string; before: Doc; after: Doc }
```

`applyCommand` returns `cloneDoc(cmd.after)` and `invertCommand` swaps the two,
so it already carries every cropped pixel by construction — a whole-document
snapshot is strictly safer than the cell list I was about to specify, and it is
already tested by the command suite. Nothing new is needed. What was actually
missing is the transform, `resizeDoc`, and that is all §4.2 should ever have
asked for.

- **Centred.** Growing pads equally; shrinking crops equally. An odd difference
  biases to the top-left, chosen because it is deterministic and therefore
  testable, not because it is prettier.
- **Every layer of every frame** resizes together, or the document is invalid.
- **Cropping destroys pixels, so the inverse carries them.** `prev` holds the
  whole previous buffer per layer. That is heavier than a cell list and it is
  the honest choice: a crop can destroy thousands of pixels, and rule 7 says
  never silently discard artwork. "Undo restores it" is only true if undo has
  the bytes.
- Clamp to the schema's limits; `S-E1` covers the rejection.
- **`S-E2` is a real case, not a formality.** Shrinking a 64x64 with art in the
  corners loses it. The apply button says how many painted pixels will be
  dropped before it is pressed.

### 4.3 Interaction with layers and frames

Resize is the one operation that must touch *every* layer of *every* frame at
once. A document whose frames disagree about their dimensions is not
representable — `w` and `h` live on the document, not the frame — so a partial
resize is not a degraded state, it is a corrupt one. Do it in a single pass that
builds the whole new `frames` array, and validate before committing.

---

## 5. The panel

- A popover under the Settings button, 256 wide, matching the layers panel's
  construction (tokens, `--shadow-lg`, `--r-lg`).
- Two tabs. Ours: **Canvas** and **Editor**, same split as measured — size is a
  property of the document, everything else is a property of the view.
- A `Segmented` primitive: 2–4 options, one active, roving-tabindex arrow-key
  navigation, `role="radiogroup"`. It replaces the ad-hoc Square/Round pair in
  the top bar, which is the same control built inline.
- Closes on Escape and on outside `mousedown` — not `click`, see HANDOFF §5.
- Withheld on mobile, like the layers panel, unless the sections stack cleanly
  at 320px. Decide by measuring, not by guessing.

---

## 6. Error codes

| Code | Meaning | Surfaces as |
|---|---|---|
| `S-E1` | Resize outside the schema's limits | The input rejects it; the preset is disabled with the reason |
| `S-E2` | Resize that would crop painted pixels | Allowed, but the confirm says how many pixels leave the canvas |
| `S-E3` | Symmetry set on a 1×N canvas | Permitted and a no-op; mirroring a single column is identity |
| `S-E4` | Theme `Auto` with no `matchMedia` | Falls back to dark, the existing default |

---

## 7. Test requirements

- `stepScale`-style exhaustive check on the mirror maths: for every `w` in 1..64
  and every `x`, `mirrorX` is an involution and stays in range.
- A symmetric brush stroke produces one command whose cell count is ≤ 4× the
  unmirrored one, and exactly 1× down the centre of an odd canvas.
- Symmetry `Both` on a 5×5 canvas paints the expected 4 (or 1, or 2) cells for
  a corner, an edge and the centre.
- Undo of a resize that cropped restores every cropped pixel, verified by
  serialising and reparsing.
- Resize preserves centring: a 1-pixel dot at the centre of 16×16 is still at
  the centre of 32×32.
- Theme `Auto` follows `matchMedia`, and an explicit choice ignores it.
- Pixel grid `Auto` matches the existing `GRID_MIN_SCALE` behaviour exactly, so
  the option is a name for what already happens.
- Probe: every section reachable, both tabs, both themes, all viewports.

---

## 8. Order of work

1. `Segmented` primitive plus the panel shell with both tabs. Nothing behind it.
2. Theme tri-state, and pixel-grid tri-state — the two that are re-exposing
   behaviour that already exists.
3. Transparency grid — renderer only.
4. Symmetry — input path, with the mirror maths tested first.
5. Resize — the command, its inverse, then the UI.
6. Score.

Steps 1–3 are a day's work that make the button honest. Steps 4 and 5 are each
their own unit and should not be rushed to land alongside them.
