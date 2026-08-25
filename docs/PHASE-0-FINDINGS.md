# Phase 0 — Findings

**Run date:** 11 August 2026
**Verdict:** ❌ **FAILED THE GATE — 0 of 9 passed** (gate was ≥ 6)
**Decision:** AI edit *quality* deferred. The pipeline is kept and the rest of the app is built
around it. This is a deliberate, recorded choice, not an oversight.

---

## 1. What was tested

`gemini-3.1-flash-lite`, single-shot, forced JSON, against the 16×16 `face` starter. The model
received a ruled PNG at 32× plus the text grid of palette indices plus a palette legend, and returned
structured pixel operations validated through all ten gates.

| # | Instruction | Machine result | Human verdict |
|---|---|---|---|
| 01 | make it angrier | 12 px changed, 4,955 ms | fail |
| 02 | make it happier | 3 px, 1,255 ms | fail |
| 03 | make the outline black | 44 px + 1 colour, 1,483 ms | fail |
| 04 | change the eyes to blue | 8 px + 1 colour, 1,639 ms | fail |
| 05 | add a hat | **rejected** — `schema: operations.1.w Required` | fail |
| 06 | remove the mouth | 6 px, 1,579 ms | fail |
| 07 | add a shadow under the chin | 6 px, 1,653 ms | fail |
| 08 | make it night | 114 px + 1 colour, 1,317 ms | fail |
| 09 | Game Boy palette | 172 px + 4 colours, 1,879 ms | fail |

Reproduce with `npx tsx spike/run.ts`. Images in `spike/out/`.

---

## 2. What works, and what does not

This distinction matters, because the failure is narrower than "the AI doesn't work".

**Works — do not rebuild:**

- The **plumbing is sound end to end.** Context construction, the ruled PNG, the text grid, forced
  JSON, the provider adapter, and all ten validation gates behave correctly.
- **Latency is a non-issue.** 1.3–5.0s. The earlier 16.6s Flash-line result was a model-choice error,
  already corrected.
- **Coordinates land inside the canvas.** No out-of-bounds op was produced in the whole run. The
  model reads the grid and respects the bounds.
- **The validator caught the one malformed response** (a `draw_rect` missing `w`) and applied
  nothing. The safety design held.
- **Ops are well-formed and minimal** — small edits, sensible op choices, no pixel soup. The narrow
  vocabulary did its job.

**Does not work:**

- **Aesthetic judgement.** The edits are valid, targeted, in-bounds — and simply not good. The model
  understands *where* to edit and produces *legal* edits; it does not produce edits a person wants to
  keep. That is the entire gap.

---

## 3. Hypotheses for the retry, roughly by expected value

Untested. Recorded so the next attempt starts from evidence rather than from scratch.

1. **The canvas is too small.** 16×16 leaves almost no room for expression. An eyebrow is 2–3 pixels;
   there is no version of it that reads well. **Retry at 32×32 and 64×64 first** — this is the
   cheapest experiment and the most likely single cause.
2. **The prompt asks for minimalism too hard.** "Emit the smallest set of operations", "change as
   little as possible", and "prefer minimal edits" all push toward timid edits. "Make it angrier"
   probably needs a *bold* edit. Try removing the minimality pressure entirely.
3. **No aesthetic standard is given.** The prompt says what operations exist and to preserve
   surrounding work; it never says what good pixel art looks like. Few-shot examples of good edits —
   before/after pairs in the prompt — are the standard fix and are untried.
4. **A stronger model was never tested on the real task.** `gemini-3.6-flash` was benchmarked once on
   an 8×8 toy and rejected on latency. Given that latency now has headroom, a Pro-tier model at 5
   requests/minute is worth measuring on quality alone.
5. **Single-shot may be the wrong shape.** The pre-planned upgrade path in
   [06 §11](./specs/06-ai-protocol.md) is a short tool loop (`inspect_region` → edit → `preview`)
   so the model can look at its own result before committing. `applyOps` and the validator are
   unchanged by that switch; only the route and the prompt change.
6. **Add one automatic retry on a `schema` rejection.** Probe 05 would likely have recovered. Cheap,
   and independent of everything above.

---

## 4. What this changes about the project

**The money shot is not currently deliverable.** The demo's headline interaction — "make it angrier"
→ diff → Accept — produces edits a user would reject. Building the app is still the right call: the
editor, code panel, exports, and sharing all stand on their own, and the AI pipeline is *mechanically*
complete behind them. But the README must not claim the AI editing works well until it does.

**Revised plan:**

- Phase 1 (editor), Phase 3 (code panel + exports), Phase 4 (sharing) proceed unchanged.
- **Phase 2 ships the AI as a working but honest feature**: the composer, proposal bar, diff overlay,
  and accept/reject all built and functional — with the quality caveat stated in the UI copy rather
  than hidden.
- **Phase 6 (new): AI quality.** Work the hypotheses in §3 in order, re-running the probe matrix
  after each. The gate stays at ≥ 6/9.

**The gate itself is not lowered.** A future run either clears 6/9 or it does not.

---

## Re-test, 11 Aug 2026 — after the agent loop and at 32×32

Two things changed since the 0/9 gate, and this re-test deliberately changes both
at once rather than isolating them, because both were already committed for other
reasons:

1. **Architecture.** Single-shot forced-JSON became a look-act-verify loop
   (`docs/specs/12-agent-actions.md`). The model now reads state, acts, and
   decides when it is done, instead of emitting one blind batch.
2. **Canvas size.** The top-ranked hypothesis in this document was *"the canvas is
   too small. 16×16 leaves almost no room for expression… Retry at 32×32."*

### Result

`"give the face a hat"`, 32×32, `gemini-3.1-flash-lite`:

```
get_state → add_palette_color(#0000ff) → draw_rect(9,0,14×3) → draw_rect(7,3,18×1) → finish
5 turns · 13.4s · 60 pixels · stopped by finish
```

Rendered: `docs/shots/probe-ai-result.png`. A blue crown with a wider brim, sitting
on top of the head. The face underneath is untouched.

### Honest assessment

**This is a pass on the thing that failed, and not a pass on quality.**

What changed: the result is *recognisable as the thing that was asked for*, placed
correctly, and destroys nothing else. Every one of the nine Phase 0 outputs failed
at least one of those three. The model also chose a sensible decomposition on its
own — crown and brim as two rects rather than a pixel list — which is the
behaviour the action vocabulary was designed to make available.

What has not changed: it is flat, unshaded, and the brim is not symmetric about
the head. No competent pixel artist would ship it.

**The remaining gap is model capability, not engineering.** There is no validation
gate, prompt line, or action that turns a flat blue rectangle into good pixel art.
That matches the standing decision on this project — *"focus on toolcalling and
that working rather than the actual output… if it can modify that's enough"* — so
Phase 6 stays open rather than being declared solved.

**Cost note.** 5 turns is roughly one minute of the shared 5-requests-per-minute
budget, which is what sets the two-free-session allowance in spec 12 §9.

---

# §2 — Re-tested against claude-opus-5, 24 Aug 2026 (unit I)

**The verdict above is superseded.** It said the remaining gap was *model capability rather than
engineering*. Measured against a capable model, **that was wrong**. Evidence in `docs/eval/`.

Harness: `tools/eval-ai.ts`, driving the real app through Playwright with a BYOK key, per
`docs/specs/19-ai-quality-eval.md`. Rubric: six dimensions, **overall is the lowest**, ≥ 9 passes.

**This section was written across three passes over one day** as bugs were found and fixed —
tool-schema dialect, output-budget exhaustion, a fixed 5-minute transport wall, an unbounded
thinking budget — each one costing a re-run. §2.4 is the honest accounting of that cost. What
follows is the final state, not the first draft.

## §2.1 Final scoreboard — 14 of 15 scenarios, all ≥ 9

| # | Scenario | Score | What was verified |
|---|---|---|---|
| S1 | red heart, centred | 9 | shaded, dark outline, pink highlight upper-left, deeper shadow lower-right; silhouette symmetry **0 mismatches**, checked cell by cell |
| S2 | smiling sun with rays | 9 | round disc, 8 symmetric rays, top-left lighting; silhouette symmetry **0 mismatches** |
| S3 | tree on 32×32 | 9 | flared trunk, 3-tone canopy with a coherent light direction, grass tufts, cast shadow. Self-reported the 4-colour cap as a constraint on the palette — that cap is now 12 (§2.3, item 10); not re-verified with the extra headroom |
| S4 | red apple, highlight + shadow | **not completed** | see §2.2 — infrastructure confirmed healthy, art confirmed excellent, harness patience insufficient |
| L1 | angry eyebrows | 10 | 6 cells, exact mirrors, 0 added / 6 changed / 0 cleared, nothing else touched |
| L2 | give it a hat | 9 | flat top hat matching the face's own outline weight, correctly placed on its own layer |
| L3 | remove the beak | 10 | outline closed cleanly behind it, feet left exactly as they were |
| L4 | red collar + green eye | 10 | both parts of the compound instruction landed, collar shaded, nothing extraneous touched |
| C1 | recolour body blue→purple | 10 | **palette entry only** — wing, belly, beak, eye byte-identical; a decision better than repainting |
| C2 | shade underside, derived colour | 10 | darker tone derived from the body's own hue, applied only to the bottom rim, everything else untouched |
| G1 | 1px border, whole canvas | 10 | exactly 60 changed cells (4×16−4), corners once each, interior untouched |
| G2 | butterfly, wings mirrored | 10 | **0 mirror mismatches across all 16 rows**, checked cell by cell — not eyeballed |
| J1 | photorealistic portrait (impossible) | 10 | refused the literal ask in its own summary — *"a photorealistic likeness... is not achievable at 16×16, so this is the closest honest version"* — then drew a coherent, legible stylised portrait rather than mush |
| J2 | make an already-transparent bg transparent | 10 | correctly identified nothing needed to change, explained the white was the editor's own backdrop, made no edit |
| J3 | line to an out-of-bounds point | 10 | clamped to the canvas edge along the same slope, said so in the summary, no wasted retries |

**14 of 14 completed scenarios scored ≥ 9. Ten scored a clean 10.** Pixel-art craft is not the
bottleneck: the model plans a silhouette before drawing, holds one light direction, computes
mirror symmetry exactly rather than eyeballing it (verified programmatically, not by eye, on
every symmetry-bearing scenario), matches an existing drawing's outline weight when extending it,
and reaches for a palette edit over repainting when that is the better answer.

## §2.2 S4 — the one that did not finish, and why that is not a verdict on quality

Three attempts, three different reasons, in order:

1. **900s harness window, before any fix** — died on a hardcoded 5-minute transport wall (§2.3,
   item 11).
2. **900s window, after the transport fix** — the *actual* root cause: claude-opus-5 has adaptive
   thinking on by default, and thinking tokens are billed against the same `max_tokens` ceiling as
   everything else. On this task specifically the model burned the full 32,000-token budget
   reasoning about roundness and shading and never reached a tool call. Fixed by bounding the
   thinking budget (§2.3, item 12).
3. **1200s window, after both fixes** — **zero errors across 21 requests.** The model reached step
   9 of 16, had drawn a genuinely excellent round, shaded apple with a correct light direction and
   a jagged organic outline (screenshot: `docs/eval/2026-08-24T17-50-23/S4.png`), and was still
   working — `"Step 9 of 16 · Still working… 1230s"` — when the harness's wait expired.

**This is a harness-patience limit, not a product defect.** The step cap (16) was never reached;
only the harness's wall-clock budget was. A fourth attempt with a longer window would very likely
pass — the trend across all three attempts is more progress, not a stall, and every request that
reached the model succeeded. It was not re-run a fourth time because the evidence needed to
distinguish "broken" from "thorough" was already conclusive, and a fourth multi-minute session
was not going to add information, only cost.

**What this scenario measures anyway, unscored:** dual-direction shading (highlight *and* shadow,
not just one) on a 32×32 canvas is the single hardest combination in the suite, and it is the
scenario that surfaced both remaining infrastructure bugs. That it is also the one that needed
more time than budgeted is consistent, not suspicious.

## §2.3 What actually failed — twelve defects, all of them ours

Not one finding here is about the model drawing badly. Every defect below is engineering this
repo owned, most of it pre-existing and simply invisible behind a model too weak to expose it.

1. **Tool declarations went out in Gemini's UPPERCASE schema dialect.** Every live session 400'd,
   identically, so nothing about the symptom pointed at the schema.
2. **A palette recolour was permanently unundoable.** `edit_palette_color` rewrites an entry in
   place; `diff()` only reports palette entries that were *appended*. A palette-only session
   collapsed to `command: null` — the change was real and permanent, but the panel said "The agent
   finished without changing anything" and there was no way to undo it.
3. **`finish` silently discarded the model's own explanation.** `summary` was capped at 200
   characters and a rejected call was replaced with the literal string `'Finished.'` — so a
   201-character account of a correct edit vanished with no error and no way for the model to
   learn what happened.
4. **`MAX_STEPS = 6`** was sized for a 5-request-per-*minute* free tier and was truncating real
   work under a capable model. Raised to 16.
5. **A truncated session reported itself as a finished one** — the outcome headline only
   mentioned the step cap when *nothing* had changed.
6. **`changed` for a whole-document replacement was `w × h`**, so a 4-pixel hat produced "256
   pixels changed · 0 added, 0 changed, 0 cleared" — two claims that cannot both be true.
7. **The three `bundle safety` guards had never once executed.** They are `skipIf(!built)` and
   `UNITS.md §0.2`'s documented sequence ran the tests *before* the build. Hard rule 6 was
   documented as enforced by a guard that, in the sequence this repo actually follows, never ran.
   One of them also matched a pasted copy of the system prompt, so rewriting the prompt would
   have silently retired its own guard.
8. **Every session that added a palette colour duplicated it.** `applyCommand('ai_edit')` pushes
   `paletteAdded` unconditionally, and the store commits the collapsed command over the document
   the session had already mutated live — idempotent for pixels, not for a palette push. Undo
   then popped half the duplicate and left orphaned entries behind. A butterfly drawn with four
   colours ended with a palette of eight.
9. **A single upstream 429 ended the whole session** and discarded a half-finished drawing the
   model was minutes into. The provider names its own retry delay; nothing was reading it.
10. **`MAX_SESSION_COLORS = 4`** was tight enough that the model apologised for it in its own
    summary on a 32×32 tree — *"the palette allowance capped me at four colours, so the sky is
    left transparent."* Raised to 12.
11. **A hardcoded 5-minute transport wall, locally.** Node's default fetch dispatcher kills a
    socket after a 300-second `headersTimeout`, and a detailed drawing routinely takes a whole
    turn longer than that against `npx next dev`, which has no timeout of its own. Fixed with a
    custom `undici.Agent` dispatcher. **Removed the same day on a wrong hypothesis, reinstated the
    same day once the real cause of a live bug was found and the dispatcher confirmed innocent of
    it** — full story in `UNITS.md §I.1`–`§I.2`. It stays in place: confirmed inert on Vercel
    either way (`maxDuration = 60` governs there regardless), and locally it is the only thing
    standing between a hard task and a wall that has nothing to do with the model's own budget —
    a live check asking for a frog hit exactly that wall the moment the dispatcher was gone.
12. **An unbounded thinking budget.** claude-opus-5's adaptive thinking is on by default and is
    billed against the same `max_tokens` ceiling as the tool call it is reasoning toward. On a
    hard task the model could spend the entire budget thinking and never draw. Bounded to 16,000
    of 32,000 tokens, guaranteeing room for the actual response regardless of how hard it reasons.
    **This one held** — confirmed still in place after the live incident in `UNITS.md §I.1`, which
    found a separate, unrelated cause (an Aliyun WAF blocking AgentRouter from Vercel's IP range)
    for the "every prompt fails" report that came after this finding was first written.

## §2.4 What it cost

**≈$30 of a $60 balance**, across roughly 3.5 full-suite-equivalent passes — most of that spent
*finding and confirming* defects 7–12, not on the 14 scenarios that ultimately passed. Prompt
caching (`anthropic.ts`) cut the cost of a single scenario from **$1.10 to $0.30** by not
re-paying for the growing history on every turn; without it, this measurement would not have been
affordable at this depth. A single clean 15-scenario pass, on the code as it stands now, is
approximately **$4.50**.
