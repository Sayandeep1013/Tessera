/**
 * Fork a document into a new draft. See docs/specs/17-file-menu.md §2 and §7.9.
 *
 * Duplicate is the "try something without ruining this" gesture, and the whole
 * value of it is that the original survives untouched in IndexedDB. That means
 * two things have to be true and both are easy to get wrong:
 *
 *   1. A **fresh id**. Drafts are keyed by `doc.id`, so a copy that kept the id
 *      would overwrite the original on the next autosave — the opposite of the
 *      feature.
 *   2. **No shared buffers.** `px` is a Uint8Array; a shallow copy would leave
 *      the two documents painting each other.
 *
 * The id is injected rather than generated here, like `createDoc` — artwork-core
 * imports nothing but zod and stays pure.
 */

import { cloneDoc } from './codec'
import { copyName } from './doc-name'
import type { Doc } from './schema'

// `copyName` moved to doc-name.ts in B2, when renaming arrived and there were
// three callers with the same length and emptiness rules. Re-exported so the
// name of the thing has not changed for anyone importing it.
export { UNTITLED, copyName } from './doc-name'

/**
 * A deep copy of `doc` under a new id and a copy name.
 *
 * `createdAt` is stamped now, not carried over: this document did not exist
 * before this moment, and Open recent orders by save time — a copy claiming its
 * original's birthday would be a lie the moment anyone looked.
 */
export function duplicateDoc(doc: Doc, opts: { id: string; now?: string }): Doc {
  const now = opts.now ?? new Date().toISOString()
  return {
    ...cloneDoc(doc),
    id: opts.id,
    name: copyName(doc.name),
    meta: { createdAt: now, updatedAt: now },
  }
}
