'use client'

/**
 * Re-fit the view after the DOCUMENT's dimensions change.
 *
 * Loading an example and resizing the canvas are the two ways a document can
 * change size under a viewport that was fitted to the old one. Both leave the
 * old scale and offset pointing at a canvas that no longer exists — grow a 16x16
 * to 256x256 at 45x and the artwork is somewhere off the bottom-right corner,
 * which reads as "resize deleted my work" rather than as a scroll position.
 *
 * The trade-off, stated because it is real: someone zoomed in doing detail work
 * who nudges 32 to 33 loses their zoom. That is the cost of the rule being one
 * sentence — "changing the size shows you the new canvas" — and a rule that
 * sometimes refits would be worse to predict than one that always does.
 *
 * Lives here rather than in viewport.ts because it reads the DOM and writes a
 * store, and viewport.ts is pure and tested as such.
 */

import type { Doc } from '../artwork-core/schema'
import { useEditorStore } from '../store/editor'
import { fitViewport } from './viewport'

export function refitViewport(doc: Doc): void {
  const el = document.querySelector('canvas')
  if (!el) return
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return
  useEditorStore.getState().setViewport(fitViewport(doc, r.width, r.height))
}
