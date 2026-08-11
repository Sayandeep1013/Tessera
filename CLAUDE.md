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

- Phase 0 (AI spike) **failed its gate — 0/9**. Recorded in `docs/PHASE-0-FINDINGS.md` with
  ranked hypotheses. Quality work is deferred, not forgotten.
- Phase 1 (editor) and Phase 2 (AI composer, proposal, diff, accept/reject) are shipped.
- **In progress:** matching newt.sh 1:1 visually before adding our own flavour.
- Model: `gemini-3.1-flash-lite` via free tier. 5 req/min is the binding limit.
