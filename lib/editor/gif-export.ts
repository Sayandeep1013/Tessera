/**
 * Runs GIF encoding in a Web Worker. See docs/specs/08-exporters.md §9.
 *
 * The one place any of GIF export touches the DOM — spinning up the worker,
 * handing it the document (structured-cloneable, `03-artwork-core.md §10`, so
 * it crosses without manual serialisation), and turning its message stream
 * back into a promise plus a progress callback. `lib/exporters/gif.ts` stays
 * pure and testable in node; this is what makes it usable from a click
 * handler without freezing the tab.
 */

import type { Doc } from '../artwork-core/schema'
import type { ExportResult } from '../exporters/types'
import type { GifWorkerRequest, GifWorkerResponse } from '../exporters/gif-worker'

export function runGifExport(
  doc: Doc,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../exporters/gif-worker.ts', import.meta.url))

    worker.onmessage = (e: MessageEvent<GifWorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        onProgress?.(msg.done, msg.total)
      } else if (msg.type === 'done') {
        worker.terminate()
        resolve(msg.result)
      } else {
        worker.terminate()
        reject(new Error(msg.message))
      }
    }

    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'the GIF worker failed'))
    }

    const request: GifWorkerRequest = { type: 'encode', doc }
    worker.postMessage(request)
  })
}
