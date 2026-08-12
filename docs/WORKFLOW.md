# Working Loop

The process every unit of work follows. A "unit" is one sub-spec's worth of scope — roughly a phase
or a module, never "the whole app".

```
   ┌─────────────────────────────────────────────────────────────┐
   │                                                             │
   ▼                                                             │
1. SCOPE      what are we building or fixing, and why            │
2. SPEC       write / extend the sub-spec in docs/specs/         │
3. REVIEW     self-review the spec, then user review             │
4. PLAN       implementation plan + task list (live-updating)    │
5. BUILD      execute the plan, updating tasks as you go         │
6. SCORE      review the result against intent + spec, score it  │
   │                                                             │
   └── score < 9/10 ──► list gaps, fix, re-score ────────────────┘
   │
   └── score ≥ 9/10 ──► done; next unit
```

---

## 1. Scope

State in one or two sentences: what is being built or fixed, which sub-spec governs it, and what
"done" looks like. If the scope spans more than one sub-spec, split it — do not widen the unit.

Ambiguity is resolved **here**, not during the build. If two readings of the request lead to
materially different work, ask before writing the spec.

## 2. Spec

Every unit has a sub-spec in `docs/specs/NN-name.md` before any code is written. A sub-spec contains,
at minimum:

- **Owns** — which files/directories this spec is the authority for
- **Depends on** — which other sub-specs must be read first
- Rationale for any non-obvious decision (so a future reader can tell a constraint from an accident)
- Concrete type signatures and data shapes — not prose descriptions of them
- Every error case with a stable error code
- Edge cases, enumerated
- **Test requirements** — the specific assertions that must exist and pass

If the unit is a fix rather than a feature, extend the governing sub-spec with the corrected
behaviour instead of writing a new one. Specs are living documents; they are updated, not appended to
with errata.

## 3. Review

**Self-review first**, against this checklist:

- [ ] No `TODO`, `TBD`, or bracketed stub left in the text
- [ ] No internal contradiction with an earlier section or another sub-spec
- [ ] Nothing in scope that the request did not ask for
- [ ] No requirement two competent people would implement differently
- [ ] No claim about the codebase, the environment, or a third-party API that was inferred rather
      than verified
- [ ] Every error case has a code; every edge case has a stated behaviour
- [ ] Test requirements are specific enough to write directly from

Fix problems inline. **Never present a spec with a known defect and a note apologising for it.**

Then user review. Proceed on approval.

## 4. Plan

Produce a task list — one task per independently verifiable step, ordered by dependency. Tasks are
tracked in the live task list and updated as work proceeds: `in_progress` when started, `completed`
when its acceptance criterion passes. **The task list is updated during the work, not reconstructed
afterwards.**

A task is well-formed when its completion is checkable without judgement:

- Bad: "implement the renderer"
- Good: "renderDoc draws every fixture identically to its golden PNG; `pnpm test renderer` green"

## 5. Build

Execute in order. Rules:

- A task that turns out to be wrong stops the work — go back to step 2 and correct the spec. Do not
  route around a spec defect silently.
- Tests ship in the same change as the code they cover, never as a follow-up task.
- If a task is blocked, mark it and continue with everything that is not blocked. Report the block
  with the score.

## 6. Score

Review the result against **both** the sub-spec and the original intent. Score each dimension 1–10:

| # | Dimension | 10 means |
|---|---|---|
| 1 | **Spec conformance** | Every stated requirement implemented, nothing silently dropped |
| 2 | **Correctness** | Works on the happy path and every enumerated edge case; no known bugs |
| 3 | **Tests** | Every test requirement in the spec exists and passes; they would catch a regression |
| 4 | **Integration** | Module boundaries respected; global rules (SPEC.md §12) upheld; no new coupling |
| 5 | **Design fidelity** | Matches `02-design-system.md` to the measurement, in both themes and all viewports |
| 6 | **No regressions** | Everything that worked before still works; full suite green |

**Overall = the lowest dimension score**, not the average. A unit with perfect tests and a broken
edge case is not a 9.

Report the score as a table with a one-line justification per dimension, then:

- **≥ 9** — done. State what, if anything, was deliberately left out and why.
- **< 9** — list the specific gaps, fix them, re-score. Repeat until ≥ 9.

Do not inflate. A self-assessed 9 that a user immediately finds a bug in is worse than an honest 6 —
the point of the score is to catch the gap before they do. Scoring your own work generously to reach
the threshold defeats the entire loop.

---

## Applies to every unit

- The document is the source of truth. Never introduce a second one.
- Never make a rendered image the source of truth.
- Every AI-produced operation is validated before it touches anything.
- The Anthropic API key is server-side only.
- Never silently discard artwork.
- Colours come from tokens; no hard-coded hex outside `globals.css`.
- When the spec turns out to be wrong, say so and propose the change — do not work around it.

---

## Continuity between sessions

A unit is not finished when the code works. It is finished when the next agent
can start without asking anything.

**[`docs/UNITS.md`](./UNITS.md) §0 is the protocol** — what to do on starting,
and the six steps to complete before stopping. The important ones:

- Update the ledger: your unit to `DONE` with date, commit and score; the next
  unit to `NEXT`.
- Write that unit's **Context handed over** — not a summary of what you did, but
  the specific things that would otherwise be rediscovered the hard way. What
  already exists that they will assume does not. Which control is the wrong one
  to reuse. Which spec section is stale.
- Add any new trap to `HANDOFF.md §5`.
- Update `HANDOFF.md §0` so its prompt is the next unit's.

The test of a good handover is whether the next session's first tool call is
useful work rather than an orientation question.
