/**
 * Turns an `ExportResult` into a downloaded file, or a message to show.
 *
 * The one place any exporter's output touches the DOM — every module under
 * `lib/exporters/` stays pure (docs/specs/08-exporters.md §1), so the
 * `Blob`/`<a download>` dance lives here instead, next to `lib/editor/paste.ts`
 * and the rest of the browser-facing wiring.
 */

import type { ExportResult } from '../exporters/types'

/** Returns a message worth telling the user about — an error, or a warning — or null. */
export function saveExport(result: ExportResult): string | null {
  if (!result.ok) return result.error
  const { filename, mime, data } = result.value
  // `Uint8Array`'s ambient DOM type carries an `ArrayBufferLike` (which
  // includes `SharedArrayBuffer`) that `BlobPart` does not accept — every
  // buffer this app ever builds is a plain `ArrayBuffer`, so the cast is safe.
  const blob = new Blob([data as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return result.value.warning ?? null
}
