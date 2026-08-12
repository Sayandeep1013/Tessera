'use client'

/**
 * A segmented control: two to four options, exactly one active.
 *
 * Extracted rather than written inline for the fifth time. The Square/Round
 * pair in the top bar is this control built by hand, and the settings panel
 * needs four more of them; a fifth ad-hoc copy is how the keyboard behaviour
 * ends up different in each one.
 *
 * radiogroup, not a row of buttons. The distinction matters to a screen reader:
 * a row of buttons announces four independent actions, a radiogroup announces
 * "Symmetry, Off, 1 of 4" and says which is selected. Arrow keys move between
 * options and Home/End jump to the ends, per the APG radio-group pattern — with
 * roving tabindex, so Tab enters and leaves the group rather than walking every
 * option in it.
 */

import { useRef } from 'react'

export type SegmentedOption<T extends string> = {
  value: T
  /** What the user reads. Short — these sit in a 224px panel, four across. */
  label: string
  /** Announced instead of the label when the label is an abbreviation. */
  aria?: string
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 24,
}: {
  /** Names the group. Not rendered — the section heading above it is visible. */
  label: string
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (v: T) => void
  size?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  const move = (delta: number) => {
    const i = options.findIndex((o) => o.value === value)
    // Wraps: at the last option, Right goes back to the first. A control this
    // small has no scroll position to lose, so wrapping is pure convenience.
    const next = options[(i + delta + options.length) % options.length]!
    onChange(next.value)
    const el = ref.current?.querySelectorAll('button')[options.indexOf(next)]
    ;(el as HTMLElement | undefined)?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); onChange(options[0]!.value) }
    else if (e.key === 'End') { e.preventDefault(); onChange(options[options.length - 1]!.value) }
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 2,
        padding: 2,
        borderRadius: 'var(--r-pill)',
        background: 'var(--panel2)',
      }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria ?? o.label}
            // Roving tabindex: only the selected option is in the tab order.
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            style={{
              height: size,
              borderRadius: 'var(--r-pill)',
              font: 'var(--t-label-sm)',
              background: on ? 'var(--solid)' : 'transparent',
              color: on ? 'var(--onsolid)' : 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A labelled on/off switch. The one control in the panel that is not a group. */
export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', height: 28, font: 'var(--t-label)', color: 'var(--fg)',
      }}
    >
      <span>{label}</span>
      <span
        aria-hidden
        style={{
          width: 34, height: 20, flex: 'none', padding: 2, borderRadius: 'var(--r-pill)',
          background: checked ? 'var(--solid)' : 'var(--panel2)',
          display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start',
        }}
      >
        <span
          style={{
            width: 16, height: 16, borderRadius: 'var(--r-pill)',
            background: checked ? 'var(--onsolid)' : 'var(--muted)',
          }}
        />
      </span>
    </button>
  )
}
