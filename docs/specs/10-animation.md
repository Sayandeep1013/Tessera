# 10 — Animation and Timeline

**Owns:** `components/timeline/**`, `lib/editor/playback.ts`, `lib/exporters/{gif,spritesheet}.ts`
**Depends on:** [01](./01-document-format.md), [03](./03-artwork-core.md), [04](./04-renderer.md), [08](./08-exporters.md)
**Phase:** 5

> ⚠️ **This is the pre-agreed cut line.** If Phases 0–2 run long, animation is what gets dropped —
> decided in advance so the call is made calmly rather than under pressure. Everything before this
> ships without it; the format already carries `frames[]`, so cutting it leaves no scar.

Newt has this — measured as the frames button in its top bar — so it is in scope for parity if time
allows.

---

## 0. Corrections and decisions made building unit F

Rule 10: when a spec turns out to be wrong, say so and fix it rather than route around it. Six
things here were either decided (the spec left them open on purpose) or corrected (the spec assumed
something that measuring, or the rest of the codebase, showed was not true).

### 0.1 The layer question — resolved

`14-layers.md §9` left three questions open and made them a precondition for this unit. Resolved
there, not here, because that section is where the questions were asked and future readers of
either file should find one answer, not two that could drift apart. Summary: **a layer belongs to
the frame it was added to; layers diverge per frame.** It cost nothing to build — every command and
panel this spec depends on already addressed `frames[activeFrame].layers`.

### 0.2 The codebase was already frame-shaped before this unit started

Not a correction so much as a fact worth recording so the next reader does not go looking for work
that turned out not to exist: `frame_add`/`frame_delete`/`frame_duration` were already real commands
with tested inverses (`commands.ts`), `useDocStore` already carried a `frame` index that `commit`,
`undo` and `redo` already threaded through, every pixel-writing command already required a `frame`
field, the renderer's `renderDoc` already took a `frameIndex` argument, `spriteRects`/`spriteToSvg`
already took a `frame` argument, and the action registry already read `ctx.frame()` throughout. Only
one command was missing entirely: reordering. `frame_move` is new, added mirroring `layer_move`
(self-inverse under exchange) exactly.

### 0.3 No `renderThumbnail` — `spriteRects` already is one

§2 asks for thumbnails "via `renderThumbnail` (04 §7)". That function was never built, and does not
need to be: `lib/renderer/sprite-svg.ts`'s `spriteRects(doc, frame)` is already an inline-SVG
thumbnail renderer, already frame-aware, and already proven at exactly this job — it is what draws
every thumbnail in the Open recent submenu (`17-file-menu.md §8.2`, `components/Chrome.tsx`'s
`Thumb`). The timeline's frame thumbnails reuse it rather than inventing a second renderer for the
same picture.

### 0.4 The timeline docks to the top of `<main>`, not "above the AI composer"

§2's mockup shows the strip sitting directly above the composer. Measured against what actually
occupies `<main>`: the agent panel's height is not fixed — `AgentPanel.tsx`'s `shellFor` computes it
from the tool rail's measured height and caps it so a long step log cannot grow into the rail, and
that cap already changes between tiers and between idle and busy states. Anchoring a second panel
"above" a box whose own top edge moves is the same class of bug `HANDOFF.md §5` has already caught
twice in this repo by measuring (the notice sitting on the zoom pill at 320px, the Export popover
anchored to the wrong ancestor) — both were invisible at rest and only showed up against real
content.

The timeline docks to the **top** of `<main>` instead: full width, `top: inset`, the one edge no
other overlay anchors to on any tier. Layers panel already anchors there too (`top: inset, right:
inset`), so opening both at once is the one real collision — handled by giving Layers panel's `top`
an offset equal to the timeline strip's height when both are open, the same kind of coordination
`railLift` already does between the tool rail and the agent panel. Withheld below the tablet
breakpoint, same as Layers and Share (`HANDOFF.md §6.4`) — a 72px strip has nowhere to go on a phone
that is not already spoken for by the horizontal tool rail and the agent panel.

### 0.5 GIF, sprite sheet, and the animated React/CSS export hooks are out of this unit's scope

`08-exporters.md §8` and `§9` mark sprite sheet and GIF **Phase 5** in the spec's own header, the
same header that marked SVG/CSS/React/JSON/PNG **Phase 3** — and unit D, building Phase 3, already
drew that line explicitly: *"GIF and sprite sheet. Phase 5 by the spec's own header, and the unit's
prompt named six exporters, not eight."* `PLAN.md`'s line for this unit — "Frames, the timeline
strip, playback, onion skinning if cheap, GIF export" — named GIF but not sprite sheet or the
animated hooks, and was written before any of the four had a real cost estimate against them.

Costed now: GIF export needs a Web Worker, a hand-written LZW encoder (no dependency in this repo
does this, and pulling one in is a different decision than writing one), a progress-reporting
protocol across the worker boundary, and its own test surface — on top of settling the load-bearing
layer question, building the timeline UI, wall-clock playback, onion skinning and every keyboard
shortcut in this same spec. Bundling a worker-and-codec project into the same unit as the
per-frame-layers decision risks rushing both, which is exactly the failure mode `WORKFLOW.md`'s
scoring gate exists to catch before it ships. **Deferred, the same way D deferred it**, now with a
concrete reason rather than a phase number: GIF, sprite sheet, React's `animated` option and CSS's
Phase-5 hooks are a follow-up unit, not built here. The export popover does not grow rows for them —
absent rather than disabled, per `17-file-menu.md §7`'s own rule that a control that looks live and
is not is worse than no control.

---

## 1. Model

No format change. `doc.frames` is already an ordered array with per-frame `ms`
([01 §3](./01-document-format.md)); Phases 1–4 simply never create a second frame.

Constraints: `1 ≤ frames.length ≤ 64`, `10 ≤ ms ≤ 10000`. The 64-frame cap keeps a 256×256 document
under ~4MB in memory and keeps a future GIF export (§0.5) inside a few seconds. `ms` is already
`serializedFrameSchema`'s own `min`/`max` (`MIN_FRAME_MS`/`MAX_FRAME_MS`), enforced by zod. The
64-frame cap is **not** in the zod schema, deliberately, on the same reasoning `14-layers.md §3`
gives for `MAX_LAYERS`: tightening `serializedFrameSchema` would make a hand-authored 65-frame file
fail to *open*, and refusing to open somebody's artwork is worse than a long filmstrip. `MAX_FRAMES`
lives in `lib/artwork-core/frames.ts` and is enforced where a frame is *added* — the `+` button and
the context menu's Duplicate — the same split `add_layer` already uses.

---

## 2. Timeline UI

A 72px strip docked above the AI composer, visible only when the frames panel is toggled on.

```
┌──────────────────────────────────────────────────────────────┐
│ ▶  ⟲   ┌────┐┌────┐┌────┐┌────┐  ┌───┐                       │
│        │ 01 ││ 02 ││ 03 ││ 04 │  │ + │        100ms  ◐ onion │
│        └────┘└━━━━┘└────┘└────┘  └───┘                       │
└──────────────────────────────────────────────────────────────┘
```

- Thumbnails via `renderThumbnail` ([04 §7](./04-renderer.md)) at 48px, regenerated on commit
  (debounced 200ms) — not every frame of playback.
- Active frame: 2px `--accent` border.
- Drag to reorder. Drop indicator between thumbnails.
- Right-click / long-press → `Duplicate`, `Delete`, `Set duration…`. Delete is disabled at one frame.
- `+` appends a duplicate of the current frame — duplicating is overwhelmingly the common case, and
  an empty new frame is one `⌘Z` away.
- Duration field applies to the selected frame; `⇧`-click selects a range and sets all of them.

### Keyboard

`,` / `.` previous/next frame · `⇧,` / `⇧.` move the frame · `Space` play/pause ·
`⌥D` duplicate · `⌥⌫` delete.

`Space` collides with hold-to-pan ([05 §6](./05-editor.md)). **Resolution: `Space` toggles playback
only when the timeline has focus; otherwise it pans.** This is a real conflict and is resolved here,
not left to discovery.

---

## 3. Playback

```ts
type Playback = { playing: boolean; frame: number; startedAt: number; loop: boolean }
```

`requestAnimationFrame` driven, **wall-clock scheduled** — never `setTimeout(ms)` per frame, which
drifts. Each tick computes the frame from elapsed time modulo the total cycle, so a dropped frame
self-corrects instead of accumulating lag.

- Editing while playing pauses playback and selects the edited frame.
- Playback is display-only: it does not commit anything and does not touch history.
- Loops by default. `⟲` toggles ping-pong.
- Hidden tab → `document.visibilitychange` pauses, so a background tab is not burning frames.

---

## 4. Onion skin

Optional. Previous frame at 30% alpha tinted `--diff-remove`, next at 30% tinted `--diff-add`, drawn
beneath the current frame by the renderer. Off by default; state is per-session, not persisted.
Disabled during playback.

---

## 5. AI and animation

The AI edits **one frame at a time** — the frame in the context is the current frame
([06 §3](./06-ai-protocol.md)), and `applyOps` targets exactly that frame.

**Multi-frame instructions ("animate it blinking") are out of scope for v1.** They require temporal
coherence across frames, which is materially harder than a single-frame edit and is not on the
critical path for the money shot. The composer does not advertise animation verbs, and the system
prompt does not mention frames.

If Phase 0 shows single-frame editing is strong, a natural Phase 6 is a `duplicate_frame` +
per-frame-edit sequence — but that is a separate decision with its own probe matrix, not a stretch of
this one.

---

## 6. Export

GIF and sprite sheet are specified in [08 §8–9](./08-exporters.md). Timeline-specific notes:

- The export popover reveals `GIF` and `Sprite sheet` only when `frames.length > 1`.
- GIF export shows a determinate progress bar fed by worker messages.
- A GIF frame delay below 20ms is clamped, and the UI says so once rather than silently retiming.

---

## 7. Test requirements

- Adding a frame produces one undo step; undo removes it and restores the frame index
- Reorder, duplicate, delete each round-trip through undo
- Delete is rejected at one frame
- Playback advances by wall clock: a simulated 250ms elapsed on `[100,100,100]` lands on frame 2
- A dropped frame (400ms gap) lands on the correct frame, not 4 frames behind
- Editing during playback pauses and selects that frame
- `Space` pans when the canvas has focus and toggles playback when the timeline does
- Onion skin renders previous/next at the specified alpha and is absent during playback
- 64 frames is accepted; 65 is rejected with a message
- GIF frame count and delays match the document; a 5ms frame is clamped to 20ms
