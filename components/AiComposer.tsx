'use client'

import { useEffect, useRef } from 'react'
import { useAiStore } from '@/lib/store/ai'
import { diffCounts } from '@/lib/artwork-core/diff'
import { SparkIcon } from './icons'

const shell: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  bottom: 16,
  background: 'var(--surface)',
  borderRadius: 'var(--r-xl)',
  boxShadow: 'var(--shadow-1)',
  zIndex: 6,
}

export function AiComposer() {
  const status = useAiStore((s) => s.status)
  const instruction = useAiStore((s) => s.instruction)
  const error = useAiStore((s) => s.error)
  const setInstruction = useAiStore((s) => s.setInstruction)
  const submit = useAiStore((s) => s.submit)
  const dismissError = useAiStore((s) => s.dismissError)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (status === 'review') return <ProposalBar />

  const busy = status === 'pending'

  return (
    <div style={{ ...shell, width: 380 }}>
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', fontSize: 12, color: 'var(--diff-remove)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => void submit()} style={{ color: 'var(--fg)', fontWeight: 500 }}>
            Retry
          </button>
          <button onClick={dismissError} aria-label="Dismiss" style={{ color: 'var(--fg-faint)' }}>
            ✕
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 8px 0 14px' }}
      >
        <span
          aria-hidden
          style={{
            color: busy ? 'var(--accent)' : 'var(--fg-faint)',
            display: 'grid', placeItems: 'center',
            animation: busy ? 'tessera-pulse 1s ease-in-out infinite' : undefined,
          }}
        >
          <SparkIcon />
        </span>
        <input
          ref={inputRef}
          value={instruction}
          onChange={(e) => {
            setInstruction(e.target.value)
            if (error) dismissError()
          }}
          placeholder="Ask AI…  “make it angrier”"
          aria-label="Describe the change you want"
          style={{
            flex: 1, height: 36, border: 0, outline: 'none', background: 'transparent',
            fontSize: 14, color: 'var(--fg)',
          }}
        />
        <button
          type="submit"
          disabled={busy || !instruction.trim()}
          aria-label={busy ? 'Working' : 'Send'}
          style={{
            width: 32, height: 32, display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-pill)',
            background: instruction.trim() && !busy ? 'var(--accent)' : 'var(--surface-2)',
            color: instruction.trim() && !busy ? 'var(--accent-fg)' : 'var(--fg-faint)',
            cursor: busy ? 'progress' : instruction.trim() ? 'pointer' : 'default',
          }}
        >
          {busy ? <Spinner /> : '↑'}
        </button>
      </form>

      <style>{`@keyframes tessera-pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes tessera-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid var(--fg-faint)', borderTopColor: 'transparent',
        animation: 'tessera-spin .7s linear infinite',
      }}
    />
  )
}

function ProposalBar() {
  const p = useAiStore((s) => s.proposal)
  const view = useAiStore((s) => s.view)
  const setView = useAiStore((s) => s.setView)
  const accept = useAiStore((s) => s.accept)
  const reject = useAiStore((s) => s.reject)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') reject()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) accept()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [accept, reject])

  if (!p) return null
  const c = diffCounts(p.diff)

  return (
    <div style={{ ...shell, width: 420, padding: 14 }} role="dialog" aria-label="AI proposal">
      <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.45 }}>{p.summary}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Stat n={c.added} label="added" color="var(--diff-add)" />
        <Stat n={c.changed} label="changed" color="var(--diff-change)" />
        <Stat n={c.removed} label="cleared" color="var(--diff-remove)" />
        {c.palette > 0 && (
          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            +{c.palette} colour{c.palette === 1 ? '' : 's'}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <div
          role="radiogroup"
          aria-label="Compare"
          style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--r-pill)', padding: 2 }}
        >
          {(['before', 'after'] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 'var(--r-pill)',
                background: view === v ? 'var(--surface)' : 'transparent',
                boxShadow: view === v ? 'var(--shadow-1)' : 'none',
                color: view === v ? 'var(--fg)' : 'var(--fg-muted)',
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={reject}
          style={{
            height: 32, padding: '0 14px', borderRadius: 'var(--r-md)',
            color: 'var(--fg-muted)', fontSize: 13, fontWeight: 500,
          }}
        >
          Reject
        </button>
        <button
          onClick={accept}
          style={{
            height: 32, padding: '0 16px', borderRadius: 'var(--r-md)',
            background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 13, fontWeight: 500,
          }}
        >
          Accept
        </button>
      </div>
    </div>
  )
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span className="tabular" style={{ color: 'var(--fg)' }}>{n}</span>
      {label}
    </span>
  )
}
