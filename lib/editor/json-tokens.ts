/**
 * Colouring for the code panel. See docs/specs/07-code-panel.md §9.1.
 *
 * **This exists because §9.1 was wrong about its own cost.** That section said
 * syntax colouring would price "a span per token on a 70KB string" and treated
 * that as prohibitive. The number was never checked, and it is off by two
 * orders of magnitude: **a pixel row is a single string token**, so a 256×256
 * document — the largest this editor makes — tokenizes to about 400 spans, not
 * 70,000. A 32×32 document is under a hundred. Rule 10 applies to a spec I
 * wrote an hour ago exactly as it does to one written in Phase 3.
 *
 * What it colours is chosen for *this* document rather than for JSON in
 * general. The file is a short header, a palette, and then a wall of pixel
 * rows; colouring braces and quotes tells the reader nothing they did not
 * already know. So the scaffolding recedes and two things stand out:
 *
 *   - **the pixel rows**, which are the artwork, and
 *   - **the palette's colours, drawn in their own colour.**
 *
 * Pure, testable in node, no DOM: the component turns these into spans and
 * nothing more.
 */

import { skipString } from './json-locate'

export type TokenKind = 'key' | 'string' | 'number' | 'literal' | 'pixels' | 'colour'

export type Token = {
  from: number
  to: number
  kind: TokenKind
  /** For `colour`: the artwork colour this token is, e.g. `#ef7d57`. */
  colour?: string
}

/** `#rrggbb` / `#rrggbbaa`. `transparent` is a colour with nothing to show. */
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/

/**
 * Tokens worth colouring, in order. Punctuation and whitespace are deliberately
 * NOT emitted: they take the overlay's base colour, which is what makes the
 * span count small enough to rebuild on a keystroke.
 *
 * Never throws. The text is a buffer somebody is halfway through editing, so
 * "this is not valid JSON" is the normal state, not an error — it stops at the
 * first thing it cannot read and returns what it had.
 */
export function tokenizeJson(text: string): Token[] {
  const out: Token[] = []
  /** Container stack. `key` is the key this container was the value of. */
  const stack: Array<{ arr: boolean; key: string | null }> = []
  /** Inside an object, before the colon: the next string is a key. */
  let expectKey = false
  /** The most recent key in the innermost object, i.e. what a value belongs to. */
  let pendingKey: string | null = null
  let i = 0

  const top = () => stack[stack.length - 1]

  while (i < text.length) {
    const c = text[i]!

    if (c === '{') {
      stack.push({ arr: false, key: pendingKey })
      expectKey = true
      pendingKey = null
      i++
      continue
    }
    if (c === '[') {
      stack.push({ arr: true, key: pendingKey })
      expectKey = false
      pendingKey = null
      i++
      continue
    }
    if (c === '}' || c === ']') {
      stack.pop()
      // Back inside the parent: another value may follow, not a key, until a
      // comma says otherwise.
      expectKey = false
      i++
      continue
    }
    if (c === ':') {
      expectKey = false
      i++
      continue
    }
    if (c === ',') {
      // A comma in an object introduces a key; in an array it does not.
      expectKey = !!top() && !top()!.arr
      i++
      continue
    }

    if (c === '"') {
      const end = skipString(text, i)
      if (end < 0) break
      const content = text.slice(i + 1, end - 1)

      if (expectKey && top() && !top()!.arr) {
        out.push({ from: i, to: end, kind: 'key' })
        pendingKey = content
      } else {
        // Both of these test the CONTAINER as well as the key, not just the
        // key. A pixel row is an element of the `px` array; the string value of
        // a `px` key is not one, it is a malformed document mid-edit, and
        // painting it like artwork would be a small lie about what it is. Same
        // for a colour: `"c"` in an object, not an array element that happens
        // to sit under one.
        const frame = top()
        const inPixels = !!frame?.arr && frame.key === 'px'
        const isColour = !!frame && !frame.arr && pendingKey === 'c' && HEX.test(content)

        if (inPixels) out.push({ from: i, to: end, kind: 'pixels' })
        else if (isColour) {
          out.push({ from: i, to: end, kind: 'colour', colour: content.toLowerCase() })
        } else out.push({ from: i, to: end, kind: 'string' })
      }
      i = end
      continue
    }

    if (c === '-' || (c >= '0' && c <= '9')) {
      const from = i
      while (i < text.length && /[-+0-9.eE]/.test(text[i]!)) i++
      out.push({ from, to: i, kind: 'number' })
      continue
    }

    const literal = /^(true|false|null)/.exec(text.slice(i, i + 5))
    if (literal) {
      out.push({ from: i, to: i + literal[0].length, kind: 'literal' })
      i += literal[0].length
      continue
    }

    i++
  }

  return out
}

// ─── merging the colouring with the marks ────────────────────────────────────

export type MarkKind = 'error' | 'cursor'
export type Marked = { from: number; to: number; kind: MarkKind }

/**
 * One run of text to draw: what colour it is, and whether it is marked.
 *
 * `kind` absent means "no span at all" — the overlay's base colour. That is the
 * common case by character count and the reason this is cheap.
 */
export type Piece = {
  from: number
  to: number
  kind?: TokenKind
  colour?: string
  mark?: MarkKind
}

/**
 * Cover `[0, length)` with pieces, splitting wherever a token or a mark starts
 * or ends.
 *
 * Marks and tokens overlap freely — an error range is one character inside a
 * pixel row — so neither can simply nest inside the other. Cutting at every
 * boundary and asking both questions per run is the only version of this that
 * does not have an ordering bug in it.
 *
 * Adjacent untagged runs are merged, so the gaps between tokens cost one text
 * node rather than one per whitespace run.
 */
export function pieces(length: number, tokens: Token[], marks: Marked[]): Piece[] {
  if (length <= 0) return []

  const cuts = new Set<number>([0, length])
  for (const t of tokens) {
    if (t.from > 0 && t.from < length) cuts.add(t.from)
    if (t.to > 0 && t.to < length) cuts.add(t.to)
  }
  for (const m of marks) {
    if (m.from > 0 && m.from < length) cuts.add(m.from)
    if (m.to > 0 && m.to < length) cuts.add(m.to)
  }

  const bounds = [...cuts].sort((a, b) => a - b)
  const out: Piece[] = []

  for (let b = 0; b < bounds.length - 1; b++) {
    const from = bounds[b]!
    const to = bounds[b + 1]!
    // A run cannot straddle a boundary, so testing its start is enough.
    const token = tokens.find((t) => t.from <= from && from < t.to)
    const mark = marks.find((m) => m.from <= from && from < m.to)

    const piece: Piece = { from, to }
    if (token) {
      piece.kind = token.kind
      if (token.colour) piece.colour = token.colour
    }
    if (mark) piece.mark = mark.kind

    const prev = out[out.length - 1]
    // Merge only plain-with-plain. Two adjacent runs of the same token kind are
    // two different tokens and stay apart, which keeps the output a faithful
    // description of the text rather than a compression of it.
    if (prev && !prev.kind && !prev.mark && !piece.kind && !piece.mark) prev.to = to
    else out.push(piece)
  }

  return out
}
