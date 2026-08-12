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
import { MAX_NAME, type Doc } from './schema'

/** What an unnamed document is called once it needs a name of its own. */
export const UNTITLED = 'untitled'

/** `<stem> copy`, or `<stem> copy <n>` for the second and later copies. */
const COPY = /^(.*?) copy(?: (\d+))?$/

/**
 * The name a copy gets.
 *
 * §2 says `"<name> copy"` and stops, which makes three duplicates
 * `face copy copy copy`. Incrementing instead — `face` → `face copy` →
 * `face copy 2` — keeps the name the length of a name, and the number says how
 * many times you have reached for this without having to count the words.
 *
 * An empty name is the default (the header shows `untitled` as a placeholder,
 * not as a value), and `" copy"` is not a name, so it becomes `untitled copy`.
 *
 * The result is clamped to the schema's `MAX_NAME`, trimming the stem rather
 * than the suffix: a copy that cannot be told apart from its original is worse
 * than a shortened one, and a name one character over the limit would fail to
 * parse on the next load.
 */
export function copyName(name: string): string {
  const base = name.trim() || UNTITLED
  const m = COPY.exec(base)
  const stem = m ? m[1]! : base
  const next = m ? (m[2] ? Number(m[2]) : 1) + 1 : 1
  const suffix = next === 1 ? ' copy' : ` copy ${next}`

  const room = MAX_NAME - suffix.length
  // Only reachable from a name that is already near the limit; `|| UNTITLED`
  // covers the pathological case where the suffix leaves no room at all.
  const head = stem.length > room ? stem.slice(0, Math.max(0, room)).trimEnd() : stem
  return (head || UNTITLED) + suffix
}

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
