/**
 * What the File menu is, and what it says. See docs/specs/17-file-menu.md.
 *
 * Same split as `canvas-size.ts`, and for the same reason (HANDOFF §11): a
 * control that lives entirely inside a `.tsx` has no CI guard, because `npm test`
 * runs in node and the browser probes need a dev server. So the *shape* of the
 * menu and every sentence it says are here, where a test can hold them, and
 * `components/Chrome.tsx` is left with markup and the calls that mutate.
 *
 * The three items the reference has and we do not — Dashboard, Explore,
 * Publish to community — are absent rather than disabled, and `SPEC.md §0` puts
 * them out permanently. `file-menu.test.ts` asserts they have not crept back,
 * because "we removed the accounts feature" is exactly the kind of decision that
 * gets undone by a later hand reaching for a familiar menu.
 */

import { paintedCellCount } from '../artwork-core/clear'
import type { Doc } from '../artwork-core/schema'
import type { StarterName } from '../artwork-core/create'

export type FileMenuItemId =
  | 'new'
  | 'open'
  | 'duplicate'
  | 'examples'
  | 'download'
  | 'png'
  | 'clear'

export type FileMenuItem = {
  id: FileMenuItemId
  label: string
  /**
   * The keyboard hint, and ONLY when that key is really wired.
   *
   * Spec §1 draws four of these; §6 makes shortcuts a later step and only Ctrl+S
   * exists today (`app/page.tsx`). A hint is a promise about a key, so the
   * column stays empty until the promise can be kept — §7.2.
   */
  hint?: string
  /** Expands in place instead of running. §7.1 says why it is not a flyout. */
  submenu?: true
  /** Red, and confirms before it runs. */
  destructive?: true
}

/**
 * The menu, as groups. A divider is drawn *between* groups and never around an
 * empty one — spec §0: "a divider that exists only to separate an empty group is
 * worse than no divider".
 *
 * Open recent (B2) and Paste image (B3) belong in the first group and are not
 * here yet. They are absent rather than disabled for the same reason the account
 * items are: a row that looks like a control and does nothing is worse than no
 * row.
 */
export const FILE_MENU: readonly (readonly FileMenuItem[])[] = [
  [
    { id: 'new', label: 'New…' },
    { id: 'open', label: 'Open…' },
    { id: 'duplicate', label: 'Duplicate' },
  ],
  [{ id: 'examples', label: 'Examples', submenu: true }],
  [
    // "Download", not "Export" — spec §7.6. Export is what the Code panel will
    // do to a different format, and one word for both acts would be ambiguous
    // in a menu that eventually carries six exporters.
    { id: 'download', label: 'Download .tessera.json', hint: 'Ctrl S' },
    { id: 'png', label: 'Export PNG' },
  ],
  [{ id: 'clear', label: 'Clear…', destructive: true }],
]

/** Flat, in visual order. Handy for "is every item reachable" checks. */
export const FILE_MENU_ITEMS: readonly FileMenuItem[] = FILE_MENU.flat()

/** `face` → `Face`. The submenu row's label; the starter names are the source. */
export const starterLabel = (name: StarterName): string =>
  name.charAt(0).toUpperCase() + name.slice(1)

// ─── the two confirms ────────────────────────────────────────────────────────

/**
 * Whether New… has to ask. Spec F-M1.
 *
 * Blank in, no dialog: making someone confirm that they want to blank an
 * already-blank canvas is how a confirm becomes a thing people click through
 * without reading, which is the only way a confirm can actually fail.
 */
export const needsNewConfirm = (doc: Doc | null, frame: number): boolean =>
  !!doc && paintedCellCount(doc, frame) > 0

/** `143 painted pixels`, `1 painted pixel`. Shared so the two confirms agree. */
const pixels = (n: number): string => `${n} painted pixel${n === 1 ? '' : 's'}`

/**
 * New…, said honestly — §7.5, and a correction to §2 recorded in §7.
 *
 * §2 claims New "is not undoable through commit". It is: `new_document` commits
 * a `replace_doc` carrying the whole previous document, so Ctrl+Z brings the
 * drawing back exactly. What is *not* recoverable is a reload — the new blank
 * canvas keeps the same document id, so autosave writes over the old draft, and
 * undo history is memory-only (`lib/persist/idb.ts`). That is the real
 * one-way-door and it is what the sentence says, rather than a stronger claim
 * that the code does not support.
 */
export const newConfirm = (w: number, h: number): string =>
  `Replace this drawing with a blank ${w}×${h} canvas? Undo brings it back, until you reload.`

/**
 * Clear…, with its cost stated while the decision is still open.
 *
 * The shape A2 earned on the Canvas tab: say what it costs before the button,
 * not in a toast after. Clear is destructive-but-undoable exactly like a crop,
 * so it gets the crop's sentence rather than a scarier one.
 */
export const clearConfirm = (count: number): string =>
  `Clear ${pixels(count)} from every layer of this frame? Undo brings ${count === 1 ? 'it' : 'them'} back.`

/** The red button inside the Clear confirm. Says the verb, not "OK". */
export const CLEAR_ACTION = 'Clear frame'
/** The red button inside the New confirm. */
export const NEW_ACTION = 'New canvas'
