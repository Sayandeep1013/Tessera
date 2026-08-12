# Implementation plan — the remaining build

Agreed 12 Aug 2026. Five areas, in dependency order. Every unit follows
`WORKFLOW.md`: spec → build → score across six dimensions taking the lowest,
iterate until ≥ 9.

**Not in scope, settled:** accounts, profiles, Explore, publish-to-community.
`SPEC.md §0` puts them out permanently and the user confirmed it. Share itself
is parked — see `DEFERRED.md`.

---

## Order, and why this order

```
A. Canvas resize ─────┐
                      ├──► both need the resize command's shape settled first
B. File menu ─────────┘
                            C. Code panel ──► D. Exporters (share its plumbing)
                            E. Layers phase 2
                            F. Animation ────► needs the frame/layer decision
```

**A before B** because the File menu's New… creates a document at a chosen size,
and both want the same size-preset control. Building the menu first means
building that control twice.

**C before D** because the code panel is the surface every exporter renders
into, and an exporter with nowhere to appear is untestable by looking.

**F last** because it has to settle the question layers deliberately left open —
whether a layer belongs to one frame or all of them (`14-layers.md §9`). That
decision is easier to make once E has established what a layer actually carries.

---

## A. Canvas resize · spec `16-settings.md §4`

The only settings item still outstanding, and the one that mutates the document.

1. `resize` command + inverse in `artwork-core/commands.ts`. **Tests first** —
   the inverse carries whole previous buffers, and a crop that cannot be undone
   is silent artwork loss.
2. `resizeDoc(doc, w, h)` in artwork-core: centred, pads on grow, crops on
   shrink, every layer of every frame in one pass.
3. The Canvas tab UI: 3×3 preset grid, paired W×H inputs, apply button showing
   the pending size and disabled when it equals the current one.
4. The `S-E2` count — how many painted pixels a shrink will drop, stated before
   it happens.

**Done when:** a 1px dot at the centre of 16×16 is still centred at 32×32; undo
after a destructive crop restores every pixel, verified through a
serialise/reparse round trip.

---

## B. File menu · spec `17-file-menu.md`

1. Structure, Examples submenu, Duplicate, Clear (undoable, red, confirms).
2. **Open recent** — `listDrafts()` exists and nothing calls it, so every
   autosaved document is currently unreachable. That is a rule-7 problem hiding
   in plain sight.
3. Shortcuts, reusing the existing `isTyping` guard rather than writing a second.
4. **Paste image, as its own unit** — clipboard read, fit, and quantise to ≤ 36
   colours. Three failure modes, each of which has to be visible.

---

## C. Code panel · spec `07-code-panel.md`

The `</>` button. Phase 3, and the most on-brand thing left: "pixel art that is
really just a document" is a claim the code panel is the proof of.

1. CodeMirror 6, read-only first — the document rendered as its own text.
2. Bidirectional sync with a **loop guard**. Text → document → text must not
   re-enter, and this is where the bugs live.
3. Inline parse errors on the offending line, never a wiped canvas.
4. Click-to-locate: a click in the text highlights the pixel.

**Watch for:** the panel and the canvas are two views of one document, and rule 3
says the document is the only truth. The text is never the source; it is a
rendering that happens to be editable.

---

## D. Exporters · spec `08-exporters.md`

SVG · JSON · CSS · React · **ASCII** · PNG. Each consumes `Doc` and nothing else,
and no exporter imports another (rule 7 of `SPEC.md §6`).

- `spriteRects` already merges runs and is already shared by the favicon and the
  share viewer — SVG and CSS build on it rather than re-walking pixels.
- ASCII is nearly free: the document's `px` rows **are** the ASCII, which is the
  whole point of the format. It is a one-line exporter and the best demo of the
  premise.
- Golden tests per format. Exported React must render pixel-identical to the
  canvas; that is the acceptance criterion already written into Phase 3.

---

## E. Layers, phase 2 · extends `14-layers.md §6.4`

The four things phase 1 declared out of scope, in order of value:

1. **Opacity** — a `o?: number` field on `Layer`, a format change, so
   `01-document-format.md` moves with it and old documents must still parse.
2. **Merge down / flatten** — commands, straightforward, and the inverse has to
   carry both source layers.
3. **Blend modes** — needs the renderer to composite per layer rather than
   painting straight through. The largest of the three.
4. **Reordering by drag** — the panel currently moves layers by button only.

---

## F. Animation · spec `10-animation.md`

Frames, the timeline strip, playback, onion skinning if cheap, GIF export.

**It must first settle the question `14-layers.md §9` left open:** layers are
per-frame in the format, so "add a layer" is ambiguous once a second frame
exists — this frame, or all of them? Decide it in the sub-spec, in writing,
before any timeline UI exists. Every other question here is downstream of it.

---

## What "done" means, every time

`npm test` green · `npm run typecheck` clean · `npm run build` clean ·
`check-responsive` clean at 6 viewports · the relevant probes green · looked at
in both themes · scored honestly with the lowest of six as the overall.
