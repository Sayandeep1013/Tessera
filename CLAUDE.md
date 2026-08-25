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

See `docs/HANDOFF.md` for the full picture, and `docs/UNITS.md` for the actual ledger — this
section is a summary of it and goes stale between updates, so if the two disagree, **the ledger
wins.** As of 25 Aug 2026:

- **Shipped:** the document model, renderer, all 8 tools, dithering, the full chrome, 4 responsive
  tiers, the "Mosaic" visual identity, IndexedDB autosave, layers, the whole File menu including
  paste image, the code panel, exporters, animation, and — unit I — a real Anthropic-compatible
  provider (Claude via AgentRouter or direct, alongside the original Gemini free tier), rebuilt BYOK,
  and a re-run AI-quality gate. Every unit **9/10**.
- **AI edit quality is NO LONGER the deferred item it was through unit H.** Re-tested against
  `claude-opus-5`: 14 of 15 scenarios scored ≥ 9, ten a clean 10 (`PHASE-0-FINDINGS.md §2`). The old
  "model capability, not engineering" verdict was wrong — it was reached against a free-tier model
  that was the only one this project could reach at the time. **Do not cite that old verdict; it is
  superseded and the file says so.**
- **A live, structural finding from the same day, `UNITS.md §I.1`:** AgentRouter, called
  server-side (which hard rule 6 requires), is blocked by an Aliyun WAF on requests from Vercel's
  IP range — a 200 HTML challenge page, not a real API response, independent of key or headers.
  Not fixable from this codebase. The app now reports this honestly (`bad_waf`) instead of a
  misleading generic error, but AgentRouter itself may simply not work from this deployment.
  Direct `api.anthropic.com` is expected to be unaffected but was not yet verified with a real key
  — see `UNITS.md §I.1`'s open item.
- **Next:** `docs/UNITS.md` marks unit **J, the selector tool** (object select, multi-select, drag)
  as `NEXT`, scoped and ready — read that block before starting, it has the research and the
  decisions already made. Share stays parked (`docs/DEFERRED.md`).
- **Model:** two paths now. The deployment's own free tier is still `gemini-3.1-flash-lite` (5
  requests/minute, ~5 requests per session — unchanged). A visitor's own key can also be Claude
  (`claude-opus-5`) via Anthropic direct or AgentRouter, subject to the WAF caveat above.

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
