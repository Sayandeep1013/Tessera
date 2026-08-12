/**
 * Codec — the bridge between the serialized string-row form and the runtime
 * Uint8Array form. See docs/SPEC.md §2.
 *
 * Character mapping:
 *   index 0      -> '.'        (transparent)
 *   index 1..9   -> '1'..'9'
 *   index 10..35 -> 'a'..'z'
 *
 * Note '0' is deliberately NOT a valid character — only '.' means transparent,
 * so a row reads unambiguously at a glance.
 */

import {
  FORMAT_VERSION,
  MAX_PALETTE,
  TRANSPARENT_CHAR,
  TRANSPARENT_INDEX,
  err,
  ok,
  serializedDocSchema,
  type Doc,
  type DocError,
  type Result,
  type SerializedDoc,
} from './schema'

const CODE_1 = '1'.charCodeAt(0) // 49
const CODE_9 = '9'.charCodeAt(0) // 57
const CODE_A = 'a'.charCodeAt(0) // 97
const CODE_Z = 'z'.charCodeAt(0) // 122

export function indexToChar(i: number): string {
  if (i === TRANSPARENT_INDEX) return TRANSPARENT_CHAR
  if (i >= 1 && i <= 9) return String.fromCharCode(CODE_1 + (i - 1))
  if (i >= 10 && i < MAX_PALETTE) return String.fromCharCode(CODE_A + (i - 10))
  throw new RangeError(`palette index ${i} is outside 0..${MAX_PALETTE - 1}`)
}

/** Returns -1 for an unrecognised character rather than throwing. */
export function charToIndex(ch: string): number {
  if (ch === TRANSPARENT_CHAR) return TRANSPARENT_INDEX
  const c = ch.charCodeAt(0)
  if (c >= CODE_1 && c <= CODE_9) return c - CODE_1 + 1
  if (c >= CODE_A && c <= CODE_Z) return c - CODE_A + 10
  return -1
}

export function decodeRows(rows: string[], w: number, h: number): Result<Uint8Array, DocError> {
  if (rows.length !== h) {
    return err({
      code: 'row_count',
      message: `expected ${h} rows, got ${rows.length}`,
    })
  }
  const px = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = rows[y]!
    if (row.length !== w) {
      return err({
        code: 'row_width',
        message: `row ${y} has ${row.length} characters, expected ${w}`,
        path: `px[${y}]`,
      })
    }
    for (let x = 0; x < w; x++) {
      const i = charToIndex(row[x]!)
      if (i < 0) {
        return err({
          code: 'bad_char',
          message: `unrecognised character ${JSON.stringify(row[x])} at row ${y}, column ${x}`,
          path: `px[${y}][${x}]`,
        })
      }
      px[y * w + x] = i
    }
  }
  return ok(px)
}

export function encodeRows(px: Uint8Array, w: number, h: number): string[] {
  const rows: string[] = new Array(h)
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) row += indexToChar(px[y * w + x]!)
    rows[y] = row
  }
  return rows
}

/**
 * Parse untrusted input into a runtime Doc. Never throws; enforces every
 * invariant in SPEC.md §2.
 */
export function parseDoc(input: unknown): Result<Doc, DocError> {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch (e) {
      return err({ code: 'json', message: `not valid JSON: ${(e as Error).message}` })
    }
  }

  // Reject a future format version explicitly rather than guessing at it.
  if (raw && typeof raw === 'object' && 'v' in raw) {
    const v = (raw as { v: unknown }).v
    if (typeof v === 'number' && v > FORMAT_VERSION) {
      return err({
        code: 'future_version',
        message: `document format v${v} is newer than this build understands (v${FORMAT_VERSION})`,
      })
    }
  }

  const parsed = serializedDocSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]!
    return err({
      code: 'schema',
      message: first.message,
      path: first.path.join('.'),
    })
  }
  const s: SerializedDoc = parsed.data

  if (s.palette[0]!.c !== 'transparent') {
    return err({
      code: 'palette_zero',
      message: 'palette[0] must be "transparent"',
      path: 'palette.0.c',
    })
  }

  const frames = []
  for (let f = 0; f < s.frames.length; f++) {
    const frame = s.frames[f]!
    const layers = []
    for (let l = 0; l < frame.layers.length; l++) {
      const layer = frame.layers[l]!
      const decoded = decodeRows(layer.px, s.w, s.h)
      if (!decoded.ok) {
        return err({
          ...decoded.error,
          path: `frames.${f}.layers.${l}.${decoded.error.path ?? 'px'}`,
        })
      }
      // Every index must resolve to a real palette entry.
      for (let p = 0; p < decoded.value.length; p++) {
        const i = decoded.value[p]!
        if (i >= s.palette.length) {
          const x = p % s.w
          const y = Math.floor(p / s.w)
          return err({
            code: 'palette_range',
            message: `pixel at (${x}, ${y}) uses palette index ${i}, but the palette has ${s.palette.length} entries`,
            // The row and column, not just `px`. The message already names the
            // pixel; the path used to name the whole array, so the code panel
            // could only wash the entire grid to point at one character
            // (docs/specs/07-code-panel.md §3). Every other error in this file
            // is as specific as it can be and this one was not.
            path: `frames.${f}.layers.${l}.px[${y}][${x}]`,
          })
        }
      }
      layers.push({ n: layer.n, hidden: layer.hidden, px: decoded.value })
    }
    frames.push({ ms: frame.ms, layers })
  }

  return ok({
    v: FORMAT_VERSION,
    id: s.id,
    name: s.name,
    w: s.w,
    h: s.h,
    palette: s.palette,
    frames,
    meta: s.meta,
  })
}

/** Stable key order, 2-space indent, pixel rows one per line. */
export function serializeDoc(doc: Doc): string {
  const out: SerializedDoc = {
    v: FORMAT_VERSION,
    id: doc.id,
    name: doc.name,
    w: doc.w,
    h: doc.h,
    palette: doc.palette,
    frames: doc.frames.map((f) => ({
      ms: f.ms,
      layers: f.layers.map((l) => ({
        n: l.n,
        ...(l.hidden ? { hidden: true } : {}),
        px: encodeRows(l.px, doc.w, doc.h),
      })),
    })),
    meta: doc.meta,
  }
  return JSON.stringify(out, null, 2)
}

/** Deep clone. Ops apply to a clone; the original is never mutated. */
export function cloneDoc(doc: Doc): Doc {
  return {
    ...doc,
    palette: doc.palette.map((p) => ({ ...p })),
    frames: doc.frames.map((f) => ({
      ms: f.ms,
      layers: f.layers.map((l) => ({ ...l, px: new Uint8Array(l.px) })),
    })),
    meta: { ...doc.meta },
  }
}
