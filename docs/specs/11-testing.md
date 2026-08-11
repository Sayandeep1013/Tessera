# 11 — Testing Strategy

**Owns:** `vitest.config.ts`, `playwright.config.ts`, `tests/**`, every `__tests__/` directory
**Depends on:** every other sub-spec (each declares its own test requirements)

---

## 1. Why this matters more than usual here

Most of this codebase is written by agents. Agent throughput is high; **verification is the
bottleneck.** These suites are the mechanism by which a large volume of generated code stays
trustworthy — they are load-bearing, not ceremony.

Two failure classes drive the design:

- **Silent visual defects.** An off-by-one in the viewport transform, a wrong palette lookup, a
  transparency bug. Invisible in unit tests, obvious to a human, and caught only by golden images.
- **Silent data loss.** A shallow clone that shares pixel buffers, an undo that corrupts history, an
  autosave that drops a document. Caught only by property tests and explicit failure-path tests.

---

## 2. Layers

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | Pure functions in `lib/` | Every commit |
| Property | Vitest + fast-check | Invariants over generated inputs | Every commit |
| Golden image | Vitest + `pngjs` shim | Renderer and exporter output | Every commit |
| Component | Vitest + Testing Library | Stateful UI pieces | Every commit |
| E2E | Playwright | Whole user flows | Every commit |
| Visual | Playwright screenshots | Design fidelity, both themes | Every commit |
| AI eval | `spike/run.ts` | Model edit quality | **Manual only** |

The AI eval is manual and deliberately outside CI: its outputs are non-deterministic and it consumes
free-tier quota. It runs when the prompt, the context builder, the op vocabulary, or the provider
changes — recorded in `spike/results.md`, never asserted.

---

## 3. Golden images

The renderer's real test surface.

**Mechanism.** A minimal 2D-context shim over a `pngjs` buffer implementing exactly the surface the
renderer uses ([04 §8](./04-renderer.md)). Deliberately minimal: if the renderer reaches for
something the shim lacks, that is a signal it is doing something it should not, and the test fails
loudly rather than silently diverging from the browser.

**Matrix.** Every fixture ([03 §8](./03-artwork-core.md)) × scales `1 / 8 / 32` × grid on/off ×
checker on/off × light/dark, plus one case per diff bucket and one with all three.

**Regenerating.** `pnpm test:golden --update`. **A changed golden must be reviewed as an image
before it is committed** — accepting goldens blind is the one way this suite can be defeated, and it
is the reviewer's responsibility, not the tool's. The PR template asks explicitly whether goldens
changed and why.

---

## 4. Property tests

Where invariants are cheaper to state than examples.

```ts
// codec — the round trip that everything else assumes
fc.assert(fc.property(arbDoc(), (d) => {
  const s = serializeDoc(d)
  const p = parseDoc(s)
  return p.ok && deepEqual(p.value, d)
}))

// commands — the invariant undo depends on
fc.assert(fc.property(arbDoc(), arbCommand(), (d, c) =>
  deepEqual(applyCommand(applyCommand(d, c), invertCommand(c)), d)))
```

Generators live in `tests/arbitraries.ts`: `arbDoc`, `arbPalette`, `arbCommand`, `arbOp`, `arbViewport`.
`arbDoc` biases toward small canvases and the boundary sizes (1×1, 256×256, exactly 36 colours) —
uniform random sizes would almost never hit the interesting cases.

Required properties:

| Property | Source |
|---|---|
| `parseDoc(serializeDoc(d))` ≡ `d` | [01 §8](./01-document-format.md) |
| `serializeDoc(parseDoc(s))` ≡ `s` for canonical `s` | [01 §8](./01-document-format.md) |
| apply-then-invert is identity, all 9 command types | [03 §5](./03-artwork-core.md) |
| double inversion is identity | [03 §5](./03-artwork-core.md) |
| `applyOps` never mutates its input | [03 §4](./03-artwork-core.md) |
| `screenToDoc`/`docToScreen` round trip | [05 §4](./05-editor.md) |
| N commits then N undos restores the original | [05 §7](./05-editor.md) |
| `parseDoc` never throws, on any input | [03 §2](./03-artwork-core.md) |

---

## 5. Fuzzing

`parseDoc` is the only untrusted-input boundary in the model layer (code panel, file import, share
read). It gets 1,000 random JSON values per run plus a corpus of hostile inputs: deeply nested
objects, huge arrays, `__proto__` keys, `NaN`/`Infinity`, lone surrogates, and every fixture with one
byte corrupted.

**Assertion: no exception escapes.** Every failure is a `Result` error.

---

## 6. E2E

Playwright, Chromium + WebKit. **The AI provider is always `mock`** ([06a §6](./06a-provider.md)) —
E2E never touches a network model, so CI is free, fast, and deterministic.

Flows:

1. **Core loop** — open → starter sprite present → draw → undo → redo → autosave label reads `Saved`
   → reload → artwork restored
2. **Money shot** — draw → `__ok` instruction → diff overlay appears → Accept → artwork changed →
   one `⌘Z` fully reverses it
3. **AI failure paths** — `__refuse`, `__ratelimit`, `__malformed`, `__budget`, `__empty` each show
   their specific message and leave the artwork untouched
4. **Code panel** — open → paint → character updates → edit character → canvas updates → type invalid
   → inline error, canvas unchanged → fix → applies
5. **Export** — each format downloads with the right filename and non-empty content
6. **Share** — share → open the link in a fresh context → artwork renders → Remix opens an editable copy
7. **Keyboard only** — reach and operate every control with `Tab`/arrows, no pointer
8. **Mobile** — 390×844: tool row is a bottom strip, draw works, two-finger pan does not draw

---

## 7. Visual regression

Playwright screenshots at 1440×900, 768×1024, 390×844 × light/dark = 6 baselines per surface
(editor, editor with code panel, proposal review, viewer).

Masked before comparison: the autosave timestamp, the zoom readout, and anything else genuinely
time- or environment-dependent. Threshold is `maxDiffPixelRatio: 0.002` — tight enough to catch a
spacing regression, loose enough to survive font-rendering noise across CI runners.

---

## 8. What must never regress

A short list of assertions that exist because breaking them is silent and expensive:

| Assertion | Guards |
|---|---|
| No `*_API_KEY` reference reachable from the client bundle | Key leak |
| No hard-coded hex in any `.tsx` | Theming ([02 §3](./02-design-system.md)) |
| `lib/artwork-core` imports nothing but `zod` | Layer boundary ([03 §1](./03-artwork-core.md)) |
| No exporter imports another exporter | [08 §1](./08-exporters.md) |
| Every `<button>` has text or an `aria-label` | Accessibility |
| `cloneDoc` produces non-shared pixel buffers | Undo corruption |
| Export JSON ≡ code panel text ≡ autosave payload | Single source of truth |
| `imageSmoothingEnabled` is never `true` on any drawing context | Crisp pixels |

Each is a real test in `tests/invariants/`, not a lint rule that can be disabled inline.

---

## 9. CI

GitHub Actions on push and PR:

```
typecheck → lint → unit + property + golden → build → e2e → visual
```

Fails on: any test failure, a type error, a lint error, or a bundle-size regression over 10%.

Coverage is **reported, not gated**. A coverage threshold encourages tests written to satisfy the
threshold; the specific assertions each sub-spec requires are the real bar, and they are checked by
review.

Total budget: under 5 minutes. Above that, parallelise before deleting tests.

---

## 10. Conventions

- Tests live beside their subject in `__tests__/`, except E2E, visual, and invariants, which live in
  `tests/`.
- One behaviour per test. A test asserting five things reports one failure and hides four.
- Test names state the expected behaviour: `rejects a row wider than the canvas`, not `test parseDoc 3`.
- **No mocking inside `lib/artwork-core`.** It is pure; mocking there would only test the mock.
- Fixtures are shared across suites and are effectively frozen ([03 §8](./03-artwork-core.md));
  changing one invalidates goldens in four places, so a fixture change is a deliberate act.
- **Tests ship in the same change as the code they cover.** Never a follow-up task.
