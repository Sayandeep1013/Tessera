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
