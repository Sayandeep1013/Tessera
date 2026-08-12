/**
 * Share snapshots. See docs/specs/09-persistence.md §3.
 *
 * Server-side only. The service-role key lives here and must never reach the
 * browser — the bundle test in app/api/ai/agent/__tests__/route.test.ts scans
 * the real build for it, the same way it does for the model key.
 *
 * A share is immutable by construction: the table has a public read policy and
 * no update or delete policy at all, so "editing after sharing does not change
 * the shared copy" is a database guarantee rather than a convention this file
 * has to remember.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Doc } from '../artwork-core/schema'

export const SHARE_TABLE = 'artworks'

/** 10 chars of nanoid ≈ 60 bits. Unguessable in practice, and that is the
 *  entire access-control model — the link IS the capability. */
export const SHARE_ID_LENGTH = 10

export type ShareRow = {
  id: string
  doc: unknown
  name: string
  created_at: string
}

/**
 * Whether this deployment can share at all.
 *
 * Absent configuration is a supported state, not an error: phases 1–3 ran with
 * no Supabase project in existence. The Share button reads this and explains
 * itself rather than offering an action that 500s. See spec 09 §5.
 */
export function shareConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

let cached: SupabaseClient | null = null

/** Null when unconfigured, so every caller has to handle it. */
export function shareClient(): SupabaseClient | null {
  if (!shareConfigured()) return null
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // No session to persist and no user to refresh: this client is a
    // service-role connection in a stateless route handler.
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return cached
}

/** Insert a validated document. The caller must have parsed it already. */
export async function putShare(
  id: string,
  doc: Doc,
  serialized: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = shareClient()
  if (!db) return { ok: false, error: 'sharing is not configured for this deployment' }

  const { error } = await db.from(SHARE_TABLE).insert({
    id,
    doc: serialized,
    name: doc.name || 'untitled',
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function getShare(id: string): Promise<ShareRow | null> {
  const db = shareClient()
  if (!db) return null
  const { data, error } = await db
    .from(SHARE_TABLE)
    .select('id, doc, name, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as ShareRow
}

/** For tests, which swap the env between cases. */
export function __resetShareClient(): void {
  cached = null
}
