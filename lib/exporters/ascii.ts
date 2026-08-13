/**
 * ASCII exporter. See docs/specs/08-exporters.md §7 (added by unit D — §12.2).
 *
 * The `px` rows already ARE ascii art; this composites the frame to what is
 * actually visible (`flattenFrame`) and reuses `encodeRows`, the same
 * character mapping `serializeDoc` uses. No second encoding anywhere.
 */

import { flattenFrame } from './geometry'
import { encodeRows } from '../artwork-core/codec'
import { ok, err, type Doc } from '../artwork-core/schema'
import type { ExportResult } from './types'

export type AsciiOptions = { frame?: number }

export function exportAscii(doc: Doc, opts: AsciiOptions = {}): ExportResult {
  const frame = opts.frame ?? 0
  if (!doc.frames[frame]) return err(`frame ${frame} does not exist`)

  const flat = flattenFrame(doc, frame)
  const rows = encodeRows(flat, doc.w, doc.h)

  return ok({
    filename: `${doc.name || 'artwork'}.txt`,
    mime: 'text/plain',
    data: rows.join('\n') + '\n',
  })
}
