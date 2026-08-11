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

export async function deleteDraft(id: string): Promise<void> {
  const d = await db()
  await d.delete(STORE, id)
}
