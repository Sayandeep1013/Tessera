/**
 * Local drafts. See docs/specs/09-persistence.md §2.
 *
 * Deliberately boring: one store, keyed by doc.id. Undo history is NOT persisted.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { Doc } from '../artwork-core/schema'
import { parseDoc, serializeDoc } from '../artwork-core/codec'

const DB_NAME = 'tessera'
const DB_VERSION = 1
const STORE = 'drafts'

export type DraftRecord = {
  id: string
  doc: string
  name: string
  updatedAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) {
        const store = d.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    },
  })
  return dbPromise
}

export async function saveDraft(doc: Doc): Promise<void> {
  const record: DraftRecord = {
    id: doc.id,
    doc: serializeDoc(doc),
    name: doc.name,
    updatedAt: Date.now(),
  }
  const d = await db()
  await d.put(STORE, record)
}

/**
 * Most recently updated draft, or null. A record that fails to parse is KEPT —
 * deleting a user's only copy of their work because we cannot read it is not
 * acceptable. The caller surfaces the problem and offers a download.
 */
export async function loadLatestDraft(): Promise<
  { doc: Doc } | { corrupt: DraftRecord; reason: string } | null
> {
  const d = await db()
  const all = (await d.getAllFromIndex(STORE, 'updatedAt')) as DraftRecord[]
  const latest = all[all.length - 1]
  if (!latest) return null

  const parsed = parseDoc(latest.doc)
  if (!parsed.ok) return { corrupt: latest, reason: `${parsed.error.code}: ${parsed.error.message}` }
  return { doc: parsed.value }
}

export async function listDrafts(): Promise<DraftRecord[]> {
  const d = await db()
  const all = (await d.getAllFromIndex(STORE, 'updatedAt')) as DraftRecord[]
  return all.reverse()
}

/**
 * One entry per saved draft, parsed. See docs/specs/17-file-menu.md §8.2.
 *
 * A row cannot be drawn without knowing whether its record is readable — the
 * name, the size and the thumbnail all come from the parsed document — so the
 * parse happens here rather than being repeated by every caller.
 *
 * A record that fails to parse becomes `{ record, error }` and is **kept**
 * (F-M4). Not deleted, and not filtered out either: hiding it is the same sin
 * as deleting it, because the row is the only remaining evidence that the work
 * exists at all. The menu shows it disabled with its reason.
 */
export type RecentEntry =
  | { record: DraftRecord; doc: Doc; error?: undefined }
  | { record: DraftRecord; doc?: undefined; error: string }

/**
 * Newest first, at most `limit` entries.
 *
 * The cap is applied BEFORE parsing: parsing is the expensive part, and there
 * is no point reading a hundred documents to show ten. It is applied before the
 * caller drops the currently-open document too, so a list of ten can come back
 * as nine — which is correct. The alternative, over-fetching to guarantee ten
 * rows, means parsing an extra document on every menu open to defend against a
 * case nobody notices.
 */
export async function listRecent(limit = 10): Promise<RecentEntry[]> {
  const records = (await listDrafts()).slice(0, limit)
  return records.map((record) => {
    const parsed = parseDoc(record.doc)
    return parsed.ok
      ? { record, doc: parsed.value }
      : { record, error: `${parsed.error.code}: ${parsed.error.message}` }
  })
}

export async function deleteDraft(id: string): Promise<void> {
  const d = await db()
  await d.delete(STORE, id)
}
