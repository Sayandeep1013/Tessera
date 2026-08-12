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

Opening this repo cold, the whole instruction is: **read `docs/HANDOFF.md`, then
`docs/UNITS.md`, and build the unit marked `NEXT`.** The two files below say the rest.

**`docs/UNITS.md`** — the ledger. What is done, what is next, a ready-to-use prompt for every
remaining unit, and the protocol for finishing one so the next session can start cold. Read this
first; it will tell you which unit is yours.

**`docs/HANDOFF.md`** — what you need to know while doing it: the traps that have already cost time
in this repo, the settled decisions, the repo map, the debt.

**`docs/DEFERRED.md`** — what looks finished and is not. Read before assuming a button works.

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
npm run probes      # EVERY browser probe, one server, one command — see below
npm run spike       # AI probe matrix (uses real quota, paces at 5 rpm)
npx tsx tools/shoot.ts      # screenshot the running app
npx tsx tools/shoot-ai.ts   # end-to-end AI proposal flow
```

`npm run probes` needs a dev server, and the agent runs **server-side**, so the
mock goes on the server or two probes spend real quota and fail confusingly:

```
AI_PROVIDER=mock npx next dev --turbopack -p 3100
MOCK_SERVER=1 APP_URL=http://localhost:3100 npm run probes
```

## Current state

See `docs/HANDOFF.md` for the full picture. In brief, as of 12 Aug 2026:

- **Shipped:** the document model, renderer, all 8 tools, dithering, the full chrome, 4 responsive
  tiers, the "Mosaic" visual identity, IndexedDB autosave, the AI agent (25 actions, look-act-verify
  loop, one-undo sessions, bring-your-own-key), and layers (#46). Both units scored **9/10**.
- **Next:** whatever `docs/UNITS.md` marks `NEXT` — it is the ledger and this line is not. As of
  B1 that is **B2, Open recent**, with paste-image, the code panel, exporters, layers phase 2 and
  animation behind it. Share is parked (`docs/DEFERRED.md`). Read `docs/specs/14-layers.md §9`
  before the animation unit: layers are per-frame, and whether a layer belongs to one frame or all
  of them is the decision that unit left open.
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
npx tsx tools/probe-layers.ts       # 42 assertions on the layer panel, both themes
npx tsx tools/probe-file-menu.ts    # 84 checks on the File menu, both themes and two phones
npx tsx tools/e2e-agent.ts          # agent flow end to end (wants AI_PROVIDER=mock)
npx tsx tools/render-probe.ts       # render the last AI probe result and LOOK at it
```

The browser probes default to `localhost:3000` and honour `APP_URL` — check the port is actually
this project's before believing a failure.
