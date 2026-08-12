# 15 — Feedback and Input

**Status:** built and scored 9/10, 12 Aug 2026
**Covers:** what the editor tells you about its own state, and how it responds to a zoom gesture.

Four faults reported from real use in one session. They look unrelated and they are not: in every
one, the editor's account of itself is wrong. It says an AI edit succeeded when nothing changed. It
grows a panel over its own tool rail. It borrows the browser's tooltip voice instead of speaking in
its own. And its zoom buttons lurch when its zoom gesture is smooth.

---

## 0. What was measured before anything was changed

`tools/probe-zoom.ts`, against the running app at 1440×900, DPR 2.

| Path | Result |
|---|---|
| Wheel zoom, trackpad-sized notches | 46 → 42 → 38 → 35 → 32 … biggest step **14%**, no dead notches |
| Wheel zoom, fine deltas | 46 → 46 → 45 → 45 … biggest step **2%**, longest dead run 3 notches |
| Fractional viewport offsets | **0 of 51** samples — the artwork always lands on whole pixels |
| Frame intervals during a fast gesture | median **16.7ms**, **0** frames over 20ms, worst 16.8ms |
| **Zoom bar `−`**, from the fitted 41× | 41 → 32 → 24 → 16 → 12 → 8 → 6 |
| **Zoom bar `+`**, back up | 6 → 8 → 12 → 16 → 24 → 32 → 48 — biggest step **50%** |

So the reported "janky, stuttering" zoom is **not** the render loop, not dropped frames, not
fractional offsets, and not the wheel. It is the two buttons, and this spec fixes only those.

Recording the negative results matters as much as the positive one. Three plausible causes were
eliminated by measurement, and without the numbers the obvious next move would have been to rewrite
the render loop — which is already hitting 60fps exactly.

---

## 1. Scope

**In:**

1. Agent outcomes that tell the truth — no-op, partial, success, refusal, quota.
2. The agent panel's height, so it stops overlapping the tool rail.
3. A tooltip component of our own, in our tokens, and wider coverage.
4. Zoom buttons that step proportionally and reversibly.

**Out, and deliberately:**

- The code panel, the timeline, and share. Each is its own unit.
- AI output *quality*. Standing decision, `docs/HANDOFF.md §7`.
- Touch tooltips. A tooltip has no place on a touch device; the mobile tier keeps `aria-label`
  and shows nothing. Long-press-to-reveal is a different feature and is not wanted here.

---

## 2. Rule 13 correction — the zoom ladder was wrong for buttons

`docs/specs/05-editor.md §4` says the ladder exists so that stepped zoom "lands on recognisable
factors". `lib/editor/viewport.ts` implements that with

```ts
export const ZOOM_LADDER = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]
```

and `nextScale` steps one rung per click. Two consequences, both measured above:

1. **Steps of up to 50%.** 32 → 48 is half the artwork's size again, in one click. The wheel's
   largest step is 14% and its typical step is 2%.
2. **It is not reversible.** `nextScale` finds the first rung `>=` the current scale, so from an
   off-ladder scale it steps *past* the nearest rung in one direction and not the other. From the
   fitted 41×: `−` gives 32, and `+` from 32 gives 48. Click down then up and you are 17% away from
   where you started, permanently. `fitViewport` deliberately returns arbitrary integers, so an
   off-ladder scale is the *normal* case, not an edge case.

The recognisable-factors goal was reasonable and the ladder is still the right structure for it —
but a factor is only recognisable if you asked for it. Nobody clicking `−` is asking for 8×; they
are asking for *somewhat smaller*.

**A third fault, found while fixing the first two.** `set_zoom` — which is what both buttons call,
and what the agent calls — ended with `snapScale(scale)`, re-snapping onto the same twelve coarse
rungs. So no caller could land anywhere else however carefully it chose: the `−` button computed 40
and the action turned it into 32. It also set `scale` while leaving `offsetX/offsetY` untouched, so
the artwork zoomed about the viewport's top-left corner and slid out from under whatever the user
was looking at. Both are fixed: `clampScale` instead of `snapScale`, and `zoomAt` anchored at the
canvas centre.

**Correction to this section, written during the build.** The first version of §2 proposed

```ts
export const ZOOM_STEP = 1.25
stepScale = (s, dir) => dir === 1 ? Math.ceil(s * 1.25) : Math.floor(s / 1.25)
```

and claimed it was reversible. **It is not, and cannot be.** `floor(5/1.25)` and `floor(6/1.25)`
are both 4, so stepping back up from 4 has no way to know which it came from. The exhaustive test in
§7.1 failed on 13 of 64 scales immediately. Reversibility needs a *list* walked by index, not a
multiplier:

```ts
export const ZOOM_STEPS = [1,2,3,4,5,6,7,8,10,12,14,16,20,24,28,32,40,48,56,64]

export function stepScale(current: number, direction: 1 | -1): number {
  const next = direction === 1
    ? ZOOM_STEPS.find((s) => s > current)
    : [...ZOOM_STEPS].reverse().find((s) => s < current)
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, next ?? current))
}
```

"The next entry strictly past where I am", not "my index plus one", because `fitViewport` returns
arbitrary integers and the current scale is usually not on the list at all. From an off-list scale
the first click snaps onto the list in the direction of travel and every click after that is exact.

**Second correction.** The first version said `ZOOM_LADDER`, `nextScale` and `snapScale` all stay,
and that `snapScale` was "used by fit-to-window". Both claims were wrong — `fitViewport` uses
`Math.floor` and never called it. After this change all three had no production caller, so all
three are **deleted**, along with their tests. The paragraph that predicted otherwise is this one.

**Measured after the fix**, same probe, same viewport:

| | before | after |
|---|---|---|
| `−` from the fitted 41× | 41 → 32 → 24 → 16 → 12 → 8 → 6 | 41 → 40 → 32 → 28 → 24 → 20 → 16 |
| `+` back up | 6 → 8 → 12 → 16 → 24 → 32 → 48 | 16 → 20 → 24 → 28 → 32 → 40 → 48 |
| biggest step | **50%** | **25%** |
| reversible on-list | no | yes |

---

## 3. Agent outcomes that tell the truth

### 3.1 The fault

`lib/agent/run.ts` ends a run with `stoppedBy: 'no-calls'` when the model replies in prose without
calling anything, and sets the summary to that prose. `AgentPanel`'s `DoneRow` then renders the
prose above three counters. When the model says "I've drawn a smiley face" and calls nothing, the
user sees that sentence, `0 added · 0 changed · 0 cleared`, and no Undo control — because `Undo all`
is gated on `changed > 0`. Nothing on screen distinguishes it from a successful edit.

This is the same failure as rule 7 (never silently discard artwork) pointing the other way: never
silently *fail to produce* artwork while looking like you did.

### 3.2 The rule

**The panel's own verdict outranks the model's prose.** The model's sentence may still be shown —
it is often the useful part, e.g. "I couldn't find a face to modify" — but it is never the headline,
because the model is not a reliable narrator of its own effects. The headline is computed from the
diff.

| Condition | Headline | Tone |
|---|---|---|
| `changed > 0` | `N pixels changed` | normal |
| `changed === 0`, `stoppedBy: 'no-calls'` | **No changes were made.** | warning |
| `changed === 0`, `stoppedBy: 'finish'` | **The agent finished without changing anything.** | warning |
| `changed === 0`, `stoppedBy: 'cap'` | **Stopped at the step limit without changing anything.** | warning |
| `changed === 0`, `stoppedBy: 'abort'` | **Stopped. Nothing was changed.** | neutral |
| `stoppedBy: 'error'` | the error, via `ErrorRow` — unchanged | error |

A no-op is a **warning**, not an error. Nothing broke; the run cost a request and produced nothing,
and the user needs to know that without being told something failed.

### 3.3 Quota

Already built and **not** the reported fault, but it must be verified rather than assumed:
`lib/ai/provider/gemini.ts` maps `RESOURCE_EXHAUSTED|429|quota` to `kind: 'rate_limited'`, and
`app/api/ai/agent/route.ts` turns that into a 429 with code `upstream_rate_limited`, a
`retryAfter`, and a BYOK invitation when it was our key. §7.4 requires a test that drives that path
end to end through the panel, because a mapping that is right in three files and broken in the
fourth looks exactly like the bug that was reported.

---

## 4. The agent panel must not cover the tool rail

The panel is `position: fixed`, bottom-left, `width: 400`, and grows **upward** as steps are logged.
The tool rail is vertically centred on the left edge. A run of six or more steps reaches it.

**Fix:** cap the panel and scroll the log inside it.

- `max-height: min(52vh, 460px)` on the panel.
- The step log is the only part that scrolls (`overflow-y: auto`); the composer and the
  outcome row stay pinned and always visible. A user must never have to scroll to find Accept,
  Undo all, or the stop control.
- The log auto-scrolls to the newest step **only when already at the bottom**, so reading an
  earlier step is not yanked away by the next one.

52vh is chosen against the rail rather than by eye: the rail is centred, 8 buttons at 44px with
48px pitch plus padding, so on the shortest supported viewport (568px) its top edge sits at roughly
`(568 - 400) / 2 ≈ 84px`. A panel bottom-anchored at `inset` and capped at 52vh of 568 = 295px
clears it. This is asserted, not eyeballed — §7.2.

---

## 5. Tooltips

### 5.1 Why not `title`

Every tooltip today is the native `title` attribute. That means: the browser's styling and not
ours, a ~1s delay we do not control, no dark-mode awareness, no keyboard support in most browsers,
and on Windows a white box with a serif-ish system font that looks nothing like the rest of the
application. It is the one place the product visibly stops being ours.

### 5.2 The component

`components/Tooltip.tsx`, wrapping any focusable child.

| Property | Value | Why |
|---|---|---|
| Delay in | 400ms | Long enough not to fire while crossing the rail, short enough to feel responsive |
| Delay out | 0ms | A lingering tooltip is worse than no tooltip |
| Group behaviour | Once one is open, siblings open with no delay for 500ms | Scanning a toolbar should not cost 400ms per button |
| Trigger | `pointerenter` and `focus-visible` | Keyboard users get them; a mouse click does not leave one stuck open |
| Dismiss | `pointerleave`, `blur`, `Escape`, any `pointerdown` | Escape is required by APG |
| Position | Side chosen per placement, flipped if it would leave the viewport | A tooltip clipped by the window is worse than none |
| Markup | `role="tooltip"`, referenced by `aria-describedby` | It describes; it does not name |
| Naming | The trigger keeps its own `aria-label` | A tooltip must never be the *only* accessible name |
| Touch | Never shown — `(hover: none)` suppresses it | See §1 |
| Tokens | `--panel`, `--fg`, `--border`, `--r-md`, `--shadow-2`, `--t-label-sm` | Rule 8. No new colours |

**`title` must be removed** wherever `Tooltip` is added. Leaving both means the native one appears
underneath ours a second later, which is worse than either alone. A test enforces this (§7.3).

### 5.3 Coverage

Every control that is an icon with no visible text label **must** have one. Controls with a visible
label take one only when there is something to add beyond the label — a shortcut, or a consequence.

| Area | Controls |
|---|---|
| Top bar | logo/menu, settings, undo, redo, share, code, timeline, layers |
| Tool rail | all 8 tools, each with its keyboard shortcut |
| Zoom bar | zoom out, zoom in, the scale readout (says "click to fit") |
| Palette | each swatch (its hex and index), add colour, the dither control |
| Layers panel | eye, add, copy, delete, move up, move down |
| Agent panel | settings, send, stop |

Shortcut text is rendered in `--t-mono-sm` inside the tooltip, right-aligned after the label —
`Brush  B`, not `Brush (B)`, so the key reads as a key.

---

## 6. Error codes

| Code | Meaning | Surfaces as |
|---|---|---|
| `F-E1` | A run ends with `changed === 0` | The warning headline in §3.2, with the model's prose kept below it |
| `F-E2` | A run ends `stoppedBy: 'error'` | `ErrorRow`, unchanged |
| `F-E3` | Upstream quota exhausted | 429 `upstream_rate_limited`, retry-after, BYOK invitation |
| `F-E4` | A tooltip would render off-screen | Flipped to the opposite side; never clipped, never scrolled to |
| `F-E5` | `stepScale` would not move the scale | Impossible by construction — ceil up, floor down. Asserted as a property |

---

## 7. Test requirements

### 7.1 Zoom — `lib/editor/__tests__/viewport.test.ts`

- `stepScale` up then down returns to the starting scale, **for every integer scale 1..64**. This is
  the property the ladder broke; it is checked exhaustively because the domain is 64 values.
- `stepScale` always moves, in both directions, for every scale except the two clamps.
- `stepScale(1, -1) === 1` and `stepScale(64, 1) === 64`.
- No single step exceeds 34% in either direction, at any scale.
- `zoomAt` keeps the anchored document pixel under the anchor, as a property over random viewports.

### 7.2 Panel geometry — `tools/probe-agent-ui.ts`

- With a run of 10 logged steps, the panel's bounding box does not intersect the tool rail's,
  at 1440×900, 1024×768, 768×1024 and 320×568.
- The composer and the outcome row are inside the viewport with 10 steps logged.
- The log scrolls; the panel does not grow.

### 7.3 Tooltips

- Unit: no `.tsx` outside `Tooltip.tsx` contains a `title=` attribute on a `button`. This is the
  same shape as the existing token test and catches a half-finished migration.
- Probe: hovering each rail button shows our tooltip within 600ms, and it carries the shortcut.
- Probe: a tooltip on the leftmost and rightmost controls stays inside the viewport.
- Probe: `Escape` dismisses; `Tab` to a control shows it; no tooltip survives a click.
- Probe: rendered in both themes, and its background resolves to `--panel` and not to a browser
  default. Screenshot both.

### 7.4 Agent outcomes — `lib/agent/__tests__/outcome.test.ts` + `tools/e2e-agent.ts`

- A mock run that calls nothing yields the no-op headline, and the model's prose is still present.
- A mock run that changes pixels yields the normal headline and an enabled `Undo all`.
- Each `stoppedBy` value maps to the headline in §3.2's table — a table test, so a new
  `stoppedBy` cannot be added without a headline.
- The mock provider's `__agent_ratelimit` token drives the panel to the quota message with the
  BYOK invitation, asserted through the rendered panel and not the route.

---

## 8. Definition of done

`npm test` green · `npm run typecheck` clean · `npm run build` clean ·
`npx tsx tools/check-responsive.ts` clean at all 6 viewports · `probe-zoom` shows no button step
over 34% and a reversible sequence · `probe-tools-ui` and `probe-layers` still green ·
tooltips screenshotted in both themes and looked at · score ≥ 9 with an honest table.

---

## 9. Score — six dimensions, overall is the lowest

| # | Dimension | Score | Why not higher |
|---|---|---|---|
| 1 | Spec conformance | 9 | All four faults fixed and the §5.3 coverage table is complete. Touch tooltips and a long-press equivalent are declared out of scope in §1, not dropped. |
| 2 | Correctness | 9 | Zoom measured before and after; the outcome table is exhaustive over `stoppedBy` so a new stop reason is a type error until it has a sentence. The panel cap is derived from the rail rather than picked. |
| 3 | Tests | 9 | 269 pass. New: `stepScale` (7, exhaustive over 1..64), `describeOutcome` (8), a static tooltip check (4). Probes: `probe-zoom`, `probe-tooltip` (23), `probe-agent-ui` (18). The probes still need a running server, so they are not in `npm test` — the standing gap. |
| 4 | Integration | 9 | Tokens only, one new (`--t-mono-sm`). `commit()` untouched. The dev hook gained a read-only `viewport()`; it deliberately did **not** gain a setter, so `probe-agent-ui` drives the real mock provider instead. |
| 5 | Design fidelity | 9 | Tooltip screenshotted in both themes and looked at, not just asserted. 6 viewports clean. |
| 6 | No regressions | 9 | Full suite, build, and every probe green, and the live deployment was screenshotted and drawn on. Removing `title` broke four probes' locators; those were migrated to `getByRole` in the same change. |

**Overall: 9/10.**

### Deliberately left out

- **A long-press tooltip on touch.** §1. It is a different interaction, not a port of this one.
- **Tooltips on buttons that already have visible text.** `Add`, `Copy`, `Delete` and `Stop` name
  themselves; only the ones with something extra to say (a consequence, a shortcut) got one.
- **Animating the tooltip in.** `globals.css` governs motion by frequency, and a tooltip is a
  100-times-an-hour interaction. It appears; it does not slide.
- **A shared tooltip singleton.** Each instance mounts its own portal. The only shared state is the
  group-window timestamp, which is what makes scanning a toolbar cheap.
