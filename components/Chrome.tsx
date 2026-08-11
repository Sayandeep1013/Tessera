'use client'

/**
 * Chrome — top bar, tool rail, zoom control.
 *
 * Geometry is transcribed from docs/research/newt/VISUAL-SPEC.md §6, which was
 * measured off the live reference. Numbers in comments are the measured values;
 * do not "tidy" them.
 */

import { useEffect, useRef, useState } from 'react'
import { useDocStore, useEditorStore, type Tool } from '@/lib/store/editor'
import { fitViewport, nextScale } from '@/lib/editor/viewport'
import {
  ArrowUturnLeft, ArrowUturnRight, CaretDown, CaretDownSmall, Code, Cursor,
  DotsThree, Eraser, Export, Eyedropper, FilmStrip, Gradient, Minus, PaintBrush,
  PaintBucket, PixelPerfect, Plus, Selection, Sliders, Square, Stack,
} from './icons'

type IconCmp = typeof PaintBrush

const TOOLS: Array<{ id: Tool; title: string; Icon: IconCmp; enabled: boolean }> = [
  { id: 'select', title: 'Select / Move (V)', Icon: Cursor, enabled: false },
  { id: 'brush', title: 'Brush (B)', Icon: PaintBrush, enabled: true },
  { id: 'eraser', title: 'Eraser (E)', Icon: Eraser, enabled: true },
  { id: 'fill', title: 'Fill (G)', Icon: PaintBucket, enabled: true },
  { id: 'rect', title: 'Shapes (U)', Icon: Square, enabled: true },
  { id: 'marquee', title: 'Select region (M)', Icon: Selection, enabled: false },
  { id: 'eyedropper', title: 'Eyedropper (I)', Icon: Eyedropper, enabled: true },
  { id: 'gradient', title: 'Gradient (H)', Icon: Gradient, enabled: false },
]

// ─── primitives ──────────────────────────────────────────────────────────────

/**
 * Icon button.
 *
 * Measured hover behaviour (§7): inactive buttons take a `--hover` wash; buttons
 * sitting on a `--panel2` track lift to solid `--panel` instead (`lift`); muted
 * buttons also shift text colour to `--fg`; the ACTIVE state has no hover rule at
 * all — hovering it produces zero change.
 */
function GlyphBtn({
  title, Icon, size = 36, icon = 20, active, muted = true, lift, onClick, disabled,
}: {
  title: string
  Icon: IconCmp
  size?: number
  icon?: number
  active?: boolean
  muted?: boolean
  lift?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState(false)
  const hot = hover && !disabled && !active

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size >= 44 ? 'var(--r-lg)' : 'var(--r-pill)',
        background: active
          ? 'var(--accent)'
          : hot
            ? lift ? 'var(--panel)' : 'var(--hover)'
            : 'transparent',
        color: active
          ? 'var(--onaccent)'
          : disabled
            ? 'var(--faint)'
            : muted
              ? hot ? 'var(--fg)' : 'var(--muted)'
              : 'var(--fg)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={icon} />
    </button>
  )
}

// ─── top bar ─────────────────────────────────────────────────────────────────

export function TopBar() {
  const doc = useDocStore((s) => s.doc)
  const past = useDocStore((s) => s.past)
  const future = useDocStore((s) => s.future)
  const undo = useDocStore((s) => s.undo)
  const redo = useDocStore((s) => s.redo)
  const status = useDocStore((s) => s.saveStatus)

  const colorIndex = useEditorStore((s) => s.colorIndex)
  const brushSize = useEditorStore((s) => s.brushSize)
  const setBrushSize = useEditorStore((s) => s.setBrushSize)
  const shape = useEditorStore((s) => s.brushShape)
  const setShape = useEditorStore((s) => s.setBrushShape)
  const showGrid = useEditorStore((s) => s.showGrid)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dark, setDark] = useState(false)

  useEffect(() => setDark(document.documentElement.classList.contains('dark')), [])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.classList.toggle('light', !next)
    try {
      localStorage.setItem('tessera-theme', next ? 'dark' : 'light')
    } catch {
      /* private mode */
    }
  }

  // token-exempt: an artwork colour is document data, not a design token
  const swatch = doc?.palette[colorIndex]?.c ?? '#000000'

  return (
    <header
      style={{
        position: 'relative', flex: 'none', height: 48, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
        background: 'color-mix(in srgb, var(--panel) 80%, transparent)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {/* File / logo — 101x32 @ (12,8), r8 */}
      <button
        title="File — new, recent, import"
        style={{
          height: 32, display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 6px 4px 4px', borderRadius: 'var(--r-md)', color: 'var(--fg)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Logo />
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.4px', lineHeight: '24px' }}>
          Tessera
        </span>
        <span style={{ color: 'var(--faint)' }}><CaretDown size={16} /></span>
      </button>

      <GlyphBtn title="Settings" Icon={Sliders} icon={20} onClick={toggleTheme} />

      {/* Colour — 36x36 with a 24x24 swatch */}
      <div style={{ position: 'relative', marginLeft: 2 }}>
        <button
          title="Colour"
          aria-label="Colour"
          onClick={() => setPaletteOpen((v) => !v)}
          style={{
            width: 36, height: 36, display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-pill)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span
            style={{
              width: 24, height: 24, borderRadius: 'var(--r-pill)',
              background: swatch === 'transparent'
                ? 'repeating-conic-gradient(var(--panel2) 0 25%, var(--panel) 0 50%) 0 0/8px 8px'
                : swatch,
              boxShadow: 'inset 0 0 0 1px var(--line)',
            }}
          />
        </button>
        {paletteOpen && <PalettePopover onClose={() => setPaletteOpen(false)} />}
      </div>

      {/* Brush options group @ x203, gap 8 */}
      <div style={{ marginLeft: 4, display: 'flex', gap: 8 }}>
        {/* brush-size pill 149x36 */}
        <div
          style={{
            height: 36, display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', borderRadius: 'var(--r-pill)', background: 'var(--panel2)',
          }}
        >
          <GlyphBtn title="Smaller brush" Icon={Minus} size={28} icon={16} muted={false} lift
            onClick={() => setBrushSize(brushSize - 1)} />
          <span className="tabular" style={{ width: 32, textAlign: 'center', fontSize: 14, fontWeight: 500 }}>
            {brushSize}px
          </span>
          <GlyphBtn title="Bigger brush" Icon={Plus} size={28} icon={16} muted={false} lift
            onClick={() => setBrushSize(brushSize + 1)} />
          <span style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 2px' }} />
          <GlyphBtn
            title="Show grid"
            Icon={PixelPerfect}
            size={28}
            icon={16}
            muted={false}
            active={false}
            onClick={toggleGrid}
          />
          {showGrid && null}
        </div>

        {/* Square | Round — 120x28 track */}
        <div
          role="radiogroup"
          aria-label="Brush shape"
          style={{
            height: 28, alignSelf: 'center', display: 'flex', padding: 2,
            borderRadius: 'var(--r-pill)', background: 'var(--panel2)',
          }}
        >
          {(['square', 'round'] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={shape === s}
              onClick={() => setShape(s)}
              style={{
                height: 24, padding: '4px 10px', borderRadius: 'var(--r-pill)',
                fontSize: 12, fontWeight: 500, lineHeight: '16px',
                background: shape === s ? 'var(--panel)' : 'transparent',
                boxShadow: shape === s ? 'var(--shadow-sm)' : 'none',
                color: shape === s ? 'var(--fg)' : 'var(--muted)',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Dither: Solid — 87x28 */}
        <button
          title="Dither: Solid"
          style={{
            height: 28, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px 6px 10px', borderRadius: 'var(--r-pill)', background: 'var(--panel2)',
            fontSize: 12, fontWeight: 500, color: 'var(--fg)',
          }}
        >
          <span style={{ width: 16, height: 16, borderRadius: 'var(--r-sm)', background: 'var(--fg)', boxShadow: '0 0 0 1px var(--line)' }} />
          <span style={{ lineHeight: '16px' }}>Solid</span>
          <span style={{ color: 'var(--muted)' }}><CaretDownSmall size={12} /></span>
        </button>
      </div>

      {/* Centred filename — absolutely positioned, 192x28 */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, display: 'flex', justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <input
          defaultValue={doc?.name || 'untitled'}
          spellCheck={false}
          aria-label="Artwork name"
          style={{
            width: 192, height: 28, padding: '4px 8px', borderRadius: 'var(--r-md)',
            fontSize: 14, fontWeight: 500, textAlign: 'center', color: 'var(--fg)',
            pointerEvents: 'auto',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        />
      </div>

      {/* Right group */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className="tabular" style={{ fontSize: 12, color: 'var(--faint)', marginRight: 4 }}>
          {status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed' : status === 'saved' ? 'Saved' : ''}
        </span>

        <GlyphBtn title="Undo (Ctrl+Z)" Icon={ArrowUturnLeft} onClick={undo} disabled={!past.length} />
        <GlyphBtn title="Redo (Ctrl+Shift+Z)" Icon={ArrowUturnRight} onClick={redo} disabled={!future.length} />

        <button
          title="Share — export, publish"
          disabled
          style={{
            height: 36, display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px 0 12px', borderRadius: 'var(--r-pill)',
            fontSize: 14, fontWeight: 500, color: 'var(--faint)',
          }}
        >
          <Export size={20} />
          <span>Share</span>
        </button>

        <GlyphBtn title="Code & Export" Icon={Code} disabled />
        <GlyphBtn title="Animation timeline" Icon={FilmStrip} disabled />
        <GlyphBtn title="Layers" Icon={Stack} disabled />
      </div>
    </header>
  )
}

/** Our own 16x16 pixel-art mark, drawn in our own format. Not theirs. */
function Logo() {
  // A tessera: four tiles, one lifted.
  const cells: Array<[number, number, number, number]> = [
    [1, 1, 6, 6], [9, 1, 6, 6], [1, 9, 6, 6], [9, 9, 6, 6],
  ]
  return (
    <span style={{ width: 24, height: 24, display: 'grid', placeItems: 'center' }}>
      <svg width="24" height="24" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
        {cells.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" opacity={i === 0 ? 1 : 0.45} />
        ))}
      </svg>
    </span>
  )
}

// ─── tool rail ───────────────────────────────────────────────────────────────

export function ToolRail() {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)

  return (
    <div
      style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', zIndex: 10,
      }}
    >
      <div
        role="toolbar"
        aria-label="Tools"
        aria-orientation="vertical"
        style={{
          display: 'flex', flexDirection: 'column', gap: 4, padding: 6,
          borderRadius: 'var(--r-xl)',
          background: 'color-mix(in srgb, var(--panel) 90%, transparent)',
          backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-card)',
          pointerEvents: 'auto',
        }}
      >
        {TOOLS.map(({ id, title, Icon, enabled }) => (
          <GlyphBtn
            key={id}
            title={enabled ? title : `${title} — not built yet`}
            Icon={Icon}
            size={44}
            icon={24}
            active={tool === id}
            disabled={!enabled}
            onClick={() => enabled && setTool(id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── zoom control ────────────────────────────────────────────────────────────

export function ZoomBar() {
  const doc = useDocStore((s) => s.doc)
  const vp = useEditorStore((s) => s.viewport)
  const setViewport = useEditorStore((s) => s.setViewport)

  const fit = () => {
    const el = document.querySelector('canvas')
    if (!el || !doc) return
    const r = el.getBoundingClientRect()
    setViewport(fitViewport(doc, r.width, r.height))
  }

  return (
    <div style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 20, pointerEvents: 'none' }}>
      <div
        style={{
          height: 40, display: 'flex', alignItems: 'center', gap: 2, padding: 4,
          borderRadius: 'var(--r-pill)',
          background: 'color-mix(in srgb, var(--panel) 90%, transparent)',
          backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-card)',
          color: 'var(--muted)',
          pointerEvents: 'auto',
        }}
      >
        <GlyphBtn title="Zoom out" Icon={Minus} size={32} icon={16}
          onClick={() => setViewport({ ...vp, scale: nextScale(vp.scale, -1) })} />
        <button
          title="Fit to screen (1)"
          aria-label="Fit to screen"
          className="tabular"
          onClick={fit}
          style={{
            minWidth: 48, height: 16, padding: '0 8px', borderRadius: 'var(--r-pill)',
            fontSize: 12, fontWeight: 500, lineHeight: '16px', color: 'var(--muted)',
          }}
        >
          {vp.scale}×
        </button>
        <GlyphBtn title="Zoom in" Icon={Plus} size={32} icon={16}
          onClick={() => setViewport({ ...vp, scale: nextScale(vp.scale, 1) })} />
      </div>
    </div>
  )
}

// ─── palette popover ─────────────────────────────────────────────────────────

function PalettePopover({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc)
  const colorIndex = useEditorStore((s) => s.colorIndex)
  const setColorIndex = useEditorStore((s) => s.setColorIndex)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  if (!doc) return null

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Palette"
      style={{
        position: 'absolute', left: -6, top: '100%', marginTop: 6, zIndex: 50,
        padding: 8, width: 196,
        borderRadius: 'var(--r-lg)', background: 'var(--panel)', boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
        {doc.palette.map((entry, i) => (
          <button
            key={i}
            title={`${i}: ${entry.n ?? entry.c}`}
            aria-label={entry.n ?? entry.c}
            aria-pressed={i === colorIndex}
            onClick={() => {
              setColorIndex(i)
              onClose()
            }}
            style={{
              width: 26, height: 26, borderRadius: 'var(--r-sm)',
              background: entry.c === 'transparent'
                ? 'repeating-conic-gradient(var(--panel2) 0 25%, var(--panel) 0 50%) 0 0/8px 8px'
                : entry.c,
              boxShadow: i === colorIndex
                ? '0 0 0 2px var(--accent), 0 0 0 3px var(--panel)'
                : 'inset 0 0 0 1px var(--line)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

export { DotsThree }
