/**
 * What a document is called. See docs/specs/17-file-menu.md §8.1 and §7.10.
 *
 * One home for every rule about the `name` field, because there are now three
 * callers with the same constraints and they were about to disagree: the header
 * input renames, Duplicate derives a copy name, and `createDoc` starts one
 * empty. The schema caps it at `MAX_NAME`, and a name one character over that
 * does not fail loudly — it fails on the *next load*, when `parseDoc` rejects
 * the draft the user has been working in.
 *
 * The layer analogue is `cleanLayerName` in layers.ts; this is deliberately its
 * twin rather than a shared generic, because the two have different limits and
 * an empty layer name is not legal where an empty document name is.
 */

import type { EditorCommand } from './commands'
import { MAX_NAME, type Doc } from './schema'

/**
 * What the header shows when a document has no name.
 *
 * A placeholder the UI draws, **not** a value the document holds. That
 * distinction is load-bearing: `createDoc` leaves `name` empty, so if this were
 * stored instead, every new document would be genuinely called "untitled" and
 * `copyName` would produce "untitled copy" for a document the user had never
 * named — which is the current behaviour only because the placeholder is read,
 * not because the value is set.
 */
export const UNTITLED = 'untitled'

/**
 * A typed name, made safe to store.
 *
 * Trimmed, newlines collapsed, and cut to the schema's limit. Empty stays
 * empty — clearing the field is a legitimate way to say "this has no name", and
 * substituting `untitled` there would write the placeholder into the document
 * and destroy the distinction above.
 */
export function cleanDocName(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
}

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
 * An unnamed document copies as `untitled copy` rather than `" copy"`: here the
 * placeholder IS the best available name, because the alternative is a name
 * that starts with a space.
 *
 * The result is clamped to `MAX_NAME`, trimming the stem rather than the
 * suffix: a copy that cannot be told apart from its original is worse than a
 * shortened one.
 */
export function copyName(name: string): string {
  const base = name.trim() || UNTITLED
  const m = COPY.exec(base)
  const stem = m ? m[1]! : base
  const next = m ? (m[2] ? Number(m[2]) : 1) + 1 : 1
  const suffix = next === 1 ? ' copy' : ` copy ${next}`

  const room = MAX_NAME - suffix.length
  // Only reachable from a name already near the limit; `|| UNTITLED` covers the
  // pathological case where the suffix leaves no room at all.
  const head = stem.length > room ? stem.slice(0, Math.max(0, room)).trimEnd() : stem
  return (head || UNTITLED) + suffix
}

/**
 * A rename, or null when there is nothing to rename.
 *
 * Same shape as `paintCommand`: null for a no-op, so retyping the name a
 * document already has cannot consume an undo step. That matters more here than
 * it looks — the field commits on blur, and clicking away from a field you did
 * not change is the single most common thing to do with it.
 */
export function renameCommand(doc: Doc, text: string): EditorCommand | null {
  const after = cleanDocName(text)
  if (after === doc.name) return null
  return { type: 'doc_rename', label: `Rename to ${after || UNTITLED}`, before: doc.name, after }
}
