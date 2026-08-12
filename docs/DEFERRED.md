# Parked — check before shipping

Things that are built-but-not-finished, or deliberately stopped part-way. Each
entry says what state it is actually in, so nobody has to rediscover it by
clicking around.

Distinct from `HANDOFF.md §11` (debt: things that work but are ugly) and from
the open task list (things not started). This is the middle case, and it is the
dangerous one — code that exists and looks finished but is not wired, tested or
switched on.

---

## Share — on hold, 12 Aug 2026

**Held at the user's request.** Do not resume without asking.

### What exists and works

- `app/api/share/route.ts` — POST, 256KB cap, `parseDoc` validation, 10/IP/hour,
  `nanoid(10)`, returns `{ id, url }`. Degrades to 503 with a real message when
  unconfigured.
- `app/a/[id]/page.tsx` — server-rendered viewer, SVG from the same
  `spriteRects` the favicon uses. Real messages for 404 and for a row that no
  longer parses.
- `app/a/[id]/actions.tsx` — Remix (fresh doc id, new local draft), Export JSON,
  Copy link.
- `components/SharePopover.tsx` — says what sharing means *before* the artwork
  leaves the browser, and says "Sharing isn't set up here" when unconfigured.
- Supabase table `artworks` on project `yxddexluidpzxmheqpoq`, RLS on, **public
  read only**. The `public insert` policy was dropped — see below.

### What is NOT done

1. **No tests.** `docs/specs/09-persistence.md §6` lists eight and none exist:
   201 on a valid document, 400 on a malformed one with nothing inserted, 413
   over the cap, 429 on the eleventh share, the service key absent from the
   client bundle, the viewer's three cases. **This is the blocker** — an
   unauthenticated public write with no tests should not go live.
2. **No environment variables on the deployment.** `NEXT_PUBLIC_SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY` are unset on Vercel, so the button currently
   renders the "not set up here" state. That is by design and safe.
3. **No OG image.** `app/a/[id]/opengraph-image.tsx` is specced (09 §4) and not
   written, so a shared link unfurls as plain text.
4. **The abuse surface has been thought about but not exercised.** The rate
   limit is in-memory and per-instance, so it resets on deploy and does not span
   Vercel lambdas. Fine for a portfolio demo, stated in the spec, but nobody has
   actually tried to abuse it.

### One thing that is worth keeping even if Share is dropped

The RLS change. The table had a `public insert` policy while every write went
through the service role — and the service role bypasses RLS entirely, so the
policy granted this application nothing and granted anyone holding the anon key
a way to insert rows directly, skipping the size cap, the validation and the
rate limit. It is dropped. Do not add it back "for the client to use"; the
client is not supposed to write.

---

## Canvas resize — specced, not built

`docs/specs/16-settings.md §4`. The Settings panel's Canvas tab currently says
so in plain words rather than showing a control that does nothing.

It is the only part of the settings work that mutates the document, so it needs
a `resize` command whose **inverse carries the cropped pixels** — undo is only
honest if it has the bytes. That is why it was not bolted onto the end of the
panel work.

---

## The File menu's account-shaped items — blocked by a settled rule

The reference's logo menu has **Dashboard**, **Explore** and **Publish to
community…**. All three are accounts-and-feeds features, and
`docs/SPEC.md §0` puts them out of scope *permanently*:

> **Out, permanently:** accounts · profiles · following · likes · comments ·
> explore/trending feeds · moderation tooling …

So a one-to-one File menu is not possible without reversing a decision that is
recorded as permanent. Everything else in that menu maps cleanly onto things we
have or could have — see `HANDOFF.md` for the mapping. **This needs the user's
call, not a guess.**

---

## AI edit quality — Phase 6, deferred long ago

Unchanged. `docs/PHASE-0-FINDINGS.md`, and `HANDOFF.md §7`. The standing
decision is not to spend time there.
