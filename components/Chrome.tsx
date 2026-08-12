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
import { fitViewport, stepScale } from '@/lib/editor/viewport'
import { chromeFor, useTier } from '@/lib/editor/breakpoint'
import { listStarters, loadLogo, loadStarter, type StarterName } from '@/lib/artwork-core/create'
import { runUi } from '@/lib/store/ctx'
import { DITHER_MODES, ditherPasses, type DitherMode } from '@/lib/editor/dither'
import { spriteRects } from '@/lib/renderer/sprite-svg'
import { parseDoc, serializeDoc } from '@/lib/artwork-core/codec'
import {
  ArrowUturnLeft, ArrowUturnRight, CaretDown, CaretDownSmall, Code, Cursor,
  DotsThree, Eraser, Export, Eyedropper, FilmStrip, Gradient, Minus, PaintBrush,
  PaintBucket, PixelPerfect, Plus, Selection, Sliders, Square, Stack,
} from './icons'
import { Tooltip, type Placement } from './Tooltip'

type IconCmp = typeof PaintBrush

/**
 * The shortcut is a separate field rather than "(B)" inside the title: the
 * tooltip renders it in mono, right-aligned, so a key reads as a key. The
 * accessible name keeps the parenthetical form, because a screen reader has no
 * typography to lean on.
 */
const TOOLS: Array<{ id: Tool; title: string; key: string; Icon: IconCmp; enabled: boolean }> = [
  { id: 'select', title: 'Select / Move', key: 'V', Icon: Cursor, enabled: true },
  { id: 'brush', title: 'Brush', key: 'B', Icon: PaintBrush, enabled: true },
  { id: 'eraser', title: 'Eraser', key: 'E', Icon: Eraser, enabled: true },
  { id: 'fill', title: 'Fill', key: 'G', Icon: PaintBucket, enabled: true },
  { id: 'rect', title: 'Shapes', key: 'U', Icon: Square, enabled: true },
  { id: 'marquee', title: 'Select region', key: 'M', Icon: Selection, enabled: true },
  { id: 'eyedropper', title: 'Eyedropper', key: 'I', Icon: Eyedropper, enabled: true },
  { id: 'gradient', title: 'Gradient', key: 'H', Icon: Gradient, enabled: true },
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
  title, tip, shortcut, place = 'bottom',
  Icon, size = 40, icon = 22, pad = 0, active, muted = true, lift, onClick, disabled,
}: {
  /** The accessible name. Always set, and never replaced by the tooltip. */
  title: string
  /** Tooltip text, when it should differ from the accessible name — a tool's
   *  name without the "(B)" it carries for screen readers. Defaults to title. */
  tip?: string
  shortcut?: string
  place?: Placement
  Icon: IconCmp
  size?: number
  icon?: number
  /** Shrinks the painted fill without shrinking the hit target. */
  pad?: number
  active?: boolean
  muted?: boolean
  lift?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState(false)
  const hot = hover && !disabled && !active

  return (
    <Tooltip label={tip ?? title} shortcut={shortcut} placement={place}>
    <button
      type="button"
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
        // The hit target is the whole box; the fill stops short of it, so buttons
        // can sit flush with no gap between them and still look separated.
        padding: pad,
        backgroundClip: 'content-box',
        borderRadius: size >= 44 ? 'var(--r-lg)' : 'var(--r-pill)',
        background: active
          ? 'var(--accent)'
          : hot
            ? lift ? 'var(--panel)' : 'var(--hover)'
            : 'transparent',
        color: active
          ? 'var(--onaccent)'
          : disabled
            ? 'var(--disabled)'
            : muted
              ? hot ? 'var(--fg)' : 'var(--muted)'
              : 'var(--fg)',
        // No opacity multiplier — --disabled already carries the whole signal, and
        // stacking the two dropped nine controls to 1.4–2.0:1. See globals.css.
      }}
    >
      <Icon size={icon} />
    </button>
    </Tooltip>
  )
}

// ─── top bar ─────────────────────────────────────────────────────────────────

export function TopBar() {
  const doc = useDocStore((s) => s.doc)
  const past = useDocStore((s) => s.past)
  const future = useDocStore((s) => s.future)
  const status = useDocStore((s) => s.saveStatus)

  const colorIndex = useEditorStore((s) => s.colorIndex)
  const brushSize = useEditorStore((s) => s.brushSize)
  const shape = useEditorStore((s) => s.brushShape)
  const showGrid = useEditorStore((s) => s.showGrid)
  const layersOpen = useEditorStore((s) => s.layersOpen)
  const setLayersOpen = useEditorStore((s) => s.setLayersOpen)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [fileOpen, setFileOpen] = useState(false)
  const [ditherOpen, setDitherOpen] = useState(false)
  const dither = useEditorStore((s) => s.dither)
  const [dark, setDark] = useState(false)
  const c = chromeFor(useTier())

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
        position: 'relative', flex: 'none', height: c.headerHeight, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
        // The header is the one row that must never overflow: at 768 the right
        // group used to run 165px off-screen. minWidth 0 lets the centre shrink.
        minWidth: 0,
        background: 'color-mix(in srgb, var(--panel) 80%, transparent)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {/* File / logo — 101x32 @ (12,8), r8 */}
      <div style={{ position: 'relative' }}>
        <Tooltip label="File — new, open, export" placement="bottom">
          <button
            aria-label="File — new, open, export"
            aria-haspopup="menu"
            aria-expanded={fileOpen}
            onClick={() => setFileOpen((v) => !v)}
            style={{
              height: 32, display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px 4px 4px', borderRadius: 'var(--r-md)', color: 'var(--fg)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Logo />
            <span style={{ font: 'var(--t-title)', letterSpacing: '-0.4px' }}>Tessera</span>
            <span style={{ color: 'var(--faint)' }}><CaretDown size={16} /></span>
          </button>
        </Tooltip>
        {fileOpen && <FileMenu onClose={() => setFileOpen(false)} />}
      </div>

      <GlyphBtn title="Settings" Icon={Sliders} icon={20} onClick={toggleTheme} />

      {/* Colour — 36x36 with a 24x24 swatch */}
      <div style={{ position: 'relative', marginLeft: 2 }}>
        <Tooltip label="Colour" placement="bottom">
            <button
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
        </Tooltip>
        {paletteOpen && <PalettePopover onClose={() => setPaletteOpen(false)} />}
      </div>

      {/* Brush options group @ x203, gap 8. Secondary controls are dropped
          before essential ones as the viewport narrows — see breakpoint.ts. */}
      {c.showBrushOptions && (
      <div style={{ marginLeft: 4, display: 'flex', gap: 8, minWidth: 0 }}>
        {/* brush-size pill 149x36 */}
        <div
          style={{
            height: 40, display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 6px', borderRadius: 'var(--r-pill)', background: 'var(--panel2)',
          }}
        >
          <GlyphBtn title="Smaller brush" Icon={Minus} size={32} icon={18} muted={false} lift
            onClick={() => runUi('set_brush', { size: brushSize - 1 })} />
          <span className="tabular" style={{ width: 32, textAlign: 'center' }}>{brushSize}px</span>
          <GlyphBtn title="Bigger brush" Icon={Plus} size={32} icon={18} muted={false} lift
            onClick={() => runUi('set_brush', { size: brushSize + 1 })} />
          <span style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 2px' }} />
          <GlyphBtn
            title="Show grid"
            Icon={PixelPerfect}
            size={28}
            icon={16}
            muted={false}
            active={false}
            onClick={() => runUi('toggle_grid', {})}
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
              onClick={() => runUi('set_brush', { shape: s })}
              style={{
                height: 26, padding: '4px 10px', borderRadius: 'var(--r-pill)',
                font: 'var(--t-label-sm)',
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

        {/* Dither — 87x28 */}
        {c.showDither && (
          <div style={{ position: 'relative', alignSelf: 'center' }}>
            <Tooltip label="Dither pattern" placement="bottom">
              <button
                aria-label="Dither pattern"
                aria-haspopup="menu"
                aria-expanded={ditherOpen}
                onClick={() => setDitherOpen((v) => !v)}
                style={{
                  height: 32, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px 6px 10px', borderRadius: 'var(--r-pill)',
                  background: 'var(--panel2)', font: 'var(--t-label-sm)', color: 'var(--fg)',
                }}
              >
                <DitherSwatch mode={dither} />
                <span style={{ lineHeight: '16px' }}>
                  {DITHER_MODES.find((m) => m.id === dither)?.label ?? 'Solid'}
                </span>
                <span style={{ color: 'var(--muted)' }}><CaretDownSmall size={12} /></span>
              </button>
            </Tooltip>
            {ditherOpen && (
              <DitherMenu current={dither} onClose={() => setDitherOpen(false)} />
            )}
          </div>
        )}
      </div>
      )}

      {/* Centred filename — absolutely positioned, 192x28 */}
      {c.showFilename && (
      <div
        style={{
          position: 'absolute', left: 0, right: 0, display: 'flex', justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <input
          // Uncontrolled, so it needs remounting when the DOCUMENT's name
          // changes — loading an example used to leave "untitled" on screen next
          // to a face. Typing here does not write back to the document (that is
          // still unwired), so the key is stable while the user types.
          key={doc?.name ?? ''}
          defaultValue={doc?.name || 'untitled'}
          spellCheck={false}
          aria-label="Artwork name"
          style={{
            width: 240, height: 32, padding: '4px 8px', borderRadius: 'var(--r-md)',
            font: 'var(--t-label-lg)', textAlign: 'center', color: 'var(--fg)',
            pointerEvents: 'auto',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        />
      </div>
      )}

      {/* Right group */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Fixed width: this text used to change length and shove the whole right
            group sideways on every autosave. It is words, not numerals, so it is
            not .tabular — and it is real text, so it cannot sit on --faint. */}
        {c.showSaveStatus && (
        <span
          style={{
            width: 72, textAlign: 'right', font: 'var(--t-label-sm)',
            color: 'var(--muted)', marginRight: 4,
          }}
        >
          {status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed' : status === 'saved' ? 'Saved' : ''}
        </span>
        )}

        <GlyphBtn title="Undo (Ctrl+Z)" Icon={ArrowUturnLeft} onClick={() => runUi('undo', {})} disabled={!past.length} />
        <GlyphBtn title="Redo (Ctrl+Shift+Z)" Icon={ArrowUturnRight} onClick={() => runUi('redo', {})} disabled={!future.length} />

        {c.showUnbuilt && (
        <Tooltip label="Share — not built yet" placement="bottom">
          <button
            aria-label="Share — export, publish"
            disabled
            style={{
              height: 40, display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 10px 0 12px', borderRadius: 'var(--r-pill)',
              font: 'var(--t-label-lg)', color: 'var(--disabled)',
            }}
          >
            <Export size={20} />
            <span>Share</span>
          </button>
        </Tooltip>
        )}

        {/* Not built yet. They hold newt's layout on a wide screen, but they are
            the first thing to go when space is short — a dead control must never
            cost a live one its place. */}
        {c.showUnbuilt && (
          <>
            <GlyphBtn title="Code & Export" Icon={Code} disabled />
            <GlyphBtn title="Animation timeline" Icon={FilmStrip} disabled />
          </>
        )}

        {/* Live, so it is no longer gated with the dead controls above — it
            survives down to tablet on its own terms. */}
        {c.showLayers && (
          <GlyphBtn
            title="Layers"
            Icon={Stack}
            active={layersOpen}
            onClick={() => setLayersOpen(!layersOpen)}
          />
        )}
      </div>
    </header>
  )
}

/**
 * Our own mark, drawn in our own format. Not theirs.
 *
 * The geometry is not written here — it is read from
 * lib/artwork-core/fixtures/logo.tessera.json, a real 16x16 document using the
 * editor's own default palette. Same file feeds app/icon.svg, so the tab icon
 * and the header mark cannot drift, and the logo can be opened and edited in the
 * editor like any other artwork.
 */
const LOGO_RECTS = spriteRects(loadLogo())

function Logo({ size = 24 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, display: 'grid', placeItems: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {LOGO_RECTS.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
        ))}
      </svg>
    </span>
  )
}

/**
 * File menu.
 *
 * New / Open / Export were all already implemented — download lives in the page's
 * Ctrl+S handler, parseDoc reads a file, new_document is a registry action — but
 * nothing on screen reached any of them. A control that looks like a menu and does
 * nothing is worse than no control.
 *
 * "New" goes through the registry so it inherits the destructive-action rule the
 * agent is held to: it asks first.
 */
function FileMenu({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // `mousedown`, not `click`: the click that OPENS the menu is still
    // propagating when this effect runs, so a click listener sees it, decides
    // the target is outside the menu, and closes it in the same gesture — the
    // menu never appears at all. mousedown has already fired by then. Same as
    // PalettePopover below.
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const item = (label: string, hint: string, run: () => void) => (
    <button
      key={label}
      role="menuitem"
      onClick={() => {
        run()
        onClose()
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '7px 10px', borderRadius: 'var(--r-md)', font: 'var(--t-label)',
        color: 'var(--fg)', textAlign: 'left',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ flex: 1 }}>{label}</span>
      <span className="tabular" style={{ color: 'var(--faint)' }}>{hint}</span>
    </button>
  )

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="File"
      style={{
        position: 'absolute', left: 0, top: 'calc(100% + 6px)', width: 232, padding: 4,
        background: 'var(--panel)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)', zIndex: 60,
      }}
    >
      {item('New', '', () => {
        const r = runUi('new_document', { width: doc?.w ?? 16, height: doc?.h ?? 16 })
        if (!r.ok) window.alert(r.error)
      })}
      {item('Open…', '', () => openFile())}

      {/* Examples. The editor opens blank, so the starters had to become
          something you reach for. Routed through commit() like everything else:
          one undo step, and the drawing you had is on the stack rather than
          gone. */}
      <div style={{ height: 1, margin: '4px 6px', background: 'var(--line)' }} />
      {listStarters().map((s) => item(`Example — ${s}`, '', () => loadExample(s)))}

      {item('Export .tessera.json', 'Ctrl S', () => {
        const d = useDocStore.getState().doc
        if (d) download(`${d.name || 'artwork'}.tessera.json`, serializeDoc(d))
      })}
      {item('Export PNG', '', () => {
        const d = useDocStore.getState().doc
        if (d) downloadPng(d)
      })}
    </div>
  )
}

/**
 * Load a bundled starter over the current document.
 *
 * Keeps the current document's id so this replaces the open drawing rather than
 * spawning a second draft in IndexedDB, and goes through commit() so Ctrl+Z puts
 * the user's own work back — the example is a guide, not a demolition.
 *
 * The viewport is refitted afterwards because a starter can be a different size
 * from what was open, and the old scale and offset would leave it off-screen.
 */
function loadExample(name: StarterName) {
  const before = useDocStore.getState().doc
  if (!before) return
  const after = { ...loadStarter(name), id: before.id }
  useDocStore.getState().commit({ type: 'replace_doc', label: `Example: ${name}`, before, after })

  const el = document.querySelector('canvas')
  if (el) {
    const r = el.getBoundingClientRect()
    useEditorStore.getState().setViewport(fitViewport(after, r.width, r.height))
  }
}

/** Reads a .tessera.json from disk. A failed parse surfaces — never silently discarded. */
function openFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const parsed = parseDoc(JSON.parse(await file.text()))
      if (!parsed.ok) {
        window.alert(`That file could not be read: ${parsed.error.message}`)
        return
      }
      useDocStore.getState().setDoc(parsed.value)
    } catch {
      window.alert('That file is not valid JSON.')
    }
  }
  input.click()
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** One document pixel per image pixel — the export is the artwork, not a screenshot. */
function downloadPng(doc: ReturnType<typeof useDocStore.getState>['doc']) {
  if (!doc) return
  const c = document.createElement('canvas')
  c.width = doc.w
  c.height = doc.h
  const ctx = c.getContext('2d')
  if (!ctx) return
  for (const r of spriteRects(doc)) {
    ctx.fillStyle = r.fill
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }
  c.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name || 'artwork'}.png`
    a.click()
    URL.revokeObjectURL(url)
  })
}

/**
 * A live 16x16 preview of the pattern, drawn from the same `ditherPasses` the
 * brush uses. Not an approximation of it — if the matrix changes, this changes.
 */
function DitherSwatch({ mode, size = 16 }: { mode: DitherMode; size?: number }) {
  const density = DITHER_MODES.find((m) => m.id === mode)?.density ?? 1
  const cells: React.ReactNode[] = []
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (!ditherPasses(x, y, density)) continue
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />)
    }
  }
  return (
    <span
      style={{
        width: size, height: size, display: 'grid', placeItems: 'center',
        borderRadius: 'var(--r-sm)', color: 'var(--fg)',
        boxShadow: '0 0 0 1px var(--line)', overflow: 'hidden',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 4 4" shapeRendering="crispEdges" aria-hidden="true">
        {cells}
      </svg>
    </span>
  )
}

function DitherMenu({ current, onClose }: { current: DitherMode; onClose: () => void }) {
  const setDither = useEditorStore((s) => s.setDither)
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

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Dither pattern"
      style={{
        position: 'absolute', left: 0, top: 'calc(100% + 6px)', width: 148, padding: 4,
        background: 'var(--panel)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)', zIndex: 60,
      }}
    >
      {DITHER_MODES.map((m) => (
        <button
          key={m.id}
          role="menuitemradio"
          aria-checked={current === m.id}
          onClick={() => {
            setDither(m.id)
            onClose()
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '6px 8px', borderRadius: 'var(--r-md)', font: 'var(--t-label)',
            color: 'var(--fg)', textAlign: 'left',
            background: current === m.id ? 'var(--accent-soft)' : 'transparent',
          }}
        >
          <DitherSwatch mode={m.id} size={20} />
          <span style={{ flex: 1 }}>{m.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── tool rail ───────────────────────────────────────────────────────────────

export function ToolRail() {
  const tool = useEditorStore((s) => s.tool)
  const c = chromeFor(useTier())

  // On a phone a vertical rail sits on top of the artwork — there is no column
  // of empty space beside a canvas that fills the width. It lies down along the
  // bottom edge instead, above the agent panel, which is also where a thumb is.
  const outer: React.CSSProperties = c.railHorizontal
    ? {
        position: 'absolute', left: c.inset, right: c.inset, bottom: c.inset,
        display: 'flex', justifyContent: 'center',
        pointerEvents: 'none', zIndex: 10,
      }
    : {
        position: 'absolute', left: c.inset, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', zIndex: 10,
      }

  return (
    <div style={outer}>
      <div
        role="toolbar"
        aria-label="Tools"
        aria-orientation={c.railHorizontal ? 'horizontal' : 'vertical'}
        style={{
          // gap 0, not 4: each button owns its own padding instead, so the rhythm
          // is identical but a pointer travelling the rail is never over nothing.
          // Dead zones between targets are a real miss source.
          display: 'flex',
          flexDirection: c.railHorizontal ? 'row' : 'column',
          gap: 0,
          padding: 6,
          maxWidth: '100%',
          // Wrap, not scroll. Eight 44px buttons need 364px and a 320px phone
          // has 304 — the rail used to scroll, which put the eyedropper and the
          // gradient tool off-screen behind an affordance a touch device never
          // draws. Found by adding 320x568 to tools/check-responsive.ts; 390 had
          // just enough room to hide it. Wrapping keeps every target at 44px and
          // needs no width measurement.
          flexWrap: c.railHorizontal ? 'wrap' : undefined,
          justifyContent: c.railHorizontal ? 'center' : undefined,
          borderRadius: 'var(--r-xl)',
          background: 'color-mix(in srgb, var(--panel) 90%, transparent)',
          backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-card)',
          pointerEvents: 'auto',
        }}
      >
        {TOOLS.map(({ id, title, key, Icon, enabled }) => (
          <GlyphBtn
            key={id}
            title={enabled ? `${title} (${key})` : `${title} — not built yet`}
            tip={title}
            shortcut={key}
            place={c.railHorizontal ? 'top' : 'right'}
            Icon={Icon}
            size={c.railButton}
            icon={c.railIcon}
            pad={2}
            active={tool === id}
            disabled={!enabled}
            // Through the registry, not the store — one definition per
            // capability, so a toolbar bug and an agent bug are the same bug.
            onClick={() => enabled && runUi('select_tool', { tool: id })}
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
  const c = chromeFor(useTier())

  const fit = () => {
    const el = document.querySelector('canvas')
    if (!el || !doc) return
    const r = el.getBoundingClientRect()
    setViewport(fitViewport(doc, r.width, r.height))
  }

  return (
    <div
      style={{
        position: 'absolute', right: c.inset, zIndex: 20, pointerEvents: 'none',
        // On a phone the bottom edge is fully spoken for — agent panel above the
        // horizontal tool rail — and stacking a third thing there put the zoom
        // readout on top of the panel's own text. The empty space is at the top.
        ...(c.railHorizontal ? { top: c.inset } : { bottom: c.inset }),
      }}
    >
      <div
        style={{
          height: 44, display: 'flex', alignItems: 'center', gap: 0, padding: 4,
          borderRadius: 'var(--r-pill)',
          background: 'color-mix(in srgb, var(--panel) 90%, transparent)',
          backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-card)',
          color: 'var(--muted)',
          pointerEvents: 'auto',
        }}
      >
        <GlyphBtn title="Zoom out" Icon={Minus} size={36} icon={18}
          onClick={() => runUi('set_zoom', { scale: stepScale(vp.scale, -1) })} />
        <Tooltip label="Fit to screen" placement="top">
          <button
            aria-label="Fit to screen"
            className="tabular"
            onClick={fit}
            style={{
              // 16 tall was the one WCAG 2.5.8 target-size failure in the app, and it
              // came straight from the reference. 24 is the floor.
              minWidth: 56, height: 36, padding: '0 8px', borderRadius: 'var(--r-pill)',
              color: 'var(--muted)',
            }}
          >
            {vp.scale}×
          </button>
        </Tooltip>
        <GlyphBtn title="Zoom in" Icon={Plus} size={36} icon={18}
          onClick={() => runUi('set_zoom', { scale: stepScale(vp.scale, 1) })} />
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
          <Tooltip key={i} label={entry.n ?? entry.c} shortcut={String(i)} placement="top">
          <button
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
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

export { DotsThree }
