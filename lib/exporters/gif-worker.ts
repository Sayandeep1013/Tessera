/**
 * The GIF encoding Web Worker. See docs/specs/08-exporters.md §9 and §13.3.
 *
 * Runs `encodeGif` off the main thread so a 64-frame, 256×256 document never
 * freezes the tab while it compresses. The protocol is deliberately small:
 * one message in (`{ type: 'encode', doc }`), a `progress` message per frame,
 * and one `done` or `error` message to close it out. `lib/editor/gif-export.ts`
 * is the only thing that talks to this file.
 *
 * `self` is typed against `Window` in this project's single, DOM-flavoured
 * `tsconfig.json` (there is no separate `webworker`-lib config for the one
 * file that needs it), and `Window.postMessage` demands a `targetOrigin` a
 * worker's global scope does not have — so this narrows `self` to exactly the
 * two members it actually uses rather than fighting the ambient type.
 */

import { encodeGif } from './gif'
import type { Doc } from '../artwork-core/schema'
import type { ExportResult } from './types'

export type GifWorkerRequest = { type: 'encode'; doc: Doc }
export type GifWorkerResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; result: ExportResult }
  | { type: 'error'; message: string }

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<GifWorkerRequest>) => void) | null
  postMessage: (message: GifWorkerResponse) => void
}

ctx.onmessage = (e) => {
  if (e.data.type !== 'encode') return
  try {
    const result = encodeGif(e.data.doc, (done, total) => {
      ctx.postMessage({ type: 'progress', done, total })
    })
    ctx.postMessage({ type: 'done', result })
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
