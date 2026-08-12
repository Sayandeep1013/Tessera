/**
 * Find where a `DocError.path` points, in the text the user is looking at.
 * See docs/specs/07-code-panel.md §3 and §9.1.
 *
 * `parseDoc` reports failures with a path — `frames.0.layers.0.px[3][7]`,
 * `palette.0.c`, `w` — and until this module existed **nothing used it**. The
 * difference it makes is the difference between "that document is invalid" and
 * a mark under the one character that is wrong.
 *
 * **Why this is not CodeMirror's syntax tree.** §3 says to resolve paths with a
 * position-tracking parser, "CodeMirror's syntax tree, not a regex", and treats
 * those as the only two options. The third is this: a scanner that walks JSON
 * and remembers where it is. It is pure, it has no DOM, it costs no dependency,
 * and — the part that decided it — `npm test` can reach it, where anything
 * built on an editor widget would be probe-only. This repo has written its own
 * codec, tooltip, dither and quantiser on exactly this reasoning.
 *
 * It is a *locator*, not a validator. `parseDoc` decides whether the document
 * is good; this only answers "where is that bit". Malformed input therefore
 * returns null rather than throwing — the caller is already showing an error
 * and a second failure must not become an exception on top of it.
 */

export type Range = { from: number; to: number }

/** One step of a path: an object key or an array/character index. */
type Step = { key: string } | { index: number }

/**
 * `frames.0.layers.0.px[3][7]` → six steps.
 *
 * Two grammars meet in `DocError.path` and both have to be read. Zod joins its
 * issue paths with dots, so array indices arrive as `frames.0.layers.0.px`;
 * `codec.ts` appends its own row and column as brackets, `px[3][7]`. Rather
 * than normalise one into the other at the source — which would mean touching
 * artwork-core to suit a panel — both are accepted here.
 */
export function parsePath(path: string): Step[] {
  const steps: Step[] = []
  for (const part of path.split('.')) {
    if (!part) continue
    // The head is everything before the first bracket; the tail is every
    // [n] group after it.
    const head = part.slice(0, part.indexOf('[') === -1 ? part.length : part.indexOf('['))
    if (head) steps.push(/^\d+$/.test(head) ? { index: Number(head) } : { key: head })
    for (const m of part.matchAll(/\[(\d+)\]/g)) steps.push({ index: Number(m[1]) })
  }
  return steps
}

// ─── the scanner ─────────────────────────────────────────────────────────────

const WS = new Set([' ', '\t', '\n', '\r'])

function skipWs(t: string, i: number): number {
  while (i < t.length && WS.has(t[i]!)) i++
  return i
}

/** `i` at the opening quote; returns the index just past the closing one, or -1. */
function skipString(t: string, i: number): number {
  if (t[i] !== '"') return -1
  i++
  while (i < t.length) {
    const c = t[i]!
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '"') return i + 1
    i++
  }
  return -1
}

/**
 * Skip any JSON value starting at `i`, returning the index just past it.
 *
 * -1 for anything it cannot make sense of. Iterative over containers via an
 * explicit depth count rather than recursion: the input is a text buffer a user
 * is typing into, and a deeply nested paste should not be able to reach the
 * call stack's limit inside a status line.
 */
function skipValue(t: string, i: number): number {
  i = skipWs(t, i)
  if (i >= t.length) return -1

  const c = t[i]!
  if (c === '"') return skipString(t, i)
  if (c === '{' || c === '[') {
    let depth = 0
    while (i < t.length) {
      const ch = t[i]!
      if (ch === '"') {
        const end = skipString(t, i)
        if (end < 0) return -1
        i = end
        continue
      }
      if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') {
        depth--
        if (depth === 0) return i + 1
      }
      i++
    }
    return -1
  }
  // A literal: number, true, false, null. Run to the first delimiter.
  const start = i
  while (i < t.length && !',}] \t\n\r'.includes(t[i]!)) i++
  return i > start ? i : -1
}

/** The span of the value at `i`, or null. Strings report their CONTENT span. */
function valueSpan(t: string, i: number): Range | null {
  const from = skipWs(t, i)
  const to = skipValue(t, from)
  if (to < 0) return null
  // Inside the quotes: a mark that includes them reads as an error in the
  // syntax rather than in the pixels, and the pixels are what is wrong.
  if (t[from] === '"') return { from: from + 1, to: to - 1 }
  return { from, to }
}

/** Walk one step into the value at `i`. Returns the index of the child value. */
function enter(t: string, i: number, step: Step): number {
  i = skipWs(t, i)
  const open = t[i]

  if (open === '{') {
    if (!('key' in step)) return -1
    i++
    for (;;) {
      i = skipWs(t, i)
      if (t[i] === '}') return -1
      const keyEnd = skipString(t, i)
      if (keyEnd < 0) return -1
      const key = t.slice(i + 1, keyEnd - 1)
      i = skipWs(t, keyEnd)
      if (t[i] !== ':') return -1
      i = skipWs(t, i + 1)
      if (key === step.key) return i
      const after = skipValue(t, i)
      if (after < 0) return -1
      i = skipWs(t, after)
      if (t[i] === ',') i++
      else return -1
    }
  }

  if (open === '[') {
    if (!('index' in step)) return -1
    i++
    for (let n = 0; ; n++) {
      i = skipWs(t, i)
      if (t[i] === ']') return -1
      if (n === step.index) return i
      const after = skipValue(t, i)
      if (after < 0) return -1
      i = skipWs(t, after)
      if (t[i] === ',') i++
      else return -1
    }
  }

  return -1
}

/**
 * Resolve `path` to a character range in `text`, or null.
 *
 * The last step may address a **character inside a string** — that is what
 * `px[3][7]` means, and it is the whole reason this is worth writing: row 3,
 * column 7 is one pixel, and marking one character is the difference between
 * pointing at a mistake and pointing at a row.
 *
 * A string containing a backslash escape degrades to the whole string, because
 * character offsets in the decoded value and in the source text stop agreeing
 * there. Pixel rows are `.`, `1`–`9` and `a`–`z`, so this cannot arise from a
 * valid grid — only from something already broken, which is already reported.
 */
export function locate(text: string, path: string): Range | null {
  const steps = parsePath(path)
  if (!steps.length) return null

  let i = skipWs(text, 0)
  for (let s = 0; s < steps.length; s++) {
    const step = steps[s]!
    // A remaining index against a string is a character offset, not an element.
    if (text[skipWs(text, i)] === '"' && 'index' in step) {
      const span = valueSpan(text, i)
      if (!span) return null
      if (text.slice(span.from, span.to).includes('\\')) return span
      const at = span.from + step.index
      if (at < span.from || at >= span.to) return span
      return { from: at, to: at + 1 }
    }
    const next = enter(text, i, step)
    if (next < 0) return null
    i = next
  }
  return valueSpan(text, i)
}

/**
 * The content range of every string in one layer's `px` array.
 *
 * Computed once and reused for both directions of click-to-locate (§4): a caret
 * offset is turned into a pixel by finding which of these it falls in, and a
 * pixel is turned into a range by indexing straight into it. Doing it as one
 * scan rather than one `locate` per row matters — a 256-row document would
 * otherwise re-walk the whole buffer 256 times on every keystroke.
 *
 * Returns an empty array for text that does not have that path, which is the
 * normal state while somebody is halfway through typing.
 */
export function pxRowRanges(text: string, frame: number, layer: number): Range[] {
  const steps = parsePath(`frames.${frame}.layers.${layer}.px`)
  let i = skipWs(text, 0)
  for (const step of steps) {
    const next = enter(text, i, step)
    if (next < 0) return []
    i = next
  }

  i = skipWs(text, i)
  if (text[i] !== '[') return []
  i++

  const rows: Range[] = []
  for (;;) {
    i = skipWs(text, i)
    if (text[i] === ']' || i >= text.length) return rows
    if (text[i] !== '"') return rows
    const end = skipString(text, i)
    if (end < 0) return rows
    rows.push({ from: i + 1, to: end - 1 })
    i = skipWs(text, end)
    if (text[i] === ',') i++
    else return rows
  }
}
