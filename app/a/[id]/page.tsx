/**
 * The share viewer. See docs/specs/09-persistence.md §4.
 *
 * A server component on purpose. The editor cannot server-render — everything
 * it shows comes from IndexedDB, localStorage or a measured rect — but a shared
 * artwork is the opposite: it is entirely known at request time, it has no
 * local state, and it is the one page that wants to be crawlable and instant.
 *
 * Rendered as SVG rather than canvas. spriteRects is pure and already exists
 * for the favicon, so there is no second drawing implementation here, no
 * hydration, and no JavaScript required to see the artwork at all.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { parseDoc } from '@/lib/artwork-core/codec'
import { spriteRects } from '@/lib/renderer/sprite-svg'
import { getShare } from '@/lib/persist/share'
import { ViewerActions } from './actions'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const row = await getShare(id)
  const name = row?.name?.trim() || 'untitled'
  return {
    title: `${name} — Tessera`,
    description: `A piece of pixel art made in Tessera.`,
  }
}

/** A centred message. Used for both failure modes, which must never be a stack
 *  trace, a blank canvas, or a redirect that loses what went wrong. */
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <main
      style={{
        minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24,
        background: 'var(--surface)', color: 'var(--fg)', textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420, display: 'grid', gap: 10, justifyItems: 'center' }}>
        <h1 style={{ font: 'var(--t-title)', margin: 0 }}>{title}</h1>
        <p style={{ font: 'var(--t-copy)', color: 'var(--muted)', margin: 0 }}>{body}</p>
        <Link
          href="/"
          style={{
            marginTop: 6, padding: '8px 14px', borderRadius: 'var(--r-pill)',
            background: 'var(--solid)', color: 'var(--onsolid)', font: 'var(--t-label)',
            textDecoration: 'none',
          }}
        >
          Open the editor
        </Link>
      </div>
    </main>
  )
}

export default async function SharedArtwork({ params }: Params) {
  const { id } = await params
  const row = await getShare(id)

  if (!row) {
    return (
      <Empty
        title="This artwork doesn't exist"
        body="The link may be wrong, or the artwork was never shared."
      />
    )
  }

  // A row written before a format change can fail to parse. It is immutable and
  // it is somebody's work, so say what happened rather than pretending the page
  // is empty. Rule 7 applies to reading as well as writing.
  const parsed = parseDoc(typeof row.doc === 'string' ? row.doc : JSON.stringify(row.doc))
  if (!parsed.ok) {
    return (
      <Empty
        title="This artwork can't be opened"
        body="It was made with an older version of the format. Nothing has been lost — it is still stored."
      />
    )
  }

  const doc = parsed.value
  const rects = spriteRects(doc, 0)
  const name = row.name?.trim() || 'untitled'
  const made = new Date(row.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <main
      style={{
        minHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto',
        gap: 20, padding: 24, background: 'var(--surface)', color: 'var(--fg)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ font: 'var(--t-title)', margin: 0 }}>{name}</h1>
        <span className="tabular" style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>
          {made}
        </span>
        <div style={{ flex: 1 }} />
        <Link
          href="/"
          style={{ font: 'var(--t-label)', color: 'var(--muted)', textDecoration: 'none' }}
        >
          Made in Tessera
        </Link>
      </header>

      {/* The artwork. width:min() with an aspect ratio keeps it centred and
          crisp at any viewport without measuring anything. */}
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
        <svg
          viewBox={`0 0 ${doc.w} ${doc.h}`}
          shapeRendering="crispEdges"
          role="img"
          aria-label={`Pixel artwork: ${name}`}
          style={{
            width: `min(72vh, 100%, ${doc.w * 24}px)`,
            aspectRatio: `${doc.w} / ${doc.h}`,
            imageRendering: 'pixelated',
            background: 'var(--art-bg)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {rects.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
          ))}
        </svg>
      </div>

      <ViewerActions id={id} name={name} doc={JSON.stringify(row.doc)} />
    </main>
  )
}
