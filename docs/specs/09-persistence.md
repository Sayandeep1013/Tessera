# 09 — Persistence and Sharing

**Owns:** `lib/persist/**`, `app/api/share/route.ts`, `app/a/[id]/**`
**Depends on:** [01 — Document Format](./01-document-format.md), [03 — artwork-core](./03-artwork-core.md)
**Phase:** 1 (local) · 4 (sharing)

Deliberately boring. **There is exactly one persistence model.** The source PRD proposed four
conflicting ones (event log, snapshot rows, relational frame/palette tables, JSON blob) and never
chose; that ambiguity would have detonated here.

---

## 1. Explicit non-goals

Not built, not designed, not stubbed: user accounts, auth, revision history, event sourcing, a
revision graph, a sync queue, conflict resolution, remix lineage, likes, comments, feeds, moderation.

`artwork_revisions`, `artwork_frames`, `artwork_palettes` do not exist. If history is ever wanted, it
gets designed then, against a real requirement.

---

## 2. Local drafts (Phase 1)

IndexedDB via `idb`. Database `tessera`, version 1, one store:

```ts
// store 'drafts', keyPath 'id'
type DraftRecord = {
  id: string          // doc.id
  doc: string         // serializeDoc output
  name: string
  updatedAt: number   // epoch ms
  thumb?: string      // data URL, ≤ 128px — for a future drafts list
}
```

Index on `updatedAt` for "most recent first".

### Autosave

```
commit → debounce 500ms → serializeDoc → put → status 'saved'
```

- Status `saved | saving | offline | error`, shown as a 12px dim label in the top bar. Never a toast,
  never a modal ([02 §7](./02-design-system.md)).
- `beforeunload` flushes synchronously.
- **On write failure** (quota exceeded, private-mode restrictions): status goes `error`, the label
  becomes a button offering `Retry` and `Download JSON`. **Artwork is never silently discarded** —
  this is the guarantee of last resort, and it is a test case, not a hope.
- Only the *document* is persisted. In-progress strokes and pending AI proposals are not.

### Load

On mount: most recent draft by `updatedAt` → `parseDoc`. On a parse failure (a corrupt record, or a
document written by a newer format version) the app **keeps the bad record**, loads a starter sprite,
and surfaces `Couldn't open your last drawing. It's still saved — [download it]`. Deleting a user's
only copy of their work because we cannot read it is not acceptable.

### Undo is not persisted

A refresh keeps the artwork and loses the undo stack ([05 §7](./05-editor.md)). Stated in
`⋯ → About` rather than discovered.

---

## 3. Sharing (Phase 4)

One Supabase table. No auth, no accounts.

```sql
create table artworks (
  id          text primary key,
  doc         jsonb not null,
  name        text not null default 'untitled',
  created_at  timestamptz not null default now()
);

alter table artworks enable row level security;
create policy "public read"   on artworks for select using (true);
create policy "public insert" on artworks for insert with check (true);
-- Deliberately no update or delete policy: shares are immutable.
```

`id` is `nanoid(10)` — 10 chars from a 64-symbol alphabet ≈ 60 bits. Unguessable in practice, which
is the entire access-control model. This is stated plainly in the share dialog: *"Anyone with the
link can view this."*

### `POST /api/share`

Node runtime. Sequence:

1. Body ≤ **256KB** → else `413`.
2. `parseDoc(body.doc)` → else `400` with the `DocError`. **Never insert unvalidated JSON** — the
   viewer would then have to handle malformed documents at read time.
3. Rate limit: 10 shares per IP per hour, same in-memory sliding window as the AI route
   ([06 §9](./06-ai-protocol.md)).
4. `nanoid(10)`, insert, return `{ id, url }`.

Writes use the service-role key **server-side only**. The anon key is never used for insert, and the
service key never reaches the client bundle (asserted by the same bundle test as the AI key).

### Immutability

A share is a **snapshot**. Editing after sharing does not change the shared copy. The share popover
says so, and offers `Share again` to create a new link. This is why there is no update policy — the
guarantee is enforced by the database, not by convention.

---

## 4. Viewer — `/a/[id]`

Server component. Fetches by id, `parseDoc`, renders.

- **404** → a real not-found page: *"This artwork doesn't exist, or the link is wrong."*
- **Parse failure** (a row predating a format change) → *"This artwork was made with an older version
  and can't be opened."* Never a stack trace, never a blank canvas.

Layout: artwork centred at a fit scale, name, creation date, and three actions — `Remix`, `Export`,
`Copy link`. No editing, no like button, no comments, no author (there are no accounts).

**Remix** loads the document into the editor with a **fresh `doc.id`**, as a new local draft. It does
not link back and does not record lineage — remix lineage is an explicit non-goal (§1). The original
share is untouched, which follows from there being no update policy.

### OG image

`app/a/[id]/opengraph-image.tsx`, Node runtime. Renders the document through `renderThumbnail`
([04 §7](./04-renderer.md)) at 1200×630 on a `--bg` field, artwork centred at the largest integer
scale that fits with a 64px margin. Nearest-neighbour, never smoothed — a blurry OG image for a pixel
art tool would be an embarrassing detail.

Cached with `revalidate: false`; shares are immutable so the image can never go stale.

---

## 5. Environment

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Never `NEXT_PUBLIC_`. Bundle test enforces. |

Absent config disables sharing gracefully: the `Share` button renders with a tooltip
*"Sharing isn't configured for this deployment"*. Phases 1–3 run with no Supabase project at all.

---

## 6. Test requirements

**Local**
- Round trip: save → reload → `parseDoc` deep-equals the original
- Debounce: 10 rapid commits produce one write
- Quota-exceeded on write → status `error`, `Download JSON` offered, document still in memory
- A corrupt draft record loads a starter and **retains** the bad record
- `beforeunload` flushes a pending save

**Share** (Supabase client mocked)
- Valid document → 201 with a 10-char id
- Malformed document → 400, nothing inserted
- 257KB body → 413
- 11th share in an hour → 429
- Service-role key absent from the client bundle

**Viewer**
- Known id renders the artwork
- Unknown id → 404 page
- Unparseable row → the friendly message, not a crash
- Remix produces a new `doc.id` and leaves the shared row untouched
- OG image is 1200×630 and pixel-crisp at integer scale
