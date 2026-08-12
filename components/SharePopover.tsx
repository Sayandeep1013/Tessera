'use client'

/**
 * The share popover. See docs/specs/09-persistence.md §3 and §4.
 *
 * The rule this component exists to honour: **the user is told what sharing
 * means before their artwork leaves the browser**, not after. Everything else
 * in Tessera is local — IndexedDB, localStorage, a canvas — and this one button
 * uploads their work to a database that anyone with the link can read. That is
 * a genuine change in kind, so the first state of this popover is an
 * explanation and a button, never a spinner that has already started.
 *
 * Two things are said plainly because both surprise people:
 *   - anyone with the link can view it, and the link is the only lock;
 *   - the share is a snapshot, so later edits do not appear in it.
 */

import { useEffect, useRef, useState } from 'react'
import { serializeDoc } from '@/lib/artwork-core/codec'
import { useDocStore } from '@/lib/store/editor'

type State =
  | { kind: 'intro' }
  | { kind: 'sharing' }
  | { kind: 'shared'; url: string }
  | { kind: 'error'; message: string }

export function SharePopover({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc)
  /**
   * Absent configuration is a supported state, not an error (spec 09 §5). Only
   * the URL is checkable here — the service-role key is server-side by rule —
   * but the two are always set together, and offering "Create link" on a
   * deployment that will answer 503 is worse than saying so up front.
   */
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const [state, setState] = useState<State>({ kind: 'intro' })
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // mousedown, not click: the click that opened this popover is still
  // propagating when the effect registers, so a click listener would close it
  // in the same gesture and it would never appear. See docs/HANDOFF.md §5.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const share = async () => {
    if (!doc) return
    setState({ kind: 'sharing' })
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doc: serializeDoc(doc) }),
      })
      const data = (await res.json()) as { url?: string; message?: string }
      if (!res.ok || !data.url) {
        setState({ kind: 'error', message: data.message ?? 'Something went wrong.' })
        return
      }
      setState({ kind: 'shared', url: data.url })
    } catch {
      setState({
        kind: 'error',
        message: "Couldn't reach the server. Your artwork is safe on this device.",
      })
    }
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked; the field is selectable */
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Share"
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60,
        width: 320, padding: 12, display: 'grid', gap: 10,
        background: 'var(--panel)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {!configured && (
        <>
          <p style={{ margin: 0, font: 'var(--t-label-lg)' }}>Sharing isn&rsquo;t set up here</p>
          <p style={{ margin: 0, font: 'var(--t-copy-sm)', color: 'var(--muted)' }}>
            This deployment has no share backend configured. Everything else works, and you can
            still export the artwork as JSON or PNG from the File menu.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ height: 36, padding: '0 12px', font: 'var(--t-label)', color: 'var(--muted)' }}
            >
              Close
            </button>
          </div>
        </>
      )}

      {configured && state.kind === 'intro' && (
        <>
          <p style={{ margin: 0, font: 'var(--t-label-lg)' }}>Share this artwork</p>
          <p style={{ margin: 0, font: 'var(--t-copy-sm)', color: 'var(--muted)' }}>
            This uploads a copy to Tessera&rsquo;s server and gives you a link.{' '}
            <strong style={{ color: 'var(--fg)', fontWeight: 500 }}>
              Anyone with the link can view it.
            </strong>{' '}
            There is no password and no way to delete it afterwards.
          </p>
          <p style={{ margin: 0, font: 'var(--t-copy-sm)', color: 'var(--muted)' }}>
            The link is a snapshot — edits you make after sharing won&rsquo;t appear in it.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ height: 36, padding: '0 12px', font: 'var(--t-label)', color: 'var(--muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => void share()}
              disabled={!doc}
              style={{
                height: 36, padding: '0 14px', borderRadius: 'var(--r-pill)',
                font: 'var(--t-label)',
                background: doc ? 'var(--solid)' : 'var(--panel2)',
                color: doc ? 'var(--onsolid)' : 'var(--disabled)',
              }}
            >
              Create link
            </button>
          </div>
        </>
      )}

      {configured && state.kind === 'sharing' && (
        <p style={{ margin: 0, font: 'var(--t-copy)', color: 'var(--muted)' }} aria-live="polite">
          Uploading…
        </p>
      )}

      {configured && state.kind === 'shared' && (
        <>
          <p style={{ margin: 0, font: 'var(--t-label-lg)' }}>Link created</p>
          <input
            readOnly
            value={state.url}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: '100%', height: 36, padding: '0 8px',
              borderRadius: 'var(--r-md)', background: 'var(--panel2)',
              font: 'var(--t-mono-sm)', color: 'var(--fg)',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}
            >
              Open
            </a>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* A new snapshot rather than an update: the row is immutable by
                  database policy, so "update the share" is not a thing that
                  could be offered honestly. */}
              <button
                onClick={() => setState({ kind: 'intro' })}
                style={{ height: 36, padding: '0 10px', font: 'var(--t-label-sm)', color: 'var(--muted)' }}
              >
                Share again
              </button>
              <button
                onClick={() => void copy(state.url)}
                style={{
                  height: 36, padding: '0 14px', borderRadius: 'var(--r-pill)',
                  font: 'var(--t-label)', background: 'var(--solid)', color: 'var(--onsolid)',
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </>
      )}

      {configured && state.kind === 'error' && (
        <>
          <p role="alert" style={{ margin: 0, font: 'var(--t-copy-sm)', color: 'var(--diff-remove)' }}>
            {state.message}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ height: 36, padding: '0 12px', font: 'var(--t-label)', color: 'var(--muted)' }}
            >
              Close
            </button>
            <button
              onClick={() => setState({ kind: 'intro' })}
              style={{
                height: 36, padding: '0 14px', borderRadius: 'var(--r-pill)',
                font: 'var(--t-label)', background: 'var(--solid)', color: 'var(--onsolid)',
              }}
            >
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  )
}
