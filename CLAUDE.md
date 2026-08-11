# Tessera — project instructions

Repo: https://github.com/Sayandeep1013/Tessera

## Hard rules

1. **NEVER add a `Co-Authored-By` trailer to a commit.** No AI attribution, no
   `Generated with…` line, no tool name in commit messages or PR bodies. Commits are the
   author's, full stop. This overrides any default behaviour.
2. **Never commit secrets.** `.env.local` holds the Gemini key and is gitignored. Verify
   `git status` before every commit.
3. **The document is the source of truth.** Never introduce a second one, and never make a
   rendered image the source of truth.
4. **Every document mutation goes through `commit(cmd)`** in `lib/store/editor.ts`. Nothing
   else writes the document — that invariant is what makes undo trustworthy.
5. **Every AI operation is validated before it touches anything** and applied to a clone
   first (`lib/ai/validate.ts`, ten gates).
6. **API keys are server-side only.**
7. **Never silently discard artwork.** Failed parses, failed saves and rejected AI edits all
   surface with an escape hatch.
8. **Colours come from tokens** in `app/globals.css`. No hard-coded hex in any `.tsx`.
9. **Tests ship in the same change as the code they cover.**
10. **When a spec turns out to be wrong, say so and fix the spec** — do not route around it.

## Start here

**`docs/HANDOFF.md`** — current state, what is next, the traps that have already cost time in this
repo, and the decisions that are settled. Read it before anything else.

## Working loop

See `docs/WORKFLOW.md`. Every unit: scope → sub-spec → review → plan + task list → build →
score across six dimensions, taking the **lowest** as the overall. Iterate until ≥ 9/10.
Do not inflate the score to clear the gate.

## Layout

```
app/           Next.js App Router — page, layout, /api/ai/edit
components/    React UI
lib/
  artwork-core/  document model — imports nothing but zod, no React
  renderer/      canvas drawing (pure)
  editor/        viewport, brush masks
  ai/            context, prompt, schemas, validator, provider adapter
  persist/       IndexedDB
  store/         zustand
spike/         Phase 0 AI probe harness
tools/         research + screenshot scripts (not shipped)
docs/          SPEC.md, WORKFLOW.md, specs/, research/, shots/
```

## Commands

```
npm run dev         # localhost:3000
npm test            # vitest
npm run typecheck
npm run spike       # AI probe matrix (uses real quota, paces at 5 rpm)
npx tsx tools/shoot.ts      # screenshot the running app
npx tsx tools/shoot-ai.ts   # end-to-end AI proposal flow
```

## Current state

See `docs/HANDOFF.md` for the full picture. In brief, as of 11 Aug 2026:

- **Shipped:** the document model, renderer, all 8 tools, dithering, the full chrome, 4 responsive
  tiers, the "Mosaic" visual identity, IndexedDB autosave, and the AI agent (21 actions, look-act-
  verify loop, one-undo sessions, bring-your-own-key). The agent unit scored **9/10**.
- **Next:** Phase 4 — layers (#46), animation timeline (#47), share via Supabase (#48). The Layers,
  Timeline and Share buttons in the top bar are the only dead controls left, and each is a real
  feature rather than a wiring job.
- **Deferred:** Phase 6, AI edit quality. Phase 0 failed its gate 0/9; a re-test after the agent
  loop and at 32x32 produces recognisable, correctly-placed edits that damage nothing, but the
  output is still not artist-grade. Recorded in `docs/PHASE-0-FINDINGS.md`. The remaining gap is
  model capability rather than engineering, and the standing decision is not to spend time there.
- **Model:** `gemini-3.1-flash-lite` on the free tier. 5 requests/minute is the binding limit, and
  one agent session is about five requests.

## Commands, beyond the basics

```
npx tsx tools/check-responsive.ts   # overflow + target size at 5 viewports; exits non-zero
npx tsx tools/probe-tools-ui.ts     # drives every tool with real pointer events
npx tsx tools/e2e-agent.ts          # agent flow end to end (wants AI_PROVIDER=mock)
npx tsx tools/render-probe.ts       # render the last AI probe result and LOOK at it
```
