# 19 — AI quality: the eval, the rubric, and the loop

**Owns:** `tools/eval-ai.ts`, `docs/eval/**`, and the tuning of `lib/agent/prompt.ts`
**Depends on:** [18 — Provider and BYOK](./18-provider-byok.md) · [12 — Agent Actions](./12-agent-actions.md)
**Unit:** I, phase 2 · **Written:** 24 Aug 2026

---

## 0. What this is

[`PHASE-0-FINDINGS.md`](../PHASE-0-FINDINGS.md) failed the AI quality gate **0/9** and the
conclusion recorded was *"the remaining gap is model capability rather than engineering."* That
conclusion was reached against `gemini-3.1-flash-lite` on a free tier at 5 requests per minute,
because that was the only model the project could reach.

Unit I removed that constraint. `claude-opus-5` is now reachable through the adapter, verified
live on 24 Aug 2026. **So the deferred question is open again, and this spec is how it gets
answered — by measurement, not by assertion.**

The one rule that governs everything below:

> **A scenario passes at ≥ 9. The overall score is the LOWEST dimension, never the average.
> Nothing is rounded up to clear the gate.**

That is `WORKFLOW.md §6` applied to artwork instead of code, and it is the same rule that caught
three real gaps when the agent unit was scored honestly at 5.

---

## 1. What "capably test the AI" means

A pixel-art agent can be bad in ways that do not overlap. Scoring three variations of "draw a
thing" measures one capability three times and calls it thorough. The scenarios below are chosen
so that **each one can fail while the others pass** — that is the property that makes a suite
diagnostic rather than decorative.

Six capability axes, and what breaks along each:

| Axis | The failure it catches |
|---|---|
| **Synthesis** | Can it compose a recognisable subject from nothing, at a size where every pixel is a decision? |
| **Localisation** | Can it find a named feature in existing artwork and change *only* that? |
| **Preservation** | Does everything it was not asked about survive? This is the axis Phase 0 failed hardest. |
| **Colour reasoning** | Does it reuse the palette sensibly, add a colour only when needed, and pick one that belongs? |
| **Geometry** | Are coordinates exact — borders closed, shapes symmetric, nothing off by one? |
| **Judgement** | Does it refuse the impossible, notice the already-done, and describe honestly what it did? |

---

## 2. The scenarios

Fifteen. Each names its axis, its starting document, its instruction, and — the part that makes
it a test rather than a demo — **what specifically would count as a failure.**

`face` and `bird` are the 16×16 starters in `lib/artwork-core/fixtures/starters/`. `empty-N` is a
blank N×N document with only the transparent entry in its palette.

### Synthesis

| # | Start | Instruction | Fails if |
|---|---|---|---|
| **S1** simple shape | `empty-16` | "Draw a red heart in the middle." | Not recognisable as a heart; not centred; asymmetric halves. |
| **S2** simple subject | `empty-16` | "Draw a smiling yellow sun with rays." | No distinguishable disc, or rays that read as noise. |
| **S3** complex subject | `empty-32` | "Draw a tree: brown trunk, green leafy canopy, on grass." | Parts unidentifiable, trunk not connected to canopy, canopy a flat rectangle. |
| **S4** complex + shading | `empty-32` | "Draw a red apple with a highlight and a shadow so it looks round." | Flat fill with no light logic — the exact failure Phase 0 recorded as "still flat and unshaded". |

### Localisation and preservation

| # | Start | Instruction | Fails if |
|---|---|---|---|
| **L1** the Phase 0 test | `face` | "Make the eyebrows angry." | Eyebrows unchanged, or anything else touched. **This is the direct comparison against the 0/9 baseline.** |
| **L2** additive | `face` | "Give it a hat." | Hat floats, overlaps the face, or clashes with the outline weight. |
| **L3** removal | `bird` | "Remove the beak." | Leaves a hole in the outline, or removes part of the head. |
| **L4** compound | `bird` | "Give it a red collar and make its eye green." | Only one of the two lands. |

### Colour reasoning

| # | Start | Instruction | Fails if |
|---|---|---|---|
| **C1** recolour | `bird` | "Change the body from blue to purple." | Recolours the wing or the belly too; or enumerates pixels instead of using `replace_color`. |
| **C2** derive a colour | `bird` | "Shade the underside of the body with a darker version of its own colour." | Adds a colour unrelated to the body's hue, or blows the 4-colour session budget. |

### Geometry

| # | Start | Instruction | Fails if |
|---|---|---|---|
| **G1** exactness | `empty-16` | "Draw a 1-pixel border around the entire canvas edge." | A gap, a doubled corner, or a line one pixel inside the edge. |
| **G2** symmetry | `empty-16` | "Draw a butterfly with both wings exactly mirrored." | Wings differ by even one pixel. |

### Judgement

| # | Start | Instruction | Fails if |
|---|---|---|---|
| **J1** impossible | `empty-16` | "Draw a photorealistic portrait of a specific person." | Produces mush and calls it done, instead of saying plainly what 16×16 can carry. |
| **J2** already true | `face` | "Make the background transparent." | Thrashes, or claims a change it did not make. It is already transparent. |
| **J3** out of bounds | `empty-16` | "Draw a line from (0,0) to (40,40)." | Burns the step budget retrying a rejected call instead of clamping to the canvas. |

### Deliberately not in the suite

- **Destructive confirmation** (`new_document`) — the confirm round trip is already covered by
  `tools/e2e-agent.ts` against the mock, where the assertion is deterministic. Re-testing it
  against a live model measures the model's mood, not the mechanism.
- **Rate-limit and error paths** — spec 18 §9 covers these with a mocked fetch. A live suite is
  the wrong instrument for a 429.

---

## 3. The rubric

Six dimensions per scenario, scored 1–10. **Overall = the lowest.**

| # | Dimension | 10 means |
|---|---|---|
| 1 | **Instruction fidelity** | Every part of what was asked was done. A two-part instruction did both. |
| 2 | **Craft** | It reads as the thing. Clean edges, deliberate shapes, no orphan pixels, no noise. |
| 3 | **Preservation** | Everything not mentioned is byte-identical. Verified against the document, not by eye. |
| 4 | **Colour discipline** | Palette reused where sensible, new colours justified and well-chosen, within budget. |
| 5 | **Efficiency** | No wasted turns, no re-reading the grid to admire the result, no thrashing on a rejection. |
| 6 | **Honesty** | The `finish` summary matches what actually happened — no claimed changes that did not land. |

**Dimensions 3, 5 and 6 are machine-checkable** and the harness computes them: a pixel diff
against the starting document answers preservation, the step log answers efficiency, and the
summary against the actual diff answers honesty. **Dimensions 1, 2 and 4 require looking at the
rendered result** — `HANDOFF.md §3` is explicit that measured and looked-at catch different
bugs, and craft is not a number any assertion produces.

So every run produces both: a JSON record with the computed dimensions, and a PNG that a human
(or an agent with eyes) has to actually open. **A run that was not looked at is not a score.**

---

## 4. The harness

`tools/eval-ai.ts`, driving the real app through Playwright — not the runner in isolation. What
gets rated has to be what a user would actually get, including the context builder, the action
registry, the validator and the store.

```
AI_PROVIDER=anthropic npx next dev --turbopack -p 3100
EVAL_URL=http://localhost:3100 npx tsx tools/eval-ai.ts            # all 15
EVAL_URL=http://localhost:3100 npx tsx tools/eval-ai.ts L1 C1      # named subset
```

Per scenario: seed the BYOK config into `localStorage` before load, open the starting document
through the dev hook, capture the document bytes *before*, type the instruction, wait for the
session to settle, then capture bytes *after*, a PNG of the canvas, the step log, the summary,
the turn count, latency and token usage.

Everything lands in `docs/eval/<runId>/` — one PNG and one JSON per scenario, plus `index.json`.

**It spends real money.** Each scenario is one agent session, a handful of Opus turns. The
harness prints cumulative token usage and supports a subset argument precisely so that iterating
on one failing scenario does not re-run fourteen passing ones.

---

## 5. The loop

```
run the suite → look at every PNG → score honestly → for each scenario < 9:
    name the CAUSE, not the symptom → change one thing → re-run THAT scenario
    → if it improved without breaking others, keep it; else revert
→ when every scenario is ≥ 9, re-run the whole suite once more to confirm
```

### 5.1 Where to reach when a score is low

In order of how much they are worth, and each is a hypothesis to be tested rather than a fix to
be assumed:

1. **The system prompt.** `AGENT_SYSTEM_PROMPT` was written for a 5-requests-per-minute free
   tier and *says so* — "You have very few steps. Spend them on the edit, not on looking." That
   is advice to rush, aimed at a constraint that no longer exists, and it is the first suspect
   for anything that looks like haste. Pixel-art craft guidance (shading, outline weight,
   symmetry, reading the grid before drawing) is absent entirely, because with the old model
   there was no budget to spend on it.
2. **`MAX_STEPS = 6`.** A runaway guard sized against free-tier pacing. If sessions are ending on
   the cap rather than on `finish`, the guard is the bug.
3. **The context.** Re-attaching a rendered PNG after mutations — [12 §5](./12-agent-actions.md)
   names this as the lever for "a text grid may be insufficient to judge appearance" and notes it
   is a change to `run.ts` only. Unaffordable before; affordable now. **Only pull this if the
   failures are specifically about appearance the model could not see.**
4. **The action catalogue.** If the model reaches for something that does not exist, or
   enumerates pixels where one call should do, the vocabulary is wrong.
5. **Canvas size.** Phase 0 already found 32×32 produces better results than 16×16. If S1–S2 fail
   where S3–S4 pass, that is this, and it is a finding about the product's defaults.

### 5.2 What is not allowed

- **Tuning the prompt per scenario.** One prompt serves all fifteen. A prompt that names the test
  is a prompt that has been fitted to it.
- **Rewriting a scenario because it fails.** The instruction stands. If a scenario turns out to be
  unfair — ambiguous, or testing two axes at once — say so, fix it, and **re-run everything**,
  because the suite changed.
- **Scoring from the JSON alone.** Craft is dimension 2 and it needs eyes.
- **Reporting a partial run as a suite result.**

---

## 6. Definition of done

- [ ] All 15 scenarios run end to end against `claude-opus-5` through the real app
- [ ] Every result looked at, not just tallied
- [ ] Every scenario ≥ 9, lowest-dimension scoring, with the per-dimension table recorded
- [ ] The final prompt is a single prompt that was measured before and after every change
- [ ] `PHASE-0-FINDINGS.md` gains a dated section stating the new verdict **whatever it is**, and
      if the answer is still "not artist-grade", that is written down as plainly as the first time
- [ ] Total spend reported
