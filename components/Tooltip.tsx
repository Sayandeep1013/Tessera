'use client'

/**
 * Our tooltip, not the browser's. See docs/specs/15-feedback-and-input.md §5.
 *
 * Every hint in the editor used to be a native `title`, which meant the one
 * place the product visibly stopped being ours: the browser's styling, a delay
 * we do not control, no dark-mode awareness, no keyboard support, and on
 * Windows a pale box in a font that appears nowhere else in the application.
 *
 * Three things here are load-bearing rather than decorative:
 *
 *   - It renders through a portal. <main> is `overflow: hidden` and the tool
 *     rail sits inside it, so a tooltip rendered in place would be clipped by
 *     its own container at exactly the edges where it matters.
 *   - The trigger keeps its own aria-label and the tooltip itself is
 *     aria-hidden. The spec first called for aria-describedby, which is the
 *     usual advice, but here the tooltip text IS the trigger's accessible name
 *     — describing a button called "Brush" as "Brush" makes a screen reader say
 *     it twice. A tooltip must never be the only accessible name; when it
 *     merely repeats one, it should be silent. See §5.2's correction.
 *   - It is suppressed entirely where there is no hover. On a touch device a
 *     tooltip either never appears or appears stuck under a finger, and
 *     long-press-to-reveal is a different feature nobody asked for.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type Placement = 'top' | 'bottom' | 'left' | 'right'

const DELAY_IN = 400
/** Once one tooltip has opened, its neighbours open at once for this long.
 *  Scanning a toolbar should not cost 400ms a button. */
const GROUP_WINDOW = 500

let lastClosedAt = 0
/**
 * Module scope, not a ref, and that is the whole point.
 *
 * A per-instance ref was the first attempt and it did not work: clicking a
 * control that opens a popover re-renders the button, React remounts the
 * wrapper, pointerenter fires again on the fresh instance, and the group window
 * means it reopens with no delay — landing the Settings tooltip on top of the
 * Settings panel's own title. Only one tooltip can be open at a time, so one
 * module-level flag is the right shape, and it survives the remount that a ref
 * cannot.
 */
let suppressedUntilLeave = false

/** 8px from the trigger, and never closer than this to the viewport edge. */
const GAP = 8
const EDGE = 8

function place(
  trigger: DOMRect,
  tip: { width: number; height: number },
  preferred: Placement,
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  const fits = (p: Placement) => {
    switch (p) {
      case 'top': return trigger.top - GAP - tip.height >= EDGE
      case 'bottom': return trigger.bottom + GAP + tip.height <= vh - EDGE
      case 'left': return trigger.left - GAP - tip.width >= EDGE
      case 'right': return trigger.right + GAP + tip.width <= vw - EDGE
    }
  }

  // Flip to the opposite side before giving up — a tooltip clipped by the
  // window is worse than one on the other side of the button.
  const opposite: Record<Placement, Placement> = {
    top: 'bottom', bottom: 'top', left: 'right', right: 'left',
  }
  const p = fits(preferred) ? preferred : fits(opposite[preferred]) ? opposite[preferred] : preferred

  let left: number
  let top: number
  if (p === 'top' || p === 'bottom') {
    left = trigger.left + trigger.width / 2 - tip.width / 2
    top = p === 'top' ? trigger.top - GAP - tip.height : trigger.bottom + GAP
  } else {
    left = p === 'left' ? trigger.left - GAP - tip.width : trigger.right + GAP
    top = trigger.top + trigger.height / 2 - tip.height / 2
  }

  // Clamp along the cross axis so a tooltip on an edge control stays readable
  // instead of hanging off the side.
  return {
    left: Math.max(EDGE, Math.min(left, vw - tip.width - EDGE)),
    top: Math.max(EDGE, Math.min(top, vh - tip.height - EDGE)),
  }
}

export function Tooltip({
  label,
  shortcut,
  placement = 'top',
  children,
}: {
  label: string
  /** Rendered in mono after the label — a key should look like a key. */
  shortcut?: string
  placement?: Placement
  children: React.ReactElement
}) {
  const id = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const hoverable =
    typeof window === 'undefined' ? false : window.matchMedia('(hover: hover)').matches

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    if (open) lastClosedAt = Date.now()
    setOpen(false)
    setPos(null)
  }, [open])

  const openNow = useCallback(() => {
    // Dismissing on pointerdown is not enough on its own: the pointer is still
    // over the trigger afterwards, so the timer restarts and the tooltip comes
    // straight back over whatever the click opened. Once you have clicked a
    // control you know what it does.
    if (suppressedUntilLeave) return
    window.clearTimeout(timer.current)
    const wait = Date.now() - lastClosedAt < GROUP_WINDOW ? 0 : DELAY_IN
    timer.current = window.setTimeout(() => setOpen(true), wait)
  }, [])

  // Measure after paint, so the flip decision uses the tooltip's real size
  // rather than a guess from the text length.
  useEffect(() => {
    if (!open) return
    const trigger = wrapRef.current?.firstElementChild ?? wrapRef.current
    const tip = tipRef.current
    if (!trigger || !tip) return
    setPos(place(trigger.getBoundingClientRect(), tip.getBoundingClientRect(), placement))
  }, [open, placement])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // Any press anywhere dismisses: a tooltip left hanging over the thing you
    // just clicked is the most annoying failure this component has.
    const onScroll = () => close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])

  /**
   * Suppression is registered unconditionally, NOT gated on `open`.
   *
   * Gating it was the bug: a click that lands during the 400ms delay never saw
   * a pointerdown listener at all, so nothing was suppressed and the pending
   * timer opened the tooltip a moment later — on top of the panel the click had
   * just opened. The press has to be heard whether or not the tooltip is
   * showing yet.
   */
  useEffect(() => {
    const onDown = () => {
      suppressedUntilLeave = true
      window.clearTimeout(timer.current)
      setOpen(false)
      setPos(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!hoverable) return children

  return (
    <>
      <span
        ref={wrapRef}
        style={{ display: 'contents' }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && openNow()}
        onPointerLeave={() => {
          suppressedUntilLeave = false
          close()
        }}
        onFocus={(e) => {
          // focus-visible only: clicking a button focuses it, and a tooltip
          // that appears on every click is noise.
          if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) openNow()
        }}
        onBlur={close}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            aria-hidden
            style={{
              position: 'fixed',
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              // Hidden until placed, so it never flashes at the wrong spot.
              visibility: pos ? 'visible' : 'hidden',
              zIndex: 100,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              maxWidth: 260,
              padding: '5px 8px',
              borderRadius: 'var(--r-md)',
              background: 'var(--panel)',
              color: 'var(--fg)',
              font: 'var(--t-label-sm)',
              boxShadow: 'var(--shadow-lg)',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{label}</span>
            {shortcut && (
              <span className="tabular" style={{ color: 'var(--muted)', font: 'var(--t-mono-sm)' }}>
                {shortcut}
              </span>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
