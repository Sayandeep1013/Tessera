/**
 * The exporter contract. See docs/specs/08-exporters.md §1 and §12.3.
 *
 * `ExportResult` reuses `artwork-core`'s own `Result<T, E>` rather than
 * inventing a second success/failure shape — the CSS exporter's pixel cap
 * (§4) needs somewhere to put "no" that is not a lie inside `data`.
 */

import type { Doc, Result } from '../artwork-core/schema'

export type ExportOk = {
  filename: string
  mime: string
  data: string | Uint8Array
  /** Set when the export succeeded but is worth a second look — §4's 4,096-pixel CSS warning. */
  warning?: string
}

export type ExportResult = Result<ExportOk, string>

export type Exporter<O> = (doc: Doc, opts: O) => ExportResult

/** `c === 'transparent'` never reaches this — only palette[0] may be, and every
 *  exporter skips index 0 before looking up a colour. `#rrggbb` or `#rrggbbaa`. */
export function splitColor(c: string): { fill: string; opacity?: number } {
  if (c.length === 9) {
    const alpha = parseInt(c.slice(7, 9), 16) / 255
    return { fill: c.slice(0, 7), opacity: Math.round(alpha * 1000) / 1000 }
  }
  return { fill: c }
}
