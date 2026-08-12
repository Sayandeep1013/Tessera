# Tessera — Build Specification

**Status:** v1.1 — spec set complete, ready to build
**Type:** Portfolio project. Public demo, deployed to Vercel. No accounts, no billing, no moderation.

> *Tessera* — a single tile in a mosaic. The name is a placeholder; changing it is a find-and-replace
> on `Tessera` / `tessera` and nothing else depends on it.

This document is the **index and the global contract**. Detail lives in the sub-specs.

---

## 0. What this is

A code-native pixel-art editor with an AI editing agent. You paint on a canvas; underneath, every
pixel is an index into a palette, stored in a human-readable JSON document. An AI composer takes a
plain-language instruction, proposes **structured pixel operations**, shows you the diff, and applies
it only when you accept.

Inspired by the product concept of [Newt](https://newt.sh/). Newt is closed-source; nothing here
derives from its code. Its branding, logo, icons, copy, and artwork are off-limits.

### The money shot

```
draw (or load a starter sprite)  →  "make it angrier"  →
proposed pixels highlight green/amber  →  Accept  →  ⌘Z undoes it atomically
```

Everything else is supporting cast. If a tradeoff threatens this loop, the loop wins.

### Scope

**In:** pixel canvas · brush/eraser/fill/eyedropper/rect · palette · undo/redo · zoom/pan · local
autosave · starter sprites · AI edit with diff and accept/reject · bidirectional canvas↔code panel ·
PNG/SVG/CSS/React/JSON export · share links · animation timeline + GIF.

**Out, permanently:** accounts · profiles · following · likes · comments · explore/trending feeds ·
moderation tooling · monetization · remix lineage graphs · semantic region detection · game-engine
export · public API · embed script · real-time collaboration.

**Cut line:** Phase 5 (animation) is dropped first if Phases 0–2 run long. Decided in advance so the
call is made calmly. Nothing earlier is silently descoped; if a phase is at risk, that gets said.

---

## 1. What measuring Newt actually told us

Measured live on 11 Aug 2026 with `tools/inspect-newt.ts` (public-page DevTools-equivalent
inspection). Raw data in `docs/research/newt/`. This **corrected several errors** in the original
reverse-engineering PRD:

| The PRD assumed | Reality |
|---|---|
| Tools in a bottom cluster | **Left rail** — 8 buttons, 44×44, r12, 48px pitch, vertically centred on the canvas area |
| A canvas sized to the artwork | **One full-viewport canvas** (`1440×852` at `y=48`, DPR-2 backing store) with the artwork drawn under a transform |
| Code panel / animation / layers were our own additions | All three are **real Newt affordances** (`</>`, frames, and layers buttons in its top bar) |
| `47×` semantics "unresolved" | Confirmed **display zoom** — it sits between `−` and `+` |
| Stack unknown | Next.js App Router + Turbopack + Vercel + Geist; no AI call fires until submit |

Its palette is Tailwind `zinc`, **fully achromatic** — `--accent` is near-white, so the artwork
supplies all the colour on screen. We take that principle and diverge on execution: dark-first, one
chromatic accent, system font stack. Full detail and our tokens in
[02 — Design System](./specs/02-design-system.md).

The layers finding independently vindicates keeping `layers[]` in the format from v1.

---

## 2. Architecture

```
                         ┌──────────────┐
      user paints  ─────►│              │◄─────  AI proposes ops
                         │     Doc      │        (validated, applied to a clone first)
      code panel  ◄─────►│  (the truth) │
                         └──────┬───────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
       history              renderer              exporters
    (commands, in-      (full-viewport         (PNG SVG CSS
     memory only)        canvas + transform)     React JSON GIF)
                                │
                                ▼
                        IndexedDB  ·  Supabase (share snapshots)
```

One document. One renderer. One set of geometry primitives shared by the AI and the editor's tools.

---

## 3. Sub-specs

Read [01](./specs/01-document-format.md) before any other.

| # | Spec | Covers |
|---|---|---|
| 01 | [Document Format](./specs/01-document-format.md) | Encoding, invariants, error codes, versioning, edge cases |
| 02 | [Design System](./specs/02-design-system.md) | Measured Newt reference, tokens, type, geometry, components, a11y |
| 03 | [artwork-core](./specs/03-artwork-core.md) | Module API, `Result`, commands, diff, perf budgets |
| 04 | [Renderer](./specs/04-renderer.md) | Full-viewport canvas, coordinate spaces, pipeline, golden testing |
| 05 | [Editor and Input](./specs/05-editor.md) | Tools, stroke→command grouping, zoom ladder, touch, history |
| 06 | [AI Protocol](./specs/06-ai-protocol.md) | Context, system prompt, op vocabulary, 10 validation gates, probe matrix |
| 06a | [Provider Adapter](./specs/06a-provider.md) | Gemini default, OpenRouter/mock, loose-vs-strict schema |
| 07 | [Code Panel](./specs/07-code-panel.md) | Bidirectional sync, loop guard, inline errors, click-to-locate |
| 08 | [Exporters](./specs/08-exporters.md) | Per-format output, run merging, sprite sheet, GIF |
| 09 | [Persistence and Sharing](./specs/09-persistence.md) | IndexedDB, Supabase snapshots, viewer, remix, OG image |
| 10 | [Animation](./specs/10-animation.md) | Frames, timeline, playback — **the cut line** |
| 11 | [Testing](./specs/11-testing.md) | Layers, goldens, properties, fuzzing, E2E, invariants |
| 12 | [Agent Actions](./specs/12-agent-actions.md) | The registry, the look-act-verify loop, sessions, budgets |
| 13 | [Visual Identity](./specs/13-visual-identity.md) | "Mosaic" — the direction, tokens, and what was rejected |
| 14 | [Layers](./specs/14-layers.md) | Active layer, layer commands, the panel, the layer actions |
| 15 | [Feedback and Input](./specs/15-feedback-and-input.md) | Honest agent outcomes, panel geometry, tooltips, zoom steps |
| 16 | [Settings](./specs/16-settings.md) | The settings panel, theme, grids, symmetry, canvas resize |

Process: [WORKFLOW.md](./WORKFLOW.md) — scope → spec → review → plan → build → score, iterating until ≥ 9/10.

---

## 4. Phases

Each ends with working, demoable software. Do not start a phase before the previous one's acceptance
criteria are green.

| Phase | Contents | Acceptance |
|---|---|---|
| **0** | **AI spike** — standalone, no UI. Probe matrix against 3 starter sprites. | **≥ 6 of 9 instructions pass on `face`.** Below that: stop and report, do not quietly redesign ([06 §10](./specs/06-ai-protocol.md)) |
| **1** | Document model, canvas, tools, palette, undo, zoom/pan, IndexedDB, starters | Draw→undo→redo exact; round-trip property holds; refresh restores; goldens match; 60fps at 64×64 |
| **2** | AI route, validator, diff overlay, accept/reject, composer — **money shot** | "make it angrier" → diff → Accept → one `⌘Z` reverses; malformed response mutates nothing; no key in the bundle |
| **3** | Code panel, PNG/SVG/CSS/React/JSON export | Bidirectional sync with no loop; exported React is pixel-identical to canvas |
| **4** | **Layers** · share links, `/a/[id]` viewer, remix, OG image | Layers: paint on layer 2, undo, layer 1 is untouched · Share → open in a private window → renders → Remix opens an editable copy |
| **5** | Frames, timeline, playback, GIF, sprite sheet — **cut line** | 4-frame blink plays and exports with matching delays |

> **Correction, 12 Aug 2026 (rule 13).** This table never listed layers, even though `layers[]` has
> been in the format since v1 and §1 records Newt's own layers button as a finding. The omission was
> silent: layers were tracked as "Phase 4 #46" in `docs/HANDOFF.md` and built there, against a table
> that did not mention them. Added above rather than given a phase of their own, because they shipped
> alongside Phase 4 and inserting a phase would renumber the cut line. Spec:
> [14 — Layers](./specs/14-layers.md).

---

## 5. Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind · Zustand + Immer · CodeMirror 6 · Canvas 2D ·
`idb` · `@google/genai` · `@supabase/supabase-js` · `nanoid` · `pngjs` · Vitest · Playwright.

**Not used:** WebGL (unless profiled into necessity) · a monorepo · an ORM · a component library ·
a state-machine library · SSR of the canvas.

**Deploy: Vercel.** AI and share routes are Node runtime handlers. Netlify works via
`@netlify/plugin-nextjs`, but Vercel is assumed. Env vars in [`.env.example`](../.env.example).

**Model provider: Gemini `gemini-2.5-flash`** on the free tier (250 req/day, 10 rpm, 1M context), behind
an adapter so a quota change is a config change and not a rewrite. Free key at
`aistudio.google.com/apikey` — note that enabling billing on that project deletes the free tier.

---

## 6. Global rules

Binding on every change, in every phase.

1. **The document is the source of truth.** Never introduce a second one.
2. **Never make a rendered image the source of truth.**
3. Never mutate a `Doc` in place. Ops and commands return new documents.
4. Every document mutation goes through `commit(cmd)`. Nothing else writes.
5. Every user edit is **one** undoable command. Strokes group; individual pixels do not.
6. Every AI operation is validated and applied to a clone before it touches anything real.
7. Every exporter consumes `Doc` and nothing else. No exporter imports another exporter.
8. `lib/artwork-core` imports nothing but `zod`.
9. API keys are server-side only. A test asserts it.
10. **Never silently discard artwork.** Failed parses, failed saves, and rejected AI edits all surface
    with an escape hatch.
11. Colours come from tokens. No hard-coded hex outside `globals.css`.
12. Tests ship in the same change as the code they cover.
13. **When this spec turns out to be wrong, say so and propose the change** — do not route around it
    silently.
