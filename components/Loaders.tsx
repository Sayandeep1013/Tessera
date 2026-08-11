'use client'

/**
 * The two loaders. See docs/specs/13-visual-identity.md §4.
 *
 * Both are made of pixels. A rotating ring in a pixel-art editor says nothing
 * about the product, and this is the one animation on screen that carries
 * information rather than decoration.
 *
 * Everything about the motion lives in globals.css. The only JS here is setting
 * one custom property per cell — deliberately, so the animation stays on the
 * compositor and reduced-motion is a stylesheet decision rather than a branch.
 */

import { useEffect, useRef, useState } from 'react'

/** Show-delay and minimum-visible time. Both are mandatory (§4.1). */
export const LOADER_SHOW_DELAY_MS = 200
export const LOADER_MIN_VISIBLE_MS = 400

// ─── boot: "the mosaic" ──────────────────────────────────────────────────────

/**
 * A 5×5 document at 10× zoom: the gaps are the app's own gridlines. The ripple
 * is Manhattan distance from the centre cell, so the rings are 1, 4, 8, 8, 4.
 */
export function MosaicLoader({ label = 'Loading…' }: { label?: string }) {
  const cells = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const d = Math.abs(x - 2) + Math.abs(y - 2)
      cells.push(<i key={`${x}-${y}`} style={{ ['--d' as string]: d }} />)
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'grid', justifyItems: 'center', gap: 16 }}
    >
      <span className="tessera-loader" aria-hidden>
        {cells}
      </span>
      <span style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}

// ─── inline: "the turn" ──────────────────────────────────────────────────────

/**
 * The logo, moving — four tesserae with the lifted tile travelling clockwise.
 * 16px total, so it exactly replaces the send glyph rather than resizing the
 * button around it.
 *
 * Grid order is TL, TR, BL, BR; the travel order is clockwise, so BL is 3 and
 * BR is 2.
 */
export function TurnMark() {
  return (
    <span className="tessera-turn" aria-hidden>
      <i style={{ ['--i' as string]: 0 }} />
      <i style={{ ['--i' as string]: 1 }} />
      <i style={{ ['--i' as string]: 3 }} />
      <i style={{ ['--i' as string]: 2 }} />
    </span>
  )
}

// ─── elapsed ─────────────────────────────────────────────────────────────────

/**
 * AI turns run 2–10s against a 5-per-minute limit, so an indeterminate mark on
 * its own leaves the user unable to tell "slow" from "hung". This is the only
 * part of §4 that survives reduced motion unchanged, because it then becomes the
 * only progress signal there is.
 */
export function Elapsed({ since, retryAfter }: { since: number; retryAfter?: number }) {
  const [now, setNow] = useState(since)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [since])

  if (retryAfter !== undefined) {
    return <Readout>Rate-limited — retrying in {retryAfter}s</Readout>
  }

  const secs = Math.floor((now - since) / 1000)
  if (secs < 1) return null
  return <Readout>{secs < 10 ? 'Thinking…' : 'Still working…'} {secs}s</Readout>
}

function Readout({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular" style={{ color: 'var(--muted)' }}>
      {children}
    </span>
  )
}

// ─── the gate ────────────────────────────────────────────────────────────────

/**
 * Under ~200ms a loader is worse than nothing, and a show-delay alone only moves
 * the flash later — so once shown it stays for a minimum time. Both numbers are
 * required; either one alone does not solve it.
 */
export function useLoaderGate(active: boolean): boolean {
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)

  useEffect(() => {
    if (active) {
      const id = setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, LOADER_SHOW_DELAY_MS)
      return () => clearTimeout(id)
    }

    if (!visible) return
    const held = Date.now() - shownAt.current
    const remaining = Math.max(0, LOADER_MIN_VISIBLE_MS - held)
    const id = setTimeout(() => setVisible(false), remaining)
    return () => clearTimeout(id)
  }, [active, visible])

  return visible
}
