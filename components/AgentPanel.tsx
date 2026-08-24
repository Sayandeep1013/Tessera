'use client'

/**
 * The agent panel. See docs/specs/12-agent-actions.md §5 and §9.
 *
 * There is no accept/reject here, unlike the single-shot proposal bar. The work
 * lands on the canvas as it happens and the whole session is one undo, so reject
 * and undo are the same gesture and a second control for it would be a lie about
 * how the thing works.
 *
 * Styled per docs/specs/13-visual-identity.md (direction 2.B, "Mosaic"): tokens
 * for every size and colour, and all motion in globals.css so reduced-motion is
 * a stylesheet decision rather than a branch in here.
 */

import { useEffect, useRef, useState } from 'react'
import { useAgentStore } from '@/lib/store/agent'
import { useDocStore } from '@/lib/store/editor'
import {
  FREE_SESSIONS,
  PROVIDERS,
  clearApiKey,
  getApiKey,
  getConfig,
  maskApiKey,
  setConfig,
} from '@/lib/agent/byok'
import { chromeFor, useTier } from '@/lib/editor/breakpoint'
import { Elapsed, TurnMark } from './Loaders'
import { ArrowUp, Sliders } from './icons'
import { Tooltip } from './Tooltip'
import { describeOutcome } from '@/lib/agent/outcome'

/** 8 tools, each railButton tall, plus the rail's own 6px padding either side. */
const railHeight = (c: ReturnType<typeof chromeFor>) => c.railButton * 8 + 12

/**
 * How far up from the bottom edge the panel has to start to clear a horizontal
 * tool rail, measured from the rail itself.
 *
 * Only the phone tier needs this — everywhere else the rail is a vertical
 * column and the maxHeight in shellFor handles it arithmetically. The rail
 * wraps to two rows below about 364px of usable width, and nothing in
 * chromeFor knows the viewport width, so the height cannot be derived. A
 * ResizeObserver on the real element is the honest answer; the fallback is the
 * single-row figure, which is what it was before and is right until it wraps.
 */
function useRailClearance(c: ReturnType<typeof chromeFor>): number {
  const oneRow = c.inset + c.railButton + 12 + 8
  const [clearance, setClearance] = useState(oneRow)

  useEffect(() => {
    if (!c.railHorizontal) return
    const rail = document.querySelector('[role="toolbar"][aria-label="Tools"]')
    if (!(rail instanceof HTMLElement)) return
    const measure = () => setClearance(c.inset + rail.getBoundingClientRect().height + 8)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(rail)
    return () => ro.disconnect()
  }, [c.railHorizontal, c.inset])

  return c.railHorizontal ? clearance : oneRow
}

/**
 * 400 wide on a large viewport; full width less the insets below that. At 390 the
 * fixed width was 2px wider than the viewport itself, which is how a panel ends
 * up causing a horizontal scrollbar on a page that must never scroll.
 */
function shellFor(c: ReturnType<typeof chromeFor>, railBottom: number): React.CSSProperties {
  return {
    position: 'absolute',
    left: c.inset,
    /**
     * On a phone the tool rail lies along the bottom edge and the panel sits
     * above it. `railBottom` is the rail's MEASURED height, not a computed one:
     * at 320px the eight 44px buttons need 364px and only 304 are available, so
     * the rail wraps to two rows. A static `inset + railButton + 20` assumed one
     * row and put the panel straight through it — caught by
     * tools/probe-agent-ui.ts at 320x568, which is exactly the viewport the
     * wrapping was added for.
     */
    bottom: c.railHorizontal ? railBottom : c.inset,
    width: c.railHorizontal ? `calc(100% - ${c.inset * 2}px)` : 400,
    maxWidth: `calc(100% - ${c.inset * 2}px)`,
    /**
     * Capped so a long step log cannot grow up into the tool rail.
     *
     * Derived rather than picked: both the rail and this panel are positioned
     * inside <main>. The rail is `top: 50%` with a -50% translate, so its
     * bottom edge sits at `50% + railHeight/2`. This panel is anchored at
     * `bottom: inset`, so its top edge is at `100% - inset - height`. Requiring
     * the second to stay below the first gives
     *
     *     height < 50% - inset - railHeight/2
     *
     * and the extra 8px is breathing room rather than a touching fit. A fixed
     * vh value was the first attempt and is wrong — it does not know how tall
     * the rail is, and railButton changes with the tier.
     *
     * railLift is added back because the rail is no longer centred on <main>:
     * it is lifted, so its bottom edge is that much higher and this panel has
     * that much more room. Reading the same constant the rail uses is what
     * keeps the two from drifting apart.
     *
     * On a phone the rail is horizontal along the bottom and the panel already
     * clears it via `bottom`, so there the cap only needs to stop the panel
     * swallowing the whole canvas.
     */
    maxHeight: c.railHorizontal
      ? `calc(100% - ${railBottom + c.inset + 8}px)`
      : `calc(50% - ${c.inset + railHeight(c) / 2 + 8 - c.railLift}px)`,
    // The log is the part that gives way; the composer and the outcome row are
    // pinned. A user must never have to scroll to reach Undo all or Stop.
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    padding: 10,
    background: 'var(--panel)',
    borderRadius: 'var(--r-xl)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 6,
  }
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
  const c = chromeFor(useTier())
  const railBottom = useRailClearance(c)
  const shell = shellFor(c, railBottom)
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
      {status === 'confirm' && <ConfirmRow />}
      {busy && <StepLog />}
      {status === 'done' && <DoneRow />}
      {status === 'error' && <ErrorRow onAddKey={() => setKeyOpen(true)} />}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void start()
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, flex: 'none' }}
      >
        <Tooltip label={hasKey ? 'Your API key' : 'Use your own API key'} placement="top">
        <button
          type="button"
          onClick={() => setKeyOpen(true)}
          aria-label={hasKey ? 'Your API key' : 'Use your own API key'}
          style={{
            width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-pill)', color: hasKey ? 'var(--fg)' : 'var(--muted)',
          }}
        >
          <Sliders size={20} />
        </button>
        </Tooltip>

        <input
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={busy}
          placeholder="Tell the agent what to do…"
          aria-label="Tell the agent what to do"
          style={{
            flex: '1 1 0', minWidth: 0, height: 40, padding: '8px 4px',
            background: 'transparent', font: 'var(--t-copy)', color: 'var(--fg)',
          }}
        />

        {/* The button keeps its identity while working — aria-busy rather than
            swapping the child for a bare spinner node, so it stays the same
            control to a screen reader and stays focusable. */}
        <Tooltip label={busy ? 'Working…' : 'Send'} shortcut={busy ? undefined : 'Enter'} placement="top">
        <button
          type="submit"
          disabled={!ready}
          aria-busy={busy || undefined}
          aria-label={busy ? 'Working' : 'Send'}
          style={{
            width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-pill)',
            background: ready || busy ? 'var(--solid)' : 'var(--panel2)',
            color: ready || busy ? 'var(--onsolid)' : 'var(--disabled)',
          }}
        >
          {busy ? <TurnMark /> : <ArrowUp size={16} />}
        </button>
        </Tooltip>
      </form>

      {!hasKey && status === 'idle' && (
        <p style={{ margin: '6px 4px 0', font: 'var(--t-label-sm)', color: 'var(--muted)', flex: 'none' }}>
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
  // Mount time, not render time — this must not reset on every step.
  const startedAt = useRef(Date.now()).current

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [log.length])

  return (
    <div
      style={{
        padding: '2px 4px 10px',
        // The panel is capped so it cannot reach the tool rail; the log is the
        // part that gives way. minHeight 0 is what actually permits a flex
        // child to shrink below its content.
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flex: 'none' }}>
        <span className="tabular" style={{ color: 'var(--muted)' }}>
          Step {step} of {ofSteps}
        </span>
        {/* An indeterminate mark alone leaves the user unable to tell slow from
            hung, and these turns run 2–10s. */}
        <Elapsed since={startedAt} />
        <div style={{ flex: 1 }} />
        <button
          onClick={stop}
          style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}
        >
          Stop
        </button>
      </div>

      <div
        role="log"
        aria-live="polite"
        style={{
          flex: '1 1 auto', minHeight: 0, maxHeight: 168,
          overflowY: 'auto', display: 'grid', gap: 3, alignContent: 'start',
        }}
      >
        {log.map((e) => (
          <div
            key={e.id}
            className="step-row"
            style={{ display: 'flex', alignItems: 'baseline', gap: 8, font: 'var(--t-label-sm)' }}
          >
            <span
              aria-hidden
              style={{
                width: 5, height: 5, flex: 'none', borderRadius: 'var(--r-sm)', marginTop: 1,
                background: e.ok ? 'var(--diff-add)' : 'var(--diff-remove)',
              }}
            />
            <code style={{ font: 'var(--t-mono)', color: 'var(--fg)' }}>{e.name}</code>
            <span style={{ color: 'var(--muted)', flex: 1, minWidth: 0 }}>{e.detail}</span>
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
      <p style={{ margin: '0 0 8px', font: 'var(--t-copy-sm)' }}>
        The agent wants to run <code style={{ fontWeight: 600 }}>{confirm.name}</code>. This
        discards work and cannot be reversed from inside the session.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => answer(false)}
          style={{ height: 30, padding: '0 12px', font: 'var(--t-label-sm)', color: 'var(--muted)' }}
        >
          Don’t
        </button>
        <button
          onClick={() => answer(true)}
          style={{
            height: 30, padding: '0 14px', borderRadius: 'var(--r-md)', font: 'var(--t-label-sm)', background: 'var(--diff-remove)', color: 'var(--onaccent)',
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: 'var(--t-label-sm)', color: 'var(--muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span className="tabular" style={{ color: 'var(--fg)' }}>{n}</span>
      {label}
    </span>
  )
}

function DoneRow() {
  const summary = useAgentStore((s) => s.summary)
  const changed = useAgentStore((s) => s.changed)
  const stoppedBy = useAgentStore((s) => s.stoppedBy)
  const counts = useAgentStore((s) => s.counts)
  const dismiss = useAgentStore((s) => s.dismiss)
  const undo = useDocStore((s) => s.undo)

  /**
   * The headline comes from the diff, not from the model. A run where the model
   * said "I've drawn a smiley face" and called nothing used to render that
   * sentence as the result, above three zeroed counters, and read as success.
   * See docs/specs/15-feedback-and-input.md §3.
   */
  const outcome = describeOutcome(changed, stoppedBy)
  const headlineColour =
    outcome.tone === 'warning' ? 'var(--diff-change)' : outcome.tone === 'neutral' ? 'var(--muted)' : 'var(--fg)'

  return (
    <div style={{ padding: '2px 4px 10px', flex: '0 1 auto', minHeight: 0, overflowY: 'auto' }}>
      <p style={{ margin: '0 0 4px', font: 'var(--t-label-lg)', color: headlineColour }}>
        {outcome.headline}
      </p>
      {/* The model's own words are kept — often they are the useful part, e.g.
          "I couldn't find a face to modify" — but demoted below the verdict. */}
      {summary && summary !== outcome.headline && (
        <p style={{ margin: '0 0 8px', font: 'var(--t-copy-sm)', color: 'var(--muted)' }}>{summary}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/*
          The triad comes from the pixel diff, and a session that added a layer or
          recoloured the palette collapses to replace_doc with an EMPTY diff — so
          it rendered "50 pixels changed" beside "0 added, 0 changed, 0 cleared",
          two statements that cannot both be true. Found by eval scenarios L2 and
          C1 (docs/specs/19). Showing nothing is honest; showing three zeroes is
          not. The headline and the model's own summary already say what happened.
        */}
        {counts.added + counts.changed + counts.removed > 0 && (
          <>
            <Stat n={counts.added} label="added" color="var(--diff-add)" />
            <Stat n={counts.changed} label="changed" color="var(--diff-change)" />
            <Stat n={counts.removed} label="cleared" color="var(--diff-remove)" />
          </>
        )}
        {counts.palette > 0 && (
          <span style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>
            +{counts.palette} colour{counts.palette === 1 ? '' : 's'}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {outcome.undoable && (
          <button
            onClick={() => {
              undo()
              dismiss()
            }}
            style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}
          >
            Undo all
          </button>
        )}
        <button onClick={dismiss} style={{ font: 'var(--t-label-sm)', color: 'var(--fg)' }}>
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
      <p style={{ margin: '0 0 8px', font: 'var(--t-copy-sm)', color: 'var(--diff-remove)' }}>
        {error}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {needsKey && (
          <button
            onClick={onAddKey}
            style={{ font: 'var(--t-label-sm)', color: 'var(--fg)' }}
          >
            Add your key
          </button>
        )}
        <button onClick={dismiss} style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ─── bring your own key ──────────────────────────────────────────────────────

/**
 * The key dialog. See docs/specs/18-provider-byok.md §7.
 *
 * Grew a provider picker in unit I. The credential promise, the mask and Remove
 * are unchanged — they were already right.
 */
function KeyDialog({ onClose }: { onClose: () => void }) {
  const existing = getConfig()
  const [choice, setChoice] = useState<string>('gemini')
  const [value, setValue] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [compat, setCompat] = useState(false)

  const preset = PROVIDERS[choice]
  const custom = choice === 'custom'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Picking a preset fills its URL and sets its profile — both stay visible. */
  function pick(next: string) {
    setChoice(next)
    const p = PROVIDERS[next]
    setBaseUrl(p?.baseUrl ?? '')
    setCompat(p?.profile === 'claude-code')
  }

  function save() {
    const key = value.trim()
    if (!key) return
    setConfig({
      providerId: custom ? 'anthropic' : (preset?.id ?? 'gemini'),
      apiKey: key,
      ...(custom ? { baseUrl: baseUrl.trim() } : preset?.baseUrl ? { baseUrl: preset.baseUrl } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
      ...((custom ? compat : preset?.profile === 'claude-code')
        ? { profile: 'claude-code' as const }
        : {}),
    })
    onClose()
  }

  const field = {
    height: 32,
    padding: '0 10px',
    borderRadius: 'var(--r-md)',
    background: 'var(--panel2)',
    border: '1px solid var(--line)',
    font: 'var(--t-mono)',
    color: 'var(--fg)',
  } as const

  const showCompatNote = custom ? compat : preset?.profile === 'claude-code'

  return (
    <>
      {/* A scrim, because this is a modal decision about a credential — and
          because anchoring the card to the panel put it straight on top of the
          tool rail, which sits at a higher z-index and painted over it. */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your API key"
        style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(420px, calc(100vw - 32px))', zIndex: 91,
          padding: 16, background: 'var(--panel)', borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-lg)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
        }}
      >
        <p style={{ margin: '0 0 10px', font: 'var(--t-label-lg)' }}>Use your own API key</p>

        {existing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{ flex: 1, font: 'var(--t-label-sm)', color: 'var(--muted)' }}>
              {maskApiKey(existing.apiKey)}
            </code>
            <button
              onClick={() => {
                clearApiKey()
                onClose()
              }}
              style={{ font: 'var(--t-label-sm)', color: 'var(--diff-remove)' }}
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <label
              style={{
                display: 'block', margin: '0 0 4px',
                font: 'var(--t-label-sm)', color: 'var(--muted)',
              }}
            >
              Provider
            </label>
            <select
              aria-label="Provider"
              value={choice}
              onChange={(e) => pick(e.currentTarget.value)}
              style={{ ...field, width: '100%', font: 'var(--t-label-sm)', marginBottom: 10 }}
            >
              {Object.entries(PROVIDERS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Anthropic-compatible…</option>
            </select>

            {custom && (
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.currentTarget.value)}
                placeholder="https://your-relay.example.com"
                aria-label="Base URL"
                style={{ ...field, width: '100%', marginBottom: 10 }}
              />
            )}

            {/*
              This is a promise about someone's credentials. It belongs in the
              interface where they can read it, not only in a spec they will
              never open.
            */}
            <p style={{ margin: '0 0 12px', font: 'var(--t-copy-sm)', color: 'var(--muted)' }}>
              Stored in this browser only. Sent with each request, used once, and discarded — never
              logged and never saved on our server. Remove it any time.{' '}
              <a
                href={preset?.getKeyUrl ?? PROVIDERS.gemini!.getKeyUrl}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'var(--fg)', textDecoration: 'underline' }}
              >
                Get a key
              </a>
              .
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                autoFocus
                type="password"
                value={value}
                onChange={(e) => setValue(e.currentTarget.value)}
                placeholder={custom ? 'sk-…' : (preset?.placeholder ?? 'AIza…')}
                aria-label="API key"
                style={{ ...field, flex: 1 }}
              />
              <button
                type="submit"
                disabled={!value.trim()}
                style={{
                  height: 32, padding: '0 14px', borderRadius: 'var(--r-md)',
                  font: 'var(--t-label-sm)', background: 'var(--solid)', color: 'var(--onsolid)',
                }}
              >
                Save
              </button>
            </form>

            {choice !== 'gemini' && (
              <input
                value={model}
                onChange={(e) => setModel(e.currentTarget.value)}
                placeholder="claude-opus-5"
                aria-label="Model"
                style={{ ...field, width: '100%', marginTop: 8 }}
              />
            )}

            {custom && (
              <label
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10,
                  font: 'var(--t-copy-sm)', color: 'var(--muted)',
                }}
              >
                <input
                  type="checkbox"
                  checked={compat}
                  onChange={(e) => setCompat(e.currentTarget.checked)}
                  aria-label="AgentRouter compatibility"
                  style={{ marginTop: 2 }}
                />
                <span>AgentRouter compatibility</span>
              </label>
            )}

            {/*
              §7.3. The one shim in this codebase that misrepresents what the
              client is, said plainly where the person turning it on can read it.
              Same standard as the credential promise above.
            */}
            {showCompatNote && (
              <p style={{ margin: '8px 0 0', font: 'var(--t-copy-sm)', color: 'var(--muted)' }}>
                {PROVIDERS.agentrouter!.note}
              </p>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>
            Close
          </button>
        </div>
      </div>
    </>
  )
}
