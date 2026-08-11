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

## 1. Model

No format change. `doc.frames` is already an ordered array with per-frame `ms`
([01 §3](./01-document-format.md)); Phases 1–4 simply never create a second frame.

Constraints: `1 ≤ frames.length ≤ 64`, `10 ≤ ms ≤ 10000`. The 64-frame cap keeps a 256×256 document
under ~4MB in memory and keeps GIF export inside a few seconds.

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

GIF and sprite sheet are specified in [08 §7–8](./08-exporters.md). Timeline-specific notes:

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
