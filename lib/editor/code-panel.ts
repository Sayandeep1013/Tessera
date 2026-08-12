/**
 * Everything the code panel decides, and every sentence it says.
 * See docs/specs/07-code-panel.md, and §9 for what unit C corrected.
 *
 * The same split as `file-menu.ts`, `recent.ts`, `canvas-size.ts` and
 * `paste.ts`, for the same reason (HANDOFF §11): `npm test` runs in node and
 * every browser probe needs a dev server, so a rule that lives only inside a
 * `.tsx` has no CI guard. `components/CodePanel.tsx` is left with markup, two
 * timers and the call to `commit`.
 *
 * The panel is a view of `serializeDoc(doc)` and nothing else. Rule 3: there is
 * no second representation of the artwork, and §1's equality with what
 * `Download .tessera.json` writes is asserted rather than intended.
 */

import type { DocError } from '../artwork-core/schema'
import type { Range } from './json-locate'

// ─── geometry ────────────────────────────────────────────────────────────────

/** §1. Below 320 the pixel rows of a 32-wide document stop fitting at all. */
export const CODE_MIN_W = 320
export const CODE_MAX_W = 800
/** Wide enough for a 32-row grid plus its indent, which is the common document. */
export const CODE_DEFAULT_W = 460
export const CODE_WIDTH_KEY = 'tessera.code.width'

/**
 * Clamped, and never wider than half the window.
 *
 * §1 gives a 320–800 range and stops there, which is fine until the window is
 * 900px: 800 of it is the panel and the canvas gets 100. The panel is a split,
 * so it may not take the thing it is split from — half is the point at which
 * "code beside the art" stops being true.
 */
export function clampCodeWidth(raw: number, windowW = Infinity): number {
  const ceiling = Math.min(CODE_MAX_W, Math.max(CODE_MIN_W, Math.floor(windowW / 2)))
  if (!Number.isFinite(raw)) return Math.min(CODE_DEFAULT_W, ceiling)
  return Math.max(CODE_MIN_W, Math.min(ceiling, Math.round(raw)))
}

/**
 * What was stored last time, clamped to what fits now. §1 persists the width.
 *
 * The blank check is not defensive padding. `Number('')` is **0**, not NaN, so
 * an empty localStorage entry — which is what a cleared or half-written key
 * looks like — would read as a width of zero, clamp to the minimum, and the
 * panel would open narrow forever with nothing to explain it.
 */
export function readCodeWidth(stored: string | null, windowW = Infinity): number {
  const n = stored === null || stored.trim() === '' ? NaN : Number(stored)
  return clampCodeWidth(Number.isFinite(n) ? n : CODE_DEFAULT_W, windowW)
}

// ─── DOM handles ─────────────────────────────────────────────────────────────

/**
 * The ids the panel renders, declared here rather than written into the JSX —
 * the same arrangement `file-menu.ts` uses and for the same reason.
 *
 * `lib/__tests__/probe-handles.test.ts` scans `tools/` for `#id` selectors and
 * checks each one against what the app renders. It can only read literal `id=`
 * attributes out of a component, so an id built from a constant is invisible to
 * it — and it caught exactly that when this panel first shipped. Contributing
 * them through `codePanelDomHandles` means the component and the check are
 * generated from one source and cannot drift.
 */
export const CODE_DOM_ID = 'code-panel'
export const CODE_TEXT_DOM_ID = 'code-text'
export const CODE_STATUS_DOM_ID = 'code-status'

export const codePanelDomHandles = (): string[] => [
  CODE_DOM_ID,
  CODE_TEXT_DOM_ID,
  CODE_STATUS_DOM_ID,
]

// ─── sync ────────────────────────────────────────────────────────────────────

/**
 * §2's two debounces. Deliberately different, and the asymmetry is the point.
 *
 * Document → text is fast because it must feel live while a stroke lands, and
 * coalescing a 400-pixel drag into a few serializations is all it is for.
 *
 * Text → document is slow because a half-typed row is not an error, it is a
 * person in the middle of typing. At 100ms, deleting a character to retype it
 * would flash a red status line every time.
 */
export const DOC_TO_TEXT_MS = 100
export const TEXT_TO_DOC_MS = 300

/**
 * The one loop guard, as a value rather than a comparison — §2.
 *
 * Comparing text is not sufficient and the reason is subtle enough to be worth
 * restating: `serializeDoc` is canonical, so a user who types a space the
 * serializer would remove has produced text that *differs* from the document's
 * canonical form while *representing the same document*. A comparison-based
 * guard would decide the panel was stale and rewrite the buffer under the
 * caret, on that keystroke and every one after it.
 */
export type SyncOrigin = 'canvas' | 'panel' | 'init'

// ─── undo coalescing ─────────────────────────────────────────────────────────

/** §5. One undo step per burst of typing, not one per keystroke. */
export const COALESCE_MS = 2000
export const EDIT_LABEL = 'Edit code'

/**
 * Whether this edit should join the previous one instead of starting a step.
 *
 * The window lives here rather than in the store on purpose (§9.4): the store
 * is told what to do and does it, so the policy stays testable in node instead
 * of being observable only by typing into a browser and pressing undo.
 *
 * `null` means there is no previous panel edit to join — the first edit after
 * opening the panel, or after anything else touched the document.
 */
export function shouldCoalesce(lastEditAt: number | null, now: number): boolean {
  return lastEditAt !== null && now - lastEditAt < COALESCE_MS
}

// ─── what it says ────────────────────────────────────────────────────────────

export const STATUS_VALID = 'Valid'
export const GO_TO_ERROR = 'Go to error'

/**
 * What ⌘Z says when the buffer does not parse. See §9.8.
 *
 * The panel used to send that key straight to the document and then rewrite the
 * buffer from it, so text somebody had typed disappeared with no message — the
 * only place in the app where that could happen, and a rule-7 problem with no
 * error to give it away. Now the first press undoes the typing, which is what
 * ⌘Z plainly means when the most recent thing that happened was typing, and
 * this says which of the two undos you just got.
 */
export const CODE_REVERTED = "That edit couldn't be applied, so undo put the document's text back. Undo again to undo the document."
export const PANEL_TITLE = 'Code'
/** §7's sheet dismisses with a button rather than an outside click. */
export const SHEET_DONE = 'Done'

/**
 * How wide a mark is allowed to get before it stops being a mark.
 *
 * Some paths resolve to a container — a `row_count` failure points at the whole
 * `px` array — and washing 60KB of text in red says "everything is wrong",
 * which is both useless and untrue. Past this the message stands on its own,
 * which is exactly §3's degradation rule applied to a range that resolved but
 * resolved too widely.
 */
export const MAX_MARK = 400

/** The error, said in one line. `path` is for the mark; this is for the human. */
export function errorLine(e: DocError): string {
  return e.message.charAt(0).toUpperCase() + e.message.slice(1)
}

/**
 * Where the caret is, in the artwork's terms.
 *
 * `row 12 · char 7 → pixel (7, 12)`. This is the sentence that makes "code
 * underneath" literal rather than claimed, and it is the cheapest thing in the
 * panel — the row ranges are already computed for the overlay.
 *
 * Null when the caret is not inside a pixel row, which is most of the file.
 */
export function caretCell(rows: Range[], caret: number): { x: number; y: number } | null {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y]!
    // Inclusive of `to`: a caret resting after the last character of a row is
    // still in that row as far as anyone typing is concerned.
    if (caret >= r.from && caret <= r.to) {
      const x = Math.min(caret - r.from, r.to - r.from - 1)
      return x < 0 ? null : { x, y }
    }
  }
  return null
}

export function caretLine(cell: { x: number; y: number } | null): string | null {
  return cell === null ? null : `row ${cell.y} · char ${cell.x} → pixel (${cell.x}, ${cell.y})`
}

/** The character range one document cell occupies, for canvas → panel (§4). */
export function cellRange(rows: Range[], x: number, y: number): Range | null {
  const row = rows[y]
  if (!row) return null
  const from = row.from + x
  return from >= row.to ? null : { from, to: from + 1 }
}

/**
 * The line the caret sits on, 1-based, for the gutter and for `Go to error`.
 *
 * Counting newlines rather than splitting: a 256×256 document is 70KB and this
 * runs on every keystroke, so allocating an array of 1030 strings to learn one
 * number is the kind of thing that only shows up on the biggest document
 * somebody owns.
 */
export function lineAt(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++
  return line
}
