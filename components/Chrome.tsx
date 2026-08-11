'use client'

/**
 * Top bar, tool rail, palette and zoom readout.
 * Geometry from docs/specs/02-design-system.md §6 — measured, not invented.
 */

import { useEffect, useState } from 'react'
import { useDocStore, useEditorStore, type Tool } from '@/lib/store/editor'
import { nextScale, fitViewport } from '@/lib/editor/viewport'
import {
  BrushIcon, EraserIcon, FillIcon, EyedropperIcon, RectIcon,
  UndoIcon, RedoIcon, GridIcon, PlusIcon, MinusIcon, SunIcon, MoonIcon,
  CodeIcon, SparkIcon,
} from './icons'

const TOOLS: Array<{ id: Tool; label: string; key: string; Icon: typeof BrushIcon }> = [
  { id: 'brush', label: 'Brush', key: 'B', Icon: BrushIcon },
  { id: 'eraser', label: 'Eraser', key: 'E', Icon: EraserIcon },
  { id: 'fill', label: 'Fill', key: 'F', Icon: FillIcon },
  { id: 'rect', label: 'Rectangle', key: 'R', Icon: RectIcon },
  { id: 'eyedropper', label: 'Eyedropper', key: 'I', Icon: EyedropperIcon },
]

// ─────────────────────────────────────────────────────────────────────────────

function IconButton({
  label, active, onClick, children, size = 36,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  size?: number
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: size, height: size,
        display: 'grid', placeItems: 'center',
        borderRadius: size >= 44 ? 'var(--r-lg)' : 'var(--r-pill)',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--accent-fg)' : 'var(--fg-muted)',
        transition: 'background 90ms ease-out, color 90ms ease-out',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--hover)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function TopBar() {
  const doc = useDocStore((s) => s.doc)
  const past = useDocStore((s) => s.past)
  const future = useDocStore((s) => s.future)
  const status = useDocStore((s) => s.saveStatus)
  const undo = useDocStore((s) => s.undo)
  const redo = useDocStore((s) => s.redo)
  const showGrid = useEditorStore((s) => s.showGrid)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const [dark, setDark] = useState<boolean | null>(null)

  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme')
    setDark(attr ? attr === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches)
  }, [])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
  }

  const statusLabel =
    status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed' : status === 'saved' ? 'Saved' : ''

  return (
    <header
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 48,
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px',
        background: 'var(--surface)', borderBottom: '1px solid var(--line)',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8 }}>
        <div
          aria-hidden
          style={{
            width: 20, height: 20, borderRadius: 4,
            background: 'var(--accent)',
            boxShadow: 'inset 0 0 0 3px var(--surface), inset 0 0 0 6px var(--accent)',
          }}
        />
        <span style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>Tessera</span>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

      <IconButton label="Undo (Ctrl+Z)" onClick={undo}>
        <span style={{ opacity: past.length ? 1 : 0.35 }}><UndoIcon /></span>
      </IconButton>
      <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo}>
        <span style={{ opacity: future.length ? 1 : 0.35 }}><RedoIcon /></span>
      </IconButton>
      <IconButton label="Toggle grid" active={showGrid} onClick={toggleGrid}>
        <GridIcon />
      </IconButton>

      <div style={{ flex: 1 }} />

      <span className="tabular" style={{ fontSize: 12, color: 'var(--fg-faint)', marginRight: 8 }}>
        {statusLabel}
      </span>

      <span
        style={{
          fontSize: 13, color: 'var(--fg-muted)', marginRight: 8,
          maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {doc?.name || 'untitled'}
      </span>

      <IconButton label="Code panel (coming in Phase 3)" onClick={() => {}}>
        <span style={{ opacity: 0.35 }}><CodeIcon /></span>
      </IconButton>
      <IconButton label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
        {dark ? <SunIcon /> : <MoonIcon />}
      </IconButton>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function ToolRail() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)

  return (
    <div
      role="toolbar"
      aria-label="Tools"
      aria-orientation="vertical"
      style={{
        position: 'absolute', left: 16, top: 64,
        display: 'flex', flexDirection: 'column', gap: 4, padding: 2,
        background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-1)',
        zIndex: 5,
      }}
    >
      {TOOLS.map(({ id, label, key, Icon }) => (
        <IconButton
          key={id}
          size={44}
          label={`${label} (${key})`}
          active={tool === id}
          onClick={() => setTool(id)}
        >
          <Icon />
        </IconButton>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function Palette() {
  const doc = useDocStore((s) => s.doc)
  const colorIndex = useEditorStore((s) => s.colorIndex)
  const setColorIndex = useEditorStore((s) => s.setColorIndex)
  const brushSize = useEditorStore((s) => s.brushSize)
  const setBrushSize = useEditorStore((s) => s.setBrushSize)
  const shape = useEditorStore((s) => s.brushShape)
  const setShape = useEditorStore((s) => s.setBrushShape)
  if (!doc) return null

  return (
    <div
      style={{
        position: 'absolute', left: 76, top: 64,
        display: 'flex', flexDirection: 'column', gap: 10, padding: 10,
        background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-1)',
        zIndex: 5, width: 172,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} role="listbox" aria-label="Palette">
        {doc.palette.map((entry, i) => {
          const selected = i === colorIndex
          return (
            <button
              key={i}
              role="option"
              aria-selected={selected}
              aria-label={entry.n ?? entry.c}
              title={`${i}: ${entry.n ?? entry.c}`}
              onClick={() => setColorIndex(i)}
              style={{
                width: 24, height: 24, borderRadius: 'var(--r-sm)',
                background:
                  entry.c === 'transparent'
                    ? 'repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%) 0 0/10px 10px'
                    : entry.c,
                boxShadow: selected
                  ? '0 0 0 2px var(--accent), 0 0 0 3px var(--surface)'
                  : 'inset 0 0 0 1px var(--line)',
              }}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton label="Smaller brush" size={24} onClick={() => setBrushSize(brushSize - 1)}>
          <MinusIcon />
        </IconButton>
        <span className="tabular" style={{ fontSize: 12, minWidth: 26, textAlign: 'center' }}>
          {brushSize}px
        </span>
        <IconButton label="Larger brush" size={24} onClick={() => setBrushSize(brushSize + 1)}>
          <PlusIcon />
        </IconButton>

        <div style={{ flex: 1 }} />

        <div
          role="radiogroup"
          aria-label="Brush shape"
          style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 'var(--r-pill)', padding: 2 }}
        >
          {(['square', 'round'] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={shape === s}
              aria-label={s}
              onClick={() => setShape(s)}
              style={{
                width: 22, height: 20, display: 'grid', placeItems: 'center',
                borderRadius: 'var(--r-pill)',
                background: shape === s ? 'var(--surface)' : 'transparent',
                boxShadow: shape === s ? 'var(--shadow-1)' : 'none',
              }}
            >
              <span
                style={{
                  width: 9, height: 9,
                  background: 'var(--fg-muted)',
                  borderRadius: s === 'round' ? '50%' : 1,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function ZoomBar() {
  const doc = useDocStore((s) => s.doc)
  const vp = useEditorStore((s) => s.viewport)
  const setViewport = useEditorStore((s) => s.setViewport)

  const fit = () => {
    if (!doc) return
    const el = document.querySelector('canvas')
    if (!el) return
    const r = el.getBoundingClientRect()
    setViewport(fitViewport(doc, r.width, r.height))
  }

  return (
    <div
      style={{
        position: 'absolute', right: 16, bottom: 16,
        display: 'flex', alignItems: 'center', gap: 2, padding: 4,
        background: 'var(--surface)', borderRadius: 'var(--r-pill)', boxShadow: 'var(--shadow-1)',
        zIndex: 5,
      }}
    >
      <span
        className="tabular"
        style={{ fontSize: 12, color: 'var(--fg-faint)', padding: '0 8px' }}
        title="Canvas size"
      >
        {doc ? `${doc.w}×${doc.h}` : '—'}
      </span>
      <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
      <IconButton label="Zoom out" size={32} onClick={() => setViewport({ ...vp, scale: nextScale(vp.scale, -1) })}>
        <MinusIcon />
      </IconButton>
      <button
        onClick={fit}
        title="Fit to view (1)"
        aria-label="Fit to view"
        className="tabular"
        style={{ fontSize: 12, minWidth: 44, textAlign: 'center', color: 'var(--fg)' }}
      >
        {vp.scale}×
      </button>
      <IconButton label="Zoom in" size={32} onClick={() => setViewport({ ...vp, scale: nextScale(vp.scale, 1) })}>
        <PlusIcon />
      </IconButton>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

