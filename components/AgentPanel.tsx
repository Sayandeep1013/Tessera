'use client'

/**
 * The agent panel. See docs/specs/12-agent-actions.md §5 and §9.
 *
 * There is no accept/reject here, unlike the single-shot proposal bar. The work
 * lands on the canvas as it happens and the whole session is one undo, so reject
 * and undo are the same gesture and a second control for it would be a lie about
 * how the thing works.
 *
 * Sizing and motion in this file are deliberately provisional — docs/specs/13
 * defines the real scale, the real loader and the motion system, and this gets
 * restyled from it rather than guessed at twice.
 */

import { useEffect, useRef, useState } from 'react'
import { useAgentStore } from '@/lib/store/agent'
import { useDocStore } from '@/lib/store/editor'
import {
  FREE_SESSIONS,
  GET_KEY_URL,
  clearApiKey,
  getApiKey,
  maskApiKey,
  setApiKey,
} from '@/lib/agent/byok'
import { ArrowUp, Sliders } from './icons'

const shell: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  width: 380,
  padding: 10,
  background: 'var(--panel)',
  borderRadius: 'var(--r-xl)',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 6,
}

export function AgentPanel() {
  const status = useAgentStore((s) => s.status)
  const instruction = useAgentStore((s) => s.instruction)
  const setInstruction = useAgentStore((s) => s.setInstruction)
  const start = useAgentStore((s) => s.start)
  const refreshAccess = useAgentStore((s) => s.refreshAccess)
  const freeLeft = useAgentStore((s) => s.freeLeft)
  const [keyOpen, setKeyOpen] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // localStorage is only readable after mount, so the first paint must not
  // depend on it — otherwise the server and client markup disagree.
  useEffect(() => {
    refreshAccess()
    setHasKey(Boolean(getApiKey()))
  }, [refreshAccess])

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

  const busy = status === 'running' || status === 'confirm'
  const ready = Boolean(instruction.trim()) && !busy

  return (
    <div style={shell}>
      <Motion />

      {status === 'confirm' && <ConfirmRow />}
      {busy && <StepLog />}
      {status === 'done' && <DoneRow />}
      {status === 'error' && <ErrorRow onAddKey={() => setKeyOpen(true)} />}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void start()
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40 }}
      >
        <button
          type="button"
          onClick={() => setKeyOpen(true)}
          title={hasKey ? 'Your API key' : 'Use your own API key'}
          aria-label={hasKey ? 'Your API key' : 'Use your own API key'}
          style={{
            width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-pill)', color: hasKey ? 'var(--fg)' : 'var(--muted)',
          }}
        >
          <Sliders size={20} />
        </button>

        <input
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={busy}
          placeholder="Tell the agent what to do…"
          aria-label="Tell the agent what to do"
          style={{
            flex: '1 1 0', minWidth: 0, height: 40, padding: '8px 4px',
            background: 'transparent', fontSize: 14, color: 'var(--fg)',
          }}
        />

        <button
          type="submit"
          disabled={!ready}
          aria-label={busy ? 'Working' : 'Send'}
          style={{
            width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-pill)',
            background: ready ? 'var(--accent)' : 'var(--panel2)',
            color: ready ? 'var(--onaccent)' : 'var(--faint)',
          }}
        >
          {busy ? <PixelLoader /> : <ArrowUp size={16} />}
        </button>
      </form>

      {!hasKey && status === 'idle' && (
        <p style={{ margin: '6px 4px 0', fontSize: 11, color: 'var(--faint)' }}>
          {freeLeft > 0
            ? `${freeLeft} of ${FREE_SESSIONS} free tries left — then bring your own key.`
            : 'Free tries used. Add your own API key to keep going.'}
        </p>
      )}

      {keyOpen && (
        <KeyDialog
          onClose={() => {
            setKeyOpen(false)
            setHasKey(Boolean(getApiKey()))
            refreshAccess()
          }}
        />
      )}
    </div>
  )
}

// ─── the running session ─────────────────────────────────────────────────────

function StepLog() {
  const log = useAgentStore((s) => s.log)
  const step = useAgentStore((s) => s.step)
  const ofSteps = useAgentStore((s) => s.ofSteps)
  const stop = useAgentStore((s) => s.stop)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [log.length])

  return (
    <div style={{ padding: '2px 4px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }} className="tabular">
          Step {step} of {ofSteps}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={stop}
          style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}
        >
          Stop
        </button>
      </div>

      <div
        role="log"
        aria-live="polite"
        style={{ maxHeight: 168, overflowY: 'auto', display: 'grid', gap: 3 }}
      >
        {log.map((e) => (
          <div
            key={e.id}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11,
              animation: 'tessera-step-in .18s var(--ease) both',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5, height: 5, flex: 'none', borderRadius: 1, marginTop: 1,
                background: e.ok ? 'var(--diff-add)' : 'var(--diff-remove)',
              }}
            />
            <code style={{ color: 'var(--fg)' }}>{e.name}</code>
            <span style={{ color: 'var(--faint)', flex: 1, minWidth: 0 }}>{e.detail}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

function ConfirmRow() {
  const confirm = useAgentStore((s) => s.confirm)
  const answer = useAgentStore((s) => s.answerConfirm)
  if (!confirm) return null

  return (
    <div
      role="alertdialog"
      aria-label="Confirm action"
      style={{
        padding: 10, marginBottom: 8, borderRadius: 'var(--r-md)', background: 'var(--panel2)',
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.45 }}>
        The agent wants to run <code style={{ fontWeight: 600 }}>{confirm.name}</code>. This
        discards work and cannot be reversed from inside the session.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => answer(false)}
          style={{ height: 30, padding: '0 12px', fontSize: 12, color: 'var(--muted)' }}
        >
          Don’t
        </button>
        <button
          onClick={() => answer(true)}
          style={{
            height: 30, padding: '0 14px', borderRadius: 'var(--r-md)', fontSize: 12,
            fontWeight: 500, background: 'var(--diff-remove)', color: 'var(--onaccent)',
          }}
        >
          Allow
        </button>
      </div>
    </div>
  )
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span className="tabular" style={{ color: 'var(--fg)' }}>{n}</span>
      {label}
    </span>
  )
}

function DoneRow() {
  const summary = useAgentStore((s) => s.summary)
  const changed = useAgentStore((s) => s.changed)
  const counts = useAgentStore((s) => s.counts)
  const dismiss = useAgentStore((s) => s.dismiss)
  const undo = useDocStore((s) => s.undo)

  return (
    <div style={{ padding: '2px 4px 10px' }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.45 }}>{summary}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Stat n={counts.added} label="added" color="var(--diff-add)" />
        <Stat n={counts.changed} label="changed" color="var(--diff-change)" />
        <Stat n={counts.removed} label="cleared" color="var(--diff-remove)" />
        {counts.palette > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            +{counts.palette} colour{counts.palette === 1 ? '' : 's'}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {changed > 0 && (
          <button
            onClick={() => {
              undo()
              dismiss()
            }}
            style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}
          >
            Undo all
          </button>
        )}
        <button onClick={dismiss} style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg)' }}>
          Done
        </button>
      </div>
    </div>
  )
}

function ErrorRow({ onAddKey }: { onAddKey: () => void }) {
  const error = useAgentStore((s) => s.error)
  const needsKey = useAgentStore((s) => s.needsKey)
  const dismiss = useAgentStore((s) => s.dismiss)

  return (
    <div role="alert" style={{ padding: '2px 4px 10px' }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.45, color: 'var(--diff-remove)' }}>
        {error}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {needsKey && (
          <button
            onClick={onAddKey}
            style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg)' }}
          >
            Add your key
          </button>
        )}
        <button onClick={dismiss} style={{ fontSize: 11, color: 'var(--muted)' }}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ─── bring your own key ──────────────────────────────────────────────────────

function KeyDialog({ onClose }: { onClose: () => void }) {
  const existing = getApiKey()
  const [value, setValue] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-label="Your API key"
      style={{
        position: 'absolute', left: 0, bottom: 'calc(100% + 8px)', width: '100%',
        padding: 14, background: 'var(--panel)', borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500 }}>Use your own API key</p>

      {/*
        This is a promise about someone's credentials. It belongs in the interface
        where they can read it, not only in a spec they will never open.
      */}
      <p style={{ margin: '0 0 12px', fontSize: 11, lineHeight: 1.5, color: 'var(--muted)' }}>
        Stored in this browser only. Sent with each request, used once, and discarded — never
        logged and never saved on our server. Remove it any time.{' '}
        <a
          href={GET_KEY_URL}
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: 'var(--fg)', textDecoration: 'underline' }}
        >
          Get a free key
        </a>
        .
      </p>

      {existing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <code style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
            {maskApiKey(existing)}
          </code>
          <button
            onClick={() => {
              clearApiKey()
              onClose()
            }}
            style={{ fontSize: 12, fontWeight: 500, color: 'var(--diff-remove)' }}
          >
            Remove
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setApiKey(value)
            onClose()
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            autoFocus
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AIza…"
            aria-label="API key"
            style={{
              flex: 1, height: 34, padding: '0 10px', fontSize: 12,
              background: 'var(--panel2)', borderRadius: 'var(--r-md)', color: 'var(--fg)',
            }}
          />
          <button
            type="submit"
            disabled={!value.trim()}
            style={{
              height: 34, padding: '0 14px', borderRadius: 'var(--r-md)', fontSize: 12,
              fontWeight: 500, background: 'var(--accent)', color: 'var(--onaccent)',
            }}
          >
            Save
          </button>
        </form>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose} style={{ fontSize: 12, color: 'var(--muted)' }}>
          Close
        </button>
      </div>
    </div>
  )
}

// ─── motion ──────────────────────────────────────────────────────────────────

/**
 * Provisional. A pixel-art editor deserves a loader made of pixels rather than a
 * rotating ring — docs/specs/13 designs the real one, and this is a placeholder
 * that is at least on-theme in the meantime.
 */
function PixelLoader() {
  return (
    <span
      aria-hidden
      style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 3px)', gap: 1,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          style={{
            width: 3, height: 3, background: 'currentColor',
            animation: `tessera-pixel-pulse 1.05s var(--ease) ${(i % 3) * 0.12 + Math.floor(i / 3) * 0.12}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

function Motion() {
  return (
    <style>{`
      @keyframes tessera-step-in {
        from { opacity: 0; transform: translateY(3px) }
        to   { opacity: 1; transform: none }
      }
      @keyframes tessera-pixel-pulse {
        0%, 100% { opacity: .25 }
        40%      { opacity: 1 }
      }
      @media (prefers-reduced-motion: reduce) {
        [style*="tessera-step-in"] { animation: none !important }
      }
    `}</style>
  )
}
