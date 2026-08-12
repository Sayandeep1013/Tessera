'use client'

/**
 * Remix / Export / Copy link. See docs/specs/09-persistence.md §4.
 *
 * The only client component on the viewer, because these three are the only
 * things on the page that need a browser: the clipboard, a download, and
 * IndexedDB.
 *
 * Remix hands the document to the editor with a FRESH id, as a new local draft.
 * It does not link back and it records no lineage — remix lineage is an
 * explicit non-goal (spec 09 §1), and the shared row is immutable anyway, so
 * there is nothing a link back could point at that could ever change.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDoc, serializeDoc } from '@/lib/artwork-core/codec'
import { saveDraft } from '@/lib/persist/idb'
import { nanoid } from 'nanoid'

function Action({
  children, onClick, primary,
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 40, padding: '0 16px', borderRadius: 'var(--r-pill)',
        font: 'var(--t-label)',
        background: primary ? 'var(--solid)' : 'var(--panel)',
        color: primary ? 'var(--onsolid)' : 'var(--fg)',
        boxShadow: primary ? 'none' : 'var(--shadow-card)',
      }}
    >
      {children}
    </button>
  )
}

export function ViewerActions({ id, name, doc }: { id: string; name: string; doc: string }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const remix = async () => {
    setBusy(true)
    const parsed = parseDoc(doc)
    if (!parsed.ok) {
      setBusy(false)
      return
    }
    // A fresh id, so the remix is a new drawing rather than an edit of the
    // original's local draft — opening two remixes of one share must not have
    // them overwrite each other.
    const copy = { ...parsed.value, id: nanoid(), name: `${name} remix` }
    try {
      await saveDraft(copy)
      router.push('/')
    } catch {
      // IndexedDB unavailable (private mode). Falling back to a download keeps
      // the artwork reachable rather than dropping it — rule 7.
      download(`${name}.tessera.json`, serializeDoc(copy))
      setBusy(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — the URL bar still has it */
    }
  }

  return (
    <footer style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      <Action primary onClick={() => void remix()}>
        {busy ? 'Opening…' : 'Remix'}
      </Action>
      <Action onClick={() => download(`${name}.tessera.json`, doc)}>Export JSON</Action>
      <Action onClick={() => void copyLink()}>{copied ? 'Link copied' : 'Copy link'}</Action>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied to the clipboard' : ''}
      </span>
      <input type="hidden" value={id} readOnly />
    </footer>
  )
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
