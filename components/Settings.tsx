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
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60,
        width: 256, padding: 12, display: 'grid', gap: 12,
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

      {tab === 'canvas' && (
        <Section title="Size">
          <p style={{ margin: 0, font: 'var(--t-copy-sm)', color: 'var(--muted)' }}>
            This canvas is{' '}
            <span className="tabular">
              {doc ? `${doc.w}×${doc.h}` : '—'}
            </span>
            .
          </p>
          <p style={{ margin: 0, font: 'var(--t-label-sm)', color: 'var(--faint)', lineHeight: 1.4 }}>
            Resizing is not built yet. It changes the document rather than the view, so it needs
            to be undoable — see docs/specs/16-settings.md §4.
          </p>
        </Section>
      )}

      <div style={{ height: 1, background: 'var(--line)' }} />
      <p style={{ margin: 0, font: 'var(--t-label-sm)', color: 'var(--faint)', lineHeight: 1.4 }}>
        Tessera — pixel art that is really just a document. Everything you draw stays on this
        device unless you share it.
      </p>
    </div>
  )
}
