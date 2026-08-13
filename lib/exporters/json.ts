/**
 * JSON exporter. See docs/specs/08-exporters.md §6.
 *
 * `serializeDoc` is already canonical — this wraps it, and does not
 * re-implement it. The whole document, every frame: unlike the other five
 * exporters there is no `frame` option, because JSON is not a picture of one
 * frame, it is the document.
 */

import { serializeDoc } from '../artwork-core/codec'
import { ok, type Doc } from '../artwork-core/schema'
import type { ExportResult } from './types'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type JsonOptions = Record<string, never>

export function exportJson(doc: Doc, _opts: JsonOptions = {}): ExportResult {
  return ok({
    filename: `${doc.name || 'artwork'}.tessera.json`,
    mime: 'application/json',
    data: serializeDoc(doc),
  })
}
