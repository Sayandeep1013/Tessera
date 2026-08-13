'use client'

/**
 * Chrome — top bar, tool rail, zoom control.
 *
 * Geometry is transcribed from docs/research/newt/VISUAL-SPEC.md §6, which was
 * measured off the live reference. Numbers in comments are the measured values;
 * do not "tidy" them.
 */

import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useDocStore, useEditorStore, type Tool } from '@/lib/store/editor'
import { fitViewport, stepScale } from '@/lib/editor/viewport'
import { refitViewport } from '@/lib/editor/refit'
import { chromeFor, useTier } from '@/lib/editor/breakpoint'
import { isMod, isTyping } from '@/lib/editor/keys'
import { listStarters, loadLogo, loadStarter, type StarterName } from '@/lib/artwork-core/create'
import { clearFrameCommand, paintedCellCount } from '@/lib/artwork-core/clear'
import { UNTITLED, renameCommand } from '@/lib/artwork-core/doc-name'
import { duplicateDoc } from '@/lib/artwork-core/duplicate'
import { MAX_NAME } from '@/lib/artwork-core/schema'
import {
  CLEAR_ACTION, CLEAR_TONE, CONFIRM_DOM_ID, FILE_MENU, NEW_ACTION, NEW_TONE,
  RECENT_EMPTY_DOM_ID, RECENT_LIST_DOM_ID,
  clearConfirm, exampleDomId, menuItemDomId, needsNewConfirm, newConfirm, starterLabel,
  type ConfirmTone, type FileMenuItem, type FileMenuItemId,
} from '@/lib/editor/file-menu'
import {
  RECENT_CORRUPT, RECENT_EMPTY, RECENT_LIMIT, recentRows, type RecentRow,
} from '@/lib/editor/recent'
import { pasteImageCommand } from '@/lib/artwork-core/paste-image'
import { PASTE_FAILURE, PASTE_NO_CLIPBOARD, pasteReport } from '@/lib/editor/paste'
import {
  imageFromClipboardOrFile, imageFromPaste, type ImageResult,
} from '@/lib/editor/clipboard'
import { listRecent } from '@/lib/persist/idb'
import { runUi } from '@/lib/store/ctx'
import { DITHER_MODES, ditherPasses, type DitherMode } from '@/lib/editor/dither'
import { spriteRects } from '@/lib/renderer/sprite-svg'
import { parseDoc } from '@/lib/artwork-core/codec'
import { exportJson } from '@/lib/exporters/json'
import { saveExport } from '@/lib/editor/save-export'
import {
  ArrowUturnLeft, ArrowUturnRight, CaretDown, CaretDownSmall, Code, Cursor,
  DotsThree, Eraser, Export, Eyedropper, FilmStrip, Gradient, Minus, PaintBrush,
  PaintBucket, PixelPerfect, Plus, Selection, Sliders, Square, Stack,
} from './icons'
import { Tooltip, type Placement } from './Tooltip'
import { SettingsPanel } from './Settings'
import { SharePopover } from './SharePopover'

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
  const showGrid = useEditorStore((s) => s.gridMode !== 'off')
  const layersOpen = useEditorStore((s) => s.layersOpen)
  const setLayersOpen = useEditorStore((s) => s.setLayersOpen)
  const codeOpen = useEditorStore((s) => s.codeOpen)
  const setCodeOpen = useEditorStore((s) => s.setCodeOpen)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [fileOpen, setFileOpen] = useState(false)
  /**
   * Set when Ctrl+N arrives on a document with work on it.
   *
   * The New confirm lives inside the menu's body (§7.5), so a keyboard New has
   * nowhere to draw it — the menu is not open. So it opens the menu straight
   * into the confirm rather than inventing a second dialog, and the keystroke
   * and the click end up at exactly the same panel.
   */
  const [fileIntent, setFileIntent] = useState<'new' | null>(null)
  const [ditherOpen, setDitherOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const dither = useEditorStore((s) => s.dither)
  const settingsOpen = useEditorStore((s) => s.settingsOpen)
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen)
  const c = chromeFor(useTier())

  // token-exempt: an artwork colour is document data, not a design token
  const swatch = doc?.palette[colorIndex]?.c ?? '#000000'

  /**
   * The File menu's shortcuts — spec 17 §3 and §8.4.
   *
   * Here rather than in `app/page.tsx` because this component owns the menu's
   * open state, and Ctrl+N on a document with work on it has to *open the menu*
   * to show its confirm. The `isTyping` guard is imported rather than rewritten,
   * which is what §3 actually asks for: one rule, not one handler.
   *
   * Ctrl+V is NOT here, and that is the design rather than an omission — see
   * the paste listener below and spec §9.5.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isMod(e) || e.shiftKey || e.altKey || isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        const d = useDocStore.getState().doc
        // Same rule as the menu item: ask only when there is work at stake.
        if (needsNewConfirm(d, useDocStore.getState().frame)) {
          setFileIntent('new')
          setFileOpen(true)
        } else {
          startNewDocument()
        }
      } else if (key === 'o') {
        e.preventDefault()
        openFile()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * `⌘V` — spec 17 §9.5.
   *
   * A `paste` listener, NOT a keydown handler, and the difference is the whole
   * argument. The event carries `clipboardData` on the gesture itself: no
   * Clipboard API, no permission prompt, no missing implementation in Firefox,
   * and no conditional `preventDefault` — the browser already routes ⌘V inside
   * a text field to that field. §3 made conditional preventDefault the reason
   * shortcuts were their own step; this removes the question instead of
   * answering it.
   *
   * `isTyping` is still checked, for the one case the browser cannot decide for
   * us: pasting *text* into the filename input must never be read as pasting an
   * *image* into the canvas.
   */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      // Not preventDefault'd: there is nothing else on this page that a paste
      // could land in, and swallowing the event would make a future text
      // surface silently stop working.
      void imageFromPaste(e).then(applyPaste)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

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
            {c.showWordmark && (
              <span style={{ font: 'var(--t-title)', letterSpacing: '-0.4px' }}>Tessera</span>
            )}
            <span style={{ color: 'var(--faint)' }}><CaretDown size={16} /></span>
          </button>
        </Tooltip>
        {fileOpen && (
          <FileMenu
            intent={fileIntent}
            onClose={() => { setFileOpen(false); setFileIntent(null) }}
          />
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <GlyphBtn
          title="Settings"
          Icon={Sliders}
          icon={20}
          active={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        />
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>

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
        <NameField key={`${doc?.id ?? ''}:${doc?.name ?? ''}`} />
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

        {c.showShare && (
          <div style={{ position: 'relative' }}>
            <Tooltip label="Share a link to this artwork" placement="bottom">
              <button
                aria-label="Share"
                aria-haspopup="dialog"
                aria-expanded={shareOpen}
                onClick={() => setShareOpen((v) => !v)}
                style={{
                  height: 40, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 10px 0 12px', borderRadius: 'var(--r-pill)',
                  font: 'var(--t-label-lg)',
                  color: shareOpen ? 'var(--fg)' : 'var(--muted)',
                  background: shareOpen ? 'var(--hover)' : 'transparent',
                }}
              >
                <Export size={20} />
                <span>Share</span>
              </button>
            </Tooltip>
            {shareOpen && <SharePopover onClose={() => setShareOpen(false)} />}
          </div>
        )}

        {/* Live, so it left the dead-control group. It survives to a phone,
            where it becomes a sheet — spec 07 §7. */}
        {c.showCode && (
          <GlyphBtn
            title="Code"
            tip="Code — the document itself"
            shortcut="Ctrl /"
            Icon={Code}
            active={codeOpen}
            onClick={() => setCodeOpen(!codeOpen)}
          />
        )}

        {/* Not built yet. It holds newt's layout on a wide screen, but it is
            the first thing to go when space is short — a dead control must never
            cost a live one its place. */}
        {c.showUnbuilt && <GlyphBtn title="Animation timeline" Icon={FilmStrip} disabled />}

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
 * The document's name, in the header. See docs/specs/17-file-menu.md §8.1.
 *
 * This used to be an input that displayed `doc.name` and **silently discarded
 * anything typed into it** — no handler at all. It also put the word `untitled`
 * in as a *value*, so focusing and blurring the empty field would have renamed
 * the document to "untitled" the moment a handler existed. It is a placeholder
 * now, which is what it always meant.
 *
 * Uncontrolled, and remounted by a key on `${id}:${name}`, so the field follows
 * the document when it changes underneath — an undo, a load, a Duplicate. The
 * key is stable *while typing*, because nothing is committed until blur.
 *
 * Commit on blur and on Enter, not per keystroke: per-keystroke renaming would
 * put one undo entry on the stack per character. Escape puts the document's
 * name back in the field and then blurs, which needs no "cancelled" flag —
 * `renameCommand` returns null when the name has not changed, so the blur
 * commits nothing.
 */
function NameField() {
  const doc = useDocStore((s) => s.doc)
  const ref = useRef<HTMLInputElement>(null)

  const commitName = () => {
    const d = useDocStore.getState().doc
    if (!d || !ref.current) return
    // Through commit() like every other mutation — rule 4 has no metadata
    // carve-out, and Ctrl+Z reverses a rename like anything else.
    useDocStore.getState().commit(renameCommand(d, ref.current.value))
  }

  return (
    <input
      ref={ref}
      defaultValue={doc?.name ?? ''}
      placeholder={UNTITLED}
      spellCheck={false}
      autoComplete="off"
      maxLength={MAX_NAME}
      aria-label="Artwork name"
      onBlur={commitName}
      onKeyDown={(e) => {
        // The keys are handled here rather than in the page's global handler:
        // its isTyping guard returns early for exactly this element, which is
        // the correct division — a field owns the keys pressed inside it.
        if (e.key === 'Enter') ref.current?.blur()
        if (e.key === 'Escape' && ref.current) {
          ref.current.value = useDocStore.getState().doc?.name ?? ''
          ref.current.blur()
        }
      }}
      style={{
        width: 240, height: 32, padding: '4px 8px', borderRadius: 'var(--r-md)',
        font: 'var(--t-label-lg)', textAlign: 'center', color: 'var(--fg)',
        pointerEvents: 'auto',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    />
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
 * File menu. See docs/specs/17-file-menu.md, and §7 for what B1 decided.
 *
 * Everything that decides anything is in lib/editor/file-menu.ts — the shape of
 * the menu, whether New has to ask, and every sentence either confirm says — so
 * that `npm test` can hold it. What is left here is markup and the calls that
 * mutate.
 *
 * The handler table is a `Record<FileMenuItemId, …>` on purpose: the menu is
 * rendered from data, and an exhaustive record is what makes the compiler name a
 * new item that nobody wired rather than letting it render as a dead row.
 */
function FileMenu({
  onClose, intent = null,
}: {
  onClose: () => void
  /** Ctrl+N opens the menu already showing its confirm — see TopBar. */
  intent?: 'new' | null
}) {
  const doc = useDocStore((s) => s.doc)
  const frame = useDocStore((s) => s.frame)
  const ref = useRef<HTMLDivElement>(null)
  const tier = useTier()

  /**
   * Which disclosure is expanded, if any. One at a time: two open submenus in a
   * 232px popover is a scroll, and only one of them is ever the answer.
   */
  const [open, setOpen] = useState<FileMenuItemId | null>(null)
  /** Which item is mid-confirm. The confirm replaces the menu's body — §7.5. */
  const [confirming, setConfirming] = useState<'new' | 'clear' | null>(intent)
  /** Loaded when the recent disclosure is first expanded, not on menu open. */
  const [recent, setRecent] = useState<RecentRow[] | null>(null)

  const painted = doc ? paintedCellCount(doc, frame) : 0

  /**
   * Read IndexedDB when the list is actually asked for.
   *
   * Not on menu open: that would parse up to ten documents every time somebody
   * reaches for Export PNG. `Date.now()` is read once here rather than per row,
   * so every row in one opening is dated against the same instant.
   */
  useEffect(() => {
    if (open !== 'recent' || recent) return
    let cancelled = false
    void (async () => {
      try {
        const entries = await listRecent(RECENT_LIMIT)
        if (!cancelled) {
          setRecent(recentRows(entries, doc?.id ?? null, Date.now(), UNTITLED))
        }
      } catch {
        // IndexedDB unavailable (private mode). An empty list reads as "nothing
        // saved yet", which is true of this browser.
        if (!cancelled) setRecent([])
      }
    })()
    return () => { cancelled = true }
  }, [open, recent, doc?.id])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    /**
     * One level at a time — spec §5. A confirm backs out to the menu, an open
     * submenu collapses, and only a menu with neither of those open closes.
     * Escaping out of a confirm should not also cost you the menu you were in.
     */
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirming) setConfirming(null)
      else if (open) setOpen(null)
      else onClose()
    }
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
  }, [onClose, confirming, open])

  const startNew = () => {
    startNewDocument()
    onClose()
  }

  const clearFrame = () => {
    const d = useDocStore.getState().doc
    if (!d) return
    const cmd = clearFrameCommand(d, frame, 'Clear frame')
    // One batch, so Ctrl+Z is one press however many layers the frame has.
    if (cmd) useDocStore.getState().commit(cmd)
    onClose()
  }

  /** A disclosure toggles rather than acting. It IS the menu, one level down. */
  const toggle = (id: FileMenuItemId) => setOpen((v) => (v === id ? null : id))

  const run: Record<FileMenuItemId, () => void> = {
    new: () => (needsNewConfirm(doc, frame) ? setConfirming('new') : startNew()),
    recent: () => toggle('recent'),
    open: () => { openFile(); onClose() },
    // Closed first, deliberately: the Clipboard API can raise a permission
    // prompt and the file picker is a modal of its own, and neither should
    // arrive with a menu still open behind it.
    paste: () => { onClose(); void pasteFromClipboard() },
    duplicate: () => { void duplicateCurrent(); onClose() },
    examples: () => toggle('examples'),
    download: () => {
      const d = useDocStore.getState().doc
      if (d) saveExport(exportJson(d))
      onClose()
    },
    // Dynamic import, deliberately: `exportPng` pulls in `pngjs/browser`
    // (docs/specs/08-exporters.md §12.4), which is large enough to keep out of
    // Chrome.tsx's own bundle — this is the one File-menu row that would
    // otherwise pay for it on every page load rather than only when clicked.
    png: () => {
      const d = useDocStore.getState().doc
      if (d) void import('@/lib/exporters/png').then((m) => saveExport(m.exportPng(d, { frame })))
      onClose()
    },
    clear: () => setConfirming('clear'),
  }

  /** Nothing painted, nothing to clear. A confirm that leads to a no-op is worse
   *  than a disabled row — §7.4. */
  const disabled: Partial<Record<FileMenuItemId, boolean>> = { clear: painted === 0 }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="File"
      style={{
        position: 'absolute', left: 0, top: 'calc(100% + 6px)', width: 232, padding: 4,
        // The menu grew from six rows to eight plus a submenu. 232 still clears
        // a 320px screen from the logo's x=12 — measured by tools/probe-file-menu.ts,
        // because check-responsive never opens a popover (HANDOFF §5) — but the
        // two caps mean a shorter viewport scrolls the menu instead of running
        // it off the bottom.
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: `calc(100dvh - ${chromeFor(tier).headerHeight + 16}px)`,
        overflowY: 'auto',
        background: 'var(--panel)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)', zIndex: 60,
      }}
    >
      {confirming === 'new' && (
        <MenuConfirm
          id={CONFIRM_DOM_ID.new}
          message={newConfirm(doc?.w ?? 16, doc?.h ?? 16)}
          action={NEW_ACTION}
          tone={NEW_TONE}
          onCancel={() => setConfirming(null)}
          onConfirm={startNew}
        />
      )}
      {confirming === 'clear' && (
        <MenuConfirm
          id={CONFIRM_DOM_ID.clear}
          message={clearConfirm(painted)}
          action={CLEAR_ACTION}
          tone={CLEAR_TONE}
          onCancel={() => setConfirming(null)}
          onConfirm={clearFrame}
        />
      )}

      {!confirming && FILE_MENU.map((group, g) => (
        // role="none" on the layout wrappers, so the menuitems are still direct
        // children of the menu as far as assistive tech is concerned. A plain
        // div here silently breaks a menu's required-owned-elements rule.
        <div key={g} role="none">
          {g > 0 && (
            <div role="none" style={{ height: 1, margin: '4px 6px', background: 'var(--line)' }} />
          )}
          {group.map((it) => (
            <div key={it.id} role="none">
              <MenuItem
                item={it}
                expanded={it.submenu ? open === it.id : undefined}
                disabled={disabled[it.id]}
                onClick={run[it.id]}
              />
              {/* Submenus expand in place. §7.1: a flyout at this anchor runs
                  off a 390px phone, and flipping it left lands on its own
                  parent. `listStarters()` is the source — the rows are never
                  hard-coded, so adding a starter adds a row. */}
              {it.id === 'examples' && open === 'examples' && (
                <div role="group" aria-label="Examples">
                  {listStarters().map((s) => (
                    <button
                      key={s}
                      id={exampleDomId(s)}
                      role="menuitem"
                      onClick={() => { loadExample(s); onClose() }}
                      style={{ ...ROW, paddingLeft: 28, color: 'var(--muted)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ flex: 1 }}>{starterLabel(s)}</span>
                    </button>
                  ))}
                </div>
              )}
              {it.id === 'recent' && open === 'recent' && (
                <RecentList rows={recent} onPick={onClose} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Open recent. See docs/specs/17-file-menu.md §8.2.
 *
 * `listDrafts()` had existed since the persistence unit and nothing called it,
 * so every document anyone had ever autosaved was sitting in IndexedDB
 * unreachable — the artwork was never discarded, it just could not be got back
 * to, which is a rule-7 problem with no error message to give it away.
 *
 * `null` rows means "still reading", and it is a distinct state from an empty
 * list: showing "Nothing saved yet." for the half-frame before IndexedDB answers
 * would be a lie about the user's work, which is the one thing this list exists
 * not to do.
 */
function RecentList({ rows, onPick }: { rows: RecentRow[] | null; onPick: () => void }) {
  if (rows === null) {
    return (
      <div role="group" aria-label="Open recent" style={{ ...ROW, paddingLeft: 28, color: 'var(--faint)' }}>
        Reading…
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div
        id={RECENT_EMPTY_DOM_ID}
        role="group"
        aria-label="Open recent"
        style={{ ...ROW, paddingLeft: 28, color: 'var(--faint)' }}
      >
        {RECENT_EMPTY}
      </div>
    )
  }

  return (
    <div id={RECENT_LIST_DOM_ID} role="group" aria-label="Open recent">
      {rows.map((row) => (
        <button
          key={row.id}
          role="menuitem"
          // F-M4: a record that no longer parses is shown, disabled, and says
          // so. Never dropped from the list — the row is the only remaining
          // evidence that the work exists, so hiding it is the same as deleting
          // it as far as the person who drew it is concerned.
          disabled={!!row.error}
          // No `title`: tooltips are ours (components/Tooltip.tsx) and
          // lib/__tests__/tooltips.test.ts fails on a native one — it caught
          // this. The row says "Can't be read" in the slot where a date would
          // be, which is the labelling F-M4 asks for; the parse error itself is
          // developer detail and belongs in the console, not on a menu row.
          onClick={() => { void openRecent(row); onPick() }}
          style={{
            ...ROW, paddingLeft: 28, gap: 8,
            color: row.error ? 'var(--disabled)' : 'var(--fg)',
          }}
          onMouseEnter={(e) => !row.error && (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Thumb row={row} />
          <span
            style={{
              flex: 1, minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {row.label}
          </span>
          <span className="tabular" style={{ color: 'var(--faint)', font: 'var(--t-label-sm)' }}>
            {row.error ? RECENT_CORRUPT : row.when}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * A 20px thumbnail, or the document's size where a thumbnail is not cheap.
 *
 * §8.3: `spriteRects` merges runs, so a starter is tens of rects and a dense
 * 256×256 is thousands — ten of those is a rendering job on the click that
 * opens a menu. `row.thumb` carries the decision; `recent.ts` makes it.
 */
function Thumb({ row, size = 20 }: { row: RecentRow; size?: number }) {
  const doc = row.entry.doc
  const box: React.CSSProperties = {
    width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center',
    borderRadius: 'var(--r-sm)', boxShadow: 'inset 0 0 0 1px var(--line)', overflow: 'hidden',
  }

  if (!doc) return <span aria-hidden style={box} />
  if (!row.thumb) {
    return (
      <span aria-hidden style={{ ...box, font: 'var(--t-mono-sm)', color: 'var(--faint)' }}>
        {doc.w}
      </span>
    )
  }

  return (
    <span aria-hidden style={box}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${doc.w} ${doc.h}`}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="crispEdges"
      >
        {spriteRects(doc).map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
        ))}
      </svg>
    </span>
  )
}

/**
 * Start over on a blank canvas at the current size.
 *
 * Module scope, not inside FileMenu, because `Ctrl+N` reaches it too and a
 * shortcut that took a different route from its menu item is a divergence
 * waiting to happen (§8.4). The confirm is the *caller's* business — both
 * callers ask `needsNewConfirm` first.
 *
 * Through the registry, so the UI inherits the same destructive-action gate the
 * agent is held to.
 */
function startNewDocument() {
  const doc = useDocStore.getState().doc
  const r = runUi('new_document', { width: doc?.w ?? 16, height: doc?.h ?? 16 })
  if (!r.ok) {
    window.alert(r.error)
    return
  }
  // A blank canvas is a different artwork, so it is shown fitted and centred
  // rather than under whatever pan the last drawing was left at. The size is
  // unchanged by construction, so this is about the artwork, not the
  // dimensions — §7.3.
  const after = useDocStore.getState().doc
  if (after) refitViewport(after)
}

/**
 * Switch to a saved draft.
 *
 * `setDoc`, not `commit` — a different document is being opened, which is the
 * path `openFile` and Duplicate already take (§7.7). The flush before it is the
 * same load-bearing line: autosave is debounced 500ms, so leaving within half a
 * second of a stroke would lose it from the document you are walking away from.
 *
 * Re-fitted after, because a recent document can be any size — the same one line
 * `Open…` needed (§7.9).
 */
async function openRecent(row: RecentRow) {
  const doc = row.entry.doc
  if (!doc) return
  const store = useDocStore.getState()
  await store.flushSave()
  store.setDoc(doc)
  refitViewport(doc)
}

/** Shared row geometry — the menu, the submenu and the confirm's buttons agree. */
const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
  padding: '7px 10px', borderRadius: 'var(--r-md)', font: 'var(--t-label)',
  color: 'var(--fg)', textAlign: 'left',
}

function MenuItem({
  item, expanded, disabled, onClick,
}: {
  item: FileMenuItem
  expanded?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      // An id, not an aria-label. Clear's label is plain text but the confirm it
      // opens is labelled with a COUNT, and a probe reading a label needs a
      // handle that is not the label — HANDOFF §5, the trap A2 hit. Built by
      // `menuItemDomId` so probe-handles.test.ts can check the probes against
      // the same source.
      id={menuItemDomId(item.id)}
      role="menuitem"
      aria-haspopup={item.submenu ? 'true' : undefined}
      aria-expanded={item.submenu ? expanded : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...ROW,
        color: disabled
          ? 'var(--disabled)'
          : item.destructive
            ? 'var(--diff-remove)'
            : 'var(--fg)',
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.hint && <span className="tabular" style={{ color: 'var(--faint)' }}>{item.hint}</span>}
      {item.submenu && (
        <span
          aria-hidden
          style={{
            display: 'grid', placeItems: 'center', color: 'var(--faint)',
            // No CaretRight in the generated icon set, and icons.tsx must not be
            // hand-edited. A rotated CaretDown is the same glyph the header uses
            // and it animates between the two states for free.
            transform: expanded ? 'none' : 'rotate(-90deg)',
            transition: `transform var(--dur-2) var(--ease-out)`,
          }}
        >
          <CaretDownSmall size={12} />
        </span>
      )}
    </button>
  )
}

/**
 * A confirm that replaces the menu's body rather than opening a dialog. §7.5.
 *
 * This repo has no modal component and B1 is not the unit to invent one. The
 * menu is already a popover with a focus context and an Escape handler, so the
 * cheapest honest confirm is to put the question where the item was. Cancel
 * returns to the menu — backing out of a confirm should not also close the menu
 * you were reading.
 */
function MenuConfirm({
  id, message, action, tone, onCancel, onConfirm,
}: {
  id: string
  message: string
  action: string
  /** danger = destroys work. primary = a big change that loses nothing. */
  tone: ConfirmTone
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div role="alertdialog" aria-label={action} style={{ padding: 6, display: 'grid', gap: 10 }}>
      <p id={`${id}-message`} style={{ margin: 0, font: 'var(--t-copy-sm)', color: 'var(--fg)' }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{ height: 30, padding: '0 12px', font: 'var(--t-label-sm)', color: 'var(--muted)' }}
        >
          Cancel
        </button>
        <button
          id={id}
          autoFocus
          onClick={onConfirm}
          style={{
            height: 30, padding: '0 14px', borderRadius: 'var(--r-md)',
            font: 'var(--t-label-sm)',
            background: tone === 'danger' ? 'var(--diff-remove)' : 'var(--solid)',
            color: tone === 'danger' ? 'var(--onaccent)' : 'var(--onsolid)',
          }}
        >
          {action}
        </button>
      </div>
    </div>
  )
}

/**
 * Fork the open document into a new draft and switch to it. Spec §2, §7.3, §7.7.
 *
 * `setDoc`, not `commit`: this is not a mutation of the open document, it is a
 * different document being opened — the same path `openFile` takes. Rule 4 is
 * about who writes the document, and nothing here writes one; the original is
 * untouched and sits in IndexedDB under its own id, which is the escape hatch
 * rule 7 asks for.
 *
 * The flush is load-bearing. Autosave is debounced 500ms, so duplicating within
 * half a second of a stroke would switch away before the ORIGINAL was written —
 * the copy would carry the stroke and the original would not.
 *
 * No `refitViewport`: a duplicate is the same picture at the same size, so
 * re-fitting would throw away the pan and zoom of somebody mid-detail-work and
 * buy nothing (§7.3).
 */
async function duplicateCurrent() {
  const store = useDocStore.getState()
  const doc = store.doc
  if (!doc) return
  await store.flushSave()
  store.setDoc(duplicateDoc(doc, { id: nanoid() }))
}

/**
 * Load a bundled starter as a new draft.
 *
 * **Takes a fresh id**, like New… and Duplicate. It used to keep the current
 * document's id, on the reasoning that an example should replace the open
 * drawing rather than spawn a second draft — but drafts are keyed by id, so
 * that meant autosave wrote the starter straight over whatever was open. Ctrl+Z
 * brought the drawing back; a reload did not. Spawning a draft is the feature
 * once Open recent exists, not the cost. See docs/specs/17-file-menu.md §7.11.
 *
 * Still through commit(), so it is one undo step and the drawing you had is on
 * the stack rather than gone — the example is a guide, not a demolition.
 *
 * The viewport is refitted afterwards because a starter can be a different size
 * from what was open, and the old scale and offset would leave it off-screen.
 */
function loadExample(name: StarterName) {
  const before = useDocStore.getState().doc
  if (!before) return
  const after = { ...loadStarter(name), id: nanoid() }
  useDocStore.getState().commit({ type: 'replace_doc', label: `Example: ${name}`, before, after })
  refitViewport(after)
}

/**
 * Paste an image onto the active layer. See docs/specs/17-file-menu.md §9.
 *
 * Module scope, like `startNewDocument`, because two entry points reach it —
 * the menu row and the `paste` event — and a shortcut that took a different
 * route from its menu item is a divergence waiting to happen (§8.4).
 *
 * Everything it decides is decided elsewhere: `pasteImageCommand` builds the
 * command, `pasteReport` writes the sentence. What is left here is `commit`,
 * which is still the only thing that writes the document.
 */
function applyPaste(r: ImageResult) {
  const notice = useEditorStore.getState().setNotice
  if (!r.ok) {
    // Closing a file dialog you opened needs no announcement — see ImageResult.
    if (r.reason === 'cancelled') return
    // F-M2 and F-M5 otherwise: never silence. A ⌘V with text on the clipboard
    // is an ordinary mistake and deserves a sentence, not nothing happening.
    notice(PASTE_FAILURE[r.reason])
    return
  }

  const store = useDocStore.getState()
  const doc = store.doc
  if (!doc) return

  const { cmd, result } = pasteImageCommand(
    doc,
    store.frame,
    store.layer,
    r.image.rgba,
    // The decode is capped at 1024 (clipboard.ts), so the pixels are not
    // necessarily the size that was copied — and the message quotes the size
    // that was copied.
    r.image.source,
  )
  // Null when nothing would change. commit() ignores null anyway; the report is
  // sent either way, because "nothing happened" is also an answer (§9.6).
  store.commit(cmd)
  notice(pasteReport(result))
}

/** The menu row's path: the Clipboard API, then a file picker (§9.5). */
async function pasteFromClipboard() {
  applyPaste(
    await imageFromClipboardOrFile(() =>
      // Said *before* the picker opens, so a file dialog appearing when the
      // user asked for a paste is explained rather than mysterious. F-M5.
      useEditorStore.getState().setNotice(PASTE_NO_CLIPBOARD),
    ),
  )
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
      // A file from disk can be any size, and the view is still fitted to the
      // document that was open. Recorded as debt in HANDOFF §11 when A2 fixed
      // the same defect for resize and loadExample; this is the unit that owns
      // this function, so it is fixed here rather than carried further.
      refitViewport(parsed.value)
    } catch {
      window.alert('That file is not valid JSON.')
    }
  }
  input.click()
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
        /**
         * Centred on the space it actually has, not on <main>.
         *
         * <main> starts below the header, so `top: 50%` centres the rail in the
         * full column — but the agent panel occupies the bottom of that column
         * and the header sits directly above it, so the rail read as sitting
         * too low, with a wide gap above and none below. Reported as such.
         *
         * The lift itself lives in chromeFor, because AgentPanel derives its
         * height cap from where this leaves the rail's bottom edge. Kept as a
         * translate so the rail's own height still does the centring and
         * nothing here has to know it.
         */
        position: 'absolute',
        left: c.inset,
        top: '50%',
        transform: `translateY(calc(-50% - ${c.railLift}px))`,
        pointerEvents: 'none',
        zIndex: 10,
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
