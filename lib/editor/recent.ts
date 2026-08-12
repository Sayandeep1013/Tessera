/**
 * What the Open recent submenu shows. See docs/specs/17-file-menu.md §8.2.
 *
 * Same split as `canvas-size.ts` and `file-menu.ts`, for the same reason
 * (HANDOFF §11): a list that lives entirely inside a `.tsx` has no CI guard,
 * because `npm test` runs in node and the browser probes need a dev server. The
 * cap, the ordering, the exclusion, the dates and every string are decisions,
 * and all of them are testable without a browser.
 *
 * The IndexedDB read and the parse are in `lib/persist/idb.ts`; this module
 * takes what that returns and decides what a menu should do with it.
 */

import type { RecentEntry } from '../persist/idb'

/** §2: "capped at 10". */
export const RECENT_LIMIT = 10

/**
 * Beyond this, a thumbnail stops being cheap — §8.3.
 *
 * `spriteRects` merges horizontal runs, so a 16×16 starter is tens of rects and
 * a dense 256×256 is thousands. Ten of the latter in one popover is not a
 * thumbnail, it is a rendering job on the click that opens a menu. §2 said to
 * measure before committing to thumbnails; this is the measurement's answer —
 * draw them where they are free, and say the size where they are not.
 */
export const THUMB_MAX_CELLS = 64 * 64

/** Never an empty menu — §2. */
export const RECENT_EMPTY = 'Nothing saved yet.'

/** F-M4: the row stays, disabled, and says what is wrong with it. */
export const RECENT_CORRUPT = "Can't be read — kept, not deleted"

export type RecentRow = {
  id: string
  /** The name to show. Never blank — an unnamed document gets the placeholder. */
  label: string
  /** `2 min ago`. Relative, because an absolute time is not what you scan for. */
  when: string
  /** Whether a thumbnail is worth drawing for this one. */
  thumb: boolean
  /** Set when the record no longer parses. The row is disabled and says this. */
  error?: string
  entry: RecentEntry
}

/**
 * How long ago, in the coarsest unit that is still true.
 *
 * `now` is injected rather than read, so this is testable — and because the
 * repo's workflow scripts forbid ambient clocks in anything that has to be
 * reproducible.
 *
 * Deliberately coarse. Nobody scanning a list of drafts needs "4 minutes and 12
 * seconds"; they need to tell this morning's work from last week's. Anything
 * beyond a week becomes a date, because "23 days ago" is arithmetic and
 * "20 Jul" is a memory.
 */
export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * The rows, from what IndexedDB gave back.
 *
 * `currentId` is dropped: it is always the most recently saved, so it would
 * always be row one, and choosing it would do nothing. The list means
 * "documents you can go back to".
 *
 * `untitledLabel` is passed in rather than imported so this module does not
 * need to know about document naming; the caller hands it `UNTITLED`.
 */
export function recentRows(
  entries: readonly RecentEntry[],
  currentId: string | null,
  now: number,
  untitledLabel: string,
): RecentRow[] {
  return entries
    .filter((e) => e.record.id !== currentId)
    .map((entry) => ({
      id: entry.record.id,
      // The record's own name, not the parsed document's: a corrupt record has
      // no parsed document, and the record still remembers what it was called.
      // That is the difference between "Can't be read" and a nameless row.
      label: entry.record.name.trim() || untitledLabel,
      when: relativeTime(entry.record.updatedAt, now),
      thumb: !!entry.doc && entry.doc.w * entry.doc.h <= THUMB_MAX_CELLS,
      ...(entry.error ? { error: entry.error } : {}),
      entry,
    }))
}
