'use client'

/**
 * The settings panel. See docs/specs/16-settings.md.
 *
 * Our Settings button used to toggle dark/light and nothing else, which made it
 * a theme switch wearing a sliders icon. The capability set here is measured
 * from the reference (spec 16 §0) — theme, pixel grid, transparency grid,
 * symmetry, canvas size — but every string, the layout and the identity are
 * ours, per SPEC.md §0.
 *
 * Two tabs, split on a real distinction rather than for balance: **Canvas** is
 * a property of the document and goes in the undo history; **Editor** is a
 * property of the view and never touches the document.
 */

import { useEffect, useRef, useState } from 'react'
import { useDocStore, useEditorStore, type GridMode, type Symmetry } from '@/lib/store/editor'
import { Segmented, Switch } from './Segmented'
import { applyTheme, useThemeMode, type ThemeMode } from '@/lib/editor/theme'
import { chromeFor, useTier } from '@/lib/editor/breakpoint'
import type { Doc } from '@/lib/artwork-core/schema'
import { resizeDoc } from '@/lib/artwork-core/resize'
import { refitViewport } from '@/lib/editor/refit'
import {
  SIZE_PRESETS, lossWarning, parseDim, pendingSize, presetAllowed, presetFor, sizeLabel,
} from '@/lib/editor/canvas-size'

type Tab = 'canvas' | 'editor'

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>{title}</span>
      {children}
      {hint && (
        <p style={{ margin: 0, font: 'var(--t-label-sm)', color: 'var(--faint)', lineHeight: 1.4 }}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('editor')
  const ref = useRef<HTMLDivElement>(null)
  const tier = useTier()
  const phone = tier === 'mobile'

  const gridMode = useEditorStore((s) => s.gridMode)
  const setGridMode = useEditorStore((s) => s.setGridMode)
  const transparencyGrid = useEditorStore((s) => s.transparencyGrid)
  const setTransparencyGrid = useEditorStore((s) => s.setTransparencyGrid)
  const symmetry = useEditorStore((s) => s.symmetry)
  const setSymmetry = useEditorStore((s) => s.setSymmetry)
  const [theme, setTheme] = useThemeMode()
  const doc = useDocStore((s) => s.doc)

  // mousedown, not click — HANDOFF §5. The click that opened this is still
  // propagating when the effect registers.
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

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Settings"
      style={{
        /**
         * Anchored under the Settings button, EXCEPT on a phone, where that
         * button sits ~140px in and a 256px panel then runs 66px off a 390px
         * screen. Measured, per spec 16 §5, which said to decide this by
         * measuring: it does not fit where it is, so on a phone it spans the
         * screen with an 8px inset instead of being withheld — the theme switch
         * lives in here and a phone is exactly where it is wanted.
         *
         * `fixed` resolves against the header, which has a backdrop-filter and
         * is therefore a containing block; the header spans the viewport and
         * starts at its top, so the two work out to the same rectangle either
         * way. The offset is stated in terms of headerHeight rather than as a
         * number so it cannot drift from the header it hangs off.
         */
        position: phone ? 'fixed' : 'absolute',
        top: phone ? chromeFor(tier).headerHeight + 6 : 'calc(100% + 6px)',
        left: phone ? 8 : 0,
        right: phone ? 8 : undefined,
        zIndex: 60,
        width: phone ? 'auto' : 256,
        maxHeight: phone ? 'calc(100dvh - 64px)' : undefined,
        overflowY: phone ? 'auto' : undefined,
        padding: 12, display: 'grid', gap: 12, alignContent: 'start',
        background: 'var(--panel)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ font: 'var(--t-label-lg)' }}>Settings</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          aria-label="Close settings"
          style={{ width: 24, height: 24, color: 'var(--muted)', font: 'var(--t-label)' }}
        >
          ✕
        </button>
      </div>

      <Segmented
        label="Settings section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'canvas', label: 'Canvas' },
          { value: 'editor', label: 'Editor' },
        ]}
      />

      {tab === 'editor' && (
        <>
          <Section title="Theme">
            <Segmented<ThemeMode>
              label="Theme"
              value={theme}
              onChange={(v) => { setTheme(v); applyTheme(v) }}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'auto', label: 'Auto' },
              ]}
            />
          </Section>

          <Section
            title="Pixel grid"
            hint="Auto hides the grid when you are zoomed too far out for it to help."
          >
            <Segmented<GridMode>
              label="Pixel grid"
              value={gridMode}
              onChange={setGridMode}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </Section>

          <Switch
            label="Transparency grid"
            checked={transparencyGrid}
            onChange={setTransparencyGrid}
          />

          <Section
            title="Symmetry"
            hint="Mirrors each stroke as you draw. Both mirrors into all four quadrants."
          >
            <Segmented<Symmetry>
              label="Symmetry"
              value={symmetry}
              onChange={setSymmetry}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'h', label: 'H', aria: 'Mirror horizontally' },
                { value: 'v', label: 'V', aria: 'Mirror vertically' },
                { value: 'both', label: 'Both', aria: 'Mirror both ways' },
              ]}
            />
          </Section>
        </>
      )}

      {tab === 'canvas' && doc && (
        // Remounted when the DOCUMENT's size changes, which resets the fields to
        // it. Undo is why: without this, undoing a resize leaves the panel
        // offering 32×32 over a 16×16 document, and a control that disagrees
        // with the document is a second source of truth for its size (rule 3).
        <CanvasTab key={sizeLabel(doc.w, doc.h)} doc={doc} />
      )}

      <div style={{ height: 1, background: 'var(--line)' }} />
      <p style={{ margin: 0, font: 'var(--t-label-sm)', color: 'var(--faint)', lineHeight: 1.4 }}>
        Tessera — pixel art that is really just a document. Everything you draw stays on this
        device unless you share it.
      </p>
    </div>
  )
}

/**
 * One number field: a label inside the box, the value right-aligned in mono.
 *
 * Text, not `type="number"`. A number input hands the browser a spinner we would
 * have to hide, silently blanks its own value on input it dislikes — so a typo
 * becomes an empty field with no way to say why — and rounds differently across
 * engines. `parseDim` already decides what a dimension is, and it is tested;
 * this field's only job is to carry the characters to it. inputMode gets the
 * numeric keypad on touch, which is the part of `type="number"` worth having.
 */
function SizeField({
  name, label, value, onChange, inputRef, invalid,
}: {
  name: string
  label: string
  value: string
  onChange: (v: string) => void
  inputRef?: React.Ref<HTMLInputElement>
  invalid: boolean
}) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 10px',
        borderRadius: 'var(--r-lg)', background: 'var(--panel2)',
        boxShadow: invalid ? '0 0 0 1px var(--diff-remove)' : undefined,
      }}
    >
      <span aria-hidden style={{ font: 'var(--t-label-sm)', color: 'var(--faint)' }}>{label}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        aria-label={name}
        aria-invalid={invalid || undefined}
        style={{
          flex: 1, minWidth: 0, width: '100%', textAlign: 'right',
          font: 'var(--t-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--fg)',
        }}
      />
    </label>
  )
}

/**
 * The Canvas tab. See docs/specs/16-settings.md §4.
 *
 * Everything that decides anything is in lib/editor/canvas-size.ts, where it can
 * be tested without a browser; what is left here is the markup and one call to
 * commit(). The two behaviours worth stating out loud, both from §4.1:
 *
 *   1. The apply button is labelled with the size it will produce rather than
 *      the word "Apply", so it answers "what will I get" before "do it" — and
 *      its disabled state then needs no explanation, because the size it shows
 *      is the size you already have.
 *   2. The presets and the fields are ONE control. A preset writes the fields;
 *      the highlighted preset is derived back from them, so typing 64 and 64
 *      lights up `64` and there is no second piece of state to disagree.
 */
function CanvasTab({ doc }: { doc: Doc }) {
  const commit = useDocStore((s) => s.commit)
  const [w, setW] = useState(String(doc.w))
  const [h, setH] = useState(String(doc.h))
  const [failed, setFailed] = useState<string | null>(null)
  const wRef = useRef<HTMLInputElement>(null)

  const pending = pendingSize(doc, w, h)
  // Per field, so the box that is actually wrong is the one outlined. A blank
  // field is not wrong — it is what backspacing over a value looks like.
  const bad = (t: string) => { const r = parseDim(t); return !r.ok && r.reason === 'range' }
  const selected = pending.kind === 'invalid' ? 'custom' : presetFor(pending.w, pending.h)
  const lost = pending.kind === 'ready' ? pending.lost : 0
  // Invalid shows the size you have, because that is what pressing it would
  // leave you with. It is disabled and the note below says why.
  const target = pending.kind === 'invalid' ? sizeLabel(doc.w, doc.h) : sizeLabel(pending.w, pending.h)

  const set = (nw: string, nh: string) => { setW(nw); setH(nh); setFailed(null) }

  const apply = () => {
    if (pending.kind !== 'ready') return
    const after = resizeDoc(doc, pending.w, pending.h)
    // Spec §4.3: validate before committing. A document whose frames disagree
    // with its own w×h is not a degraded state, it is a corrupt one, and the
    // resize is the one operation that rebuilds every layer of every frame at
    // once. This should never fire — it is here so that if it ever does, the
    // artwork survives and says so, rather than being replaced by a document
    // that cannot be serialised (rule 7).
    const cells = after.w * after.h
    if (after.frames.some((f) => f.layers.some((l) => l.px.length !== cells))) {
      setFailed('Something went wrong building that size, so nothing was changed.')
      return
    }
    setFailed(null)
    commit({ type: 'resize', label: `Resize to ${sizeLabel(pending.w, pending.h)}`, before: doc, after })
    // The view was fitted to the old size. Without this, growing 16×16 to
    // 256×256 leaves the artwork off the corner of the screen at the old scale,
    // which reads as the resize having destroyed it.
    refitViewport(after)
  }

  // `|| null`, because an invalid pending size does not always have something to
  // say: a blank field is mid-keystroke, not a mistake. Without it the empty
  // string is still a note, and backspacing over the width turned the helper
  // line into a blank red paragraph — found by the probe, not by looking.
  const note =
    failed ??
    (pending.kind === 'invalid' ? pending.message || null : lossWarning(lost, pending.w, pending.h))
  const noteIsProblem = note !== null

  return (
    <Section title="Size">
      <div
        role="group"
        aria-label="Size presets"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
      >
        {SIZE_PRESETS.map((p) => {
          const on = selected === p.id
          const allowed = presetAllowed(p)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              disabled={!allowed}
              onClick={() => set(String(p.w), String(p.h))}
              style={{
                height: 36, borderRadius: 'var(--r-lg)', font: 'var(--t-label)',
                background: on ? 'var(--solid)' : 'var(--panel2)',
                color: allowed ? (on ? 'var(--onsolid)' : 'var(--fg)') : 'var(--disabled)',
              }}
            >
              {p.label}
            </button>
          )
        })}
        {/*
          Custom is a state, not a size — it lights up when the numbers match no
          preset. Pressing it cannot set a size, so it does the thing the user
          who pressed it meant: puts the cursor in the width field, selected.
        */}
        <button
          type="button"
          aria-pressed={selected === 'custom'}
          onClick={() => wRef.current?.select()}
          style={{
            height: 36, borderRadius: 'var(--r-lg)', font: 'var(--t-label)',
            background: selected === 'custom' ? 'var(--solid)' : 'var(--panel2)',
            color: selected === 'custom' ? 'var(--onsolid)' : 'var(--fg)',
          }}
        >
          Custom
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
        <SizeField
          name="Width"
          label="W"
          value={w}
          onChange={(v) => set(v, h)}
          inputRef={wRef}
          invalid={bad(w)}
        />
        <span aria-hidden style={{ font: 'var(--t-label-sm)', color: 'var(--faint)' }}>×</span>
        <SizeField
          name="Height"
          label="H"
          value={h}
          onChange={(v) => set(w, v)}
          invalid={bad(h)}
        />
      </div>

      <button
        // An id, not an aria-label: the label IS the size, and overriding a
        // button's visible name is the trap in HANDOFF §5. The probe needs to
        // read that label, so it needs a handle that is not the label.
        id="canvas-size-apply"
        type="button"
        onClick={apply}
        disabled={pending.kind !== 'ready'}
        aria-describedby={noteIsProblem ? 'canvas-size-note' : undefined}
        style={{
          height: 36, width: '100%', borderRadius: 'var(--r-lg)',
          font: 'var(--t-mono)', fontVariantNumeric: 'tabular-nums',
          background: pending.kind === 'ready' ? 'var(--solid)' : 'var(--panel2)',
          color: pending.kind === 'ready' ? 'var(--onsolid)' : 'var(--disabled)',
        }}
      >
        {target}
      </button>

      <p
        id="canvas-size-note"
        aria-live="polite"
        style={{
          margin: 0, font: 'var(--t-label-sm)', lineHeight: 1.4,
          color: noteIsProblem ? 'var(--diff-remove)' : 'var(--faint)',
        }}
      >
        {note ?? 'Keeps the art centred — growing pads, shrinking crops. Undo restores what was cropped.'}
      </p>
    </Section>
  )
}
