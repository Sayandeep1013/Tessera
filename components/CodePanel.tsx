'use client'

/**
 * The code panel. See docs/specs/07-code-panel.md, §9 for what unit C
 * corrected, §9.11 and docs/specs/08-exporters.md §14 for what unit H did.
 *
 * The thesis of this whole product, made literal: the text on the Code tab IS
 * the document, byte for byte what `Download .tessera.json` writes, and
 * editing it edits the drawing. There is no second representation (rule 3)
 * and no display format — `serializeDoc` is the only thing that produces this
 * text, and it is the only tab of the eight that can be typed into.
 *
 * **It is a `<textarea>`, not CodeMirror.** §9.1 has the full argument; the
 * short version is that §1 already wanted CodeMirror with folding,
 * autocomplete and bracket-closing all switched off, which leaves ~200KB buying
 * line numbers and JSON colouring on a file that is 90% pixel rows. What sits
 * behind the transparent textarea instead is a `<pre>` holding the *same
 * string*, marking the two ranges that mean something: the parse error, and the
 * character under the canvas cursor. Three text nodes, so a 256×256 document
 * costs what a 16×16 one does.
 *
 * **The panel is a centred modal, not a split — unit H, §14.** Every tab but
 * Code is a read-only rendering of that format's own exporter, switched by a
 * tab strip instead of a popover, and the one Export button acts on whichever
 * tab is showing.
 *
 * Everything that decides anything is in `lib/editor/code-panel.ts`,
 * `lib/editor/json-locate.ts` and `lib/editor/export-menu.ts`, where `npm
 * test` can reach it. What is here is markup, three timers, and the calls to
 * `commit` and to the exporters.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { chromeFor, useTier } from '@/lib/editor/breakpoint'
import { parseDoc, serializeDoc } from '@/lib/artwork-core/codec'
import { isTyping } from '@/lib/editor/keys'
import { pxRowRanges, locate, type Range } from '@/lib/editor/json-locate'
import {
  pieces, tokenizeJson, type Marked as Marked_, type TokenKind,
} from '@/lib/editor/json-tokens'
import {
  CODE_DOM_ID, CODE_REVERTED, CODE_STATUS_DOM_ID, CODE_TEXT_DOM_ID, CODE_WIDTH_KEY,
  DOC_TO_TEXT_MS, EDIT_LABEL,
  GO_TO_ERROR, MAX_MARK, PANEL_TITLE, SHEET_DONE, STATUS_VALID, TEXT_TO_DOC_MS,
  caretCell, caretLine, cellRange, errorLine, lineAt, readCodeWidth,
  shouldCoalesce, type SyncOrigin,
} from '@/lib/editor/code-panel'
import {
  CODE_EXPORT_DOM_ID, EXPORT_GIF_PROGRESS_DOM_ID, EXPORT_REACT_LANG_DOM_ID, PNG_SCALES,
  clampTab, exportAnimatedToggleDomId, exportScaleDomId, formatTabDomId, visibleTabs,
  type FormatTabId,
} from '@/lib/editor/export-menu'
import { exportSvg } from '@/lib/exporters/svg'
import { exportCss } from '@/lib/exporters/css'
import { exportReact } from '@/lib/exporters/react'
import { exportAscii } from '@/lib/exporters/ascii'
import { exportJson } from '@/lib/exporters/json'
import { runGifExport } from '@/lib/editor/gif-export'
import { saveExport } from '@/lib/editor/save-export'
import type { ExportResult } from '@/lib/exporters/types'
import type { Doc, DocError } from '@/lib/artwork-core/schema'
import { Code, Export } from './icons'
import { TextPreview, ImagePreview } from './FormatPreview'

export function CodePanel() {
  const open = useEditorStore((s) => s.codeOpen)
  if (!open) return null
  return <CodePanelBody />
}

function CodePanelBody() {
  const doc = useDocStore((s) => s.doc)
  const frame = useDocStore((s) => s.frame)
  const layer = useDocStore((s) => s.layer)
  const cursor = useEditorStore((s) => s.cursor)
  const width = useEditorStore((s) => s.codeWidth)
  const setCodeOpen = useEditorStore((s) => s.setCodeOpen)
  const rawTab = useEditorStore((s) => s.codeTab)
  const setCodeTab = useEditorStore((s) => s.setCodeTab)
  const tier = useTier()
  const sheet = tier === 'mobile'

  const frameCount = doc?.frames.length ?? 1
  const tabs = visibleTabs(frameCount)
  const activeTab = clampTab(rawTab, frameCount)

  const modal = useRef<HTMLElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const overlay = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLDivElement>(null)

  const [text, setText] = useState(() => (doc ? serializeDoc(doc) : ''))
  const [error, setError] = useState<DocError | null>(null)
  const [caret, setCaret] = useState(0)

  // ── per-tab export options, and the outcome of the last Export click ───────
  const [pngScale, setPngScale] = useState<1 | 2 | 4 | 8>(1)
  const [reactTs, setReactTs] = useState(true)
  const [animated, setAnimated] = useState({ react: false, css: false })
  const [gifProgress, setGifProgress] = useState<{ done: number; total: number } | null>(null)
  const [rowError, setRowError] = useState<{ tab: FormatTabId; message: string } | null>(null)
  const setNotice = useEditorStore((s) => s.setNotice)

  /**
   * §2's loop guard, as a value and not a comparison.
   *
   * Comparing text cannot work: `serializeDoc` is canonical, so somebody typing
   * a space the serializer would drop has produced text that DIFFERS from the
   * document's canonical form while REPRESENTING the same document. A
   * comparison would call the panel stale and rewrite the buffer under their
   * caret, on that keystroke and every one after it.
   */
  const origin = useRef<SyncOrigin>('init')
  /** When this panel last committed, for §5's coalescing window. */
  const lastEdit = useRef<number | null>(null)
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * §1's persisted width, restored on every open rather than once at boot.
   *
   * Re-reading it each time is what re-clamps it: a width saved on a desktop
   * would otherwise take the whole of a laptop screen the next morning, and
   * `readCodeWidth` is given the current window precisely so it cannot.
   */
  useEffect(() => {
    try {
      useEditorStore
        .getState()
        .setCodeWidth(readCodeWidth(localStorage.getItem(CODE_WIDTH_KEY), window.innerWidth))
    } catch {
      /* private mode — the default width is already in the store */
    }
  }, [])

  // ── document → text, debounced (§2) ───────────────────────────────────────
  useEffect(() => {
    const unsub = useDocStore.subscribe(() => {
      // The panel's own edit coming back around. Rewriting the buffer from it
      // would move the caret to wherever the canonical form put it.
      if (origin.current === 'panel') return
      if (renderTimer.current) clearTimeout(renderTimer.current)
      renderTimer.current = setTimeout(() => {
        const d = useDocStore.getState().doc
        if (!d || origin.current === 'panel') return
        origin.current = 'canvas'
        setText(serializeDoc(d))
        setError(null)
      }, DOC_TO_TEXT_MS)
    })
    return () => {
      unsub()
      if (renderTimer.current) clearTimeout(renderTimer.current)
    }
  }, [])

  // Opening the panel, and any document swap, starts from the document.
  useEffect(() => {
    if (!doc) return
    origin.current = 'canvas'
    setText(serializeDoc(doc))
    setError(null)
    lastEdit.current = null
    // Only when a DIFFERENT document arrives — re-serialising on every commit
    // is the subscription's job above, at its own debounce.
  }, [doc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // A tab that stops being reachable (frame count drops under an open GIF tab)
  // falls back to Code — export-menu.ts's `clampTab` decides it, this just
  // writes the fallback back so the tab strip's own selection stays honest.
  useEffect(() => {
    if (activeTab !== rawTab) setCodeTab(activeTab)
  }, [activeTab, rawTab, setCodeTab])

  // ── text → document, debounced (§2) ───────────────────────────────────────
  /** The buffer, readable from a cleanup closure that would otherwise see stale state. */
  const textRef = useRef(text)
  textRef.current = text

  /** Parse and commit, now. The debounce calls it; so does closing the panel. */
  const applyNow = useCallback((next: string) => {
    const before = useDocStore.getState().doc
    if (!before) return
    const parsed = parseDoc(next)
    if (!parsed.ok) {
      // §3: nothing is applied and nothing is lost. The canvas keeps rendering
      // the last valid document and the autosave of THAT document carries on —
      // the invalid text is never persisted.
      setError(parsed.error)
      return
    }
    setError(null)
    const now = Date.now()
    // Identical bytes are not an edit. Typing and deleting a character would
    // otherwise leave an undo step that undoes to itself.
    if (serializeDoc(before) !== serializeDoc(parsed.value)) {
      useDocStore.getState().commit(
        { type: 'replace_doc', label: EDIT_LABEL, before, after: parsed.value },
        shouldCoalesce(lastEdit.current, now),
      )
      lastEdit.current = now
    }
    // Released only after the commit, so the subscription above ignores this
    // document's own round trip and leaves the caret alone.
    origin.current = 'canvas'
  }, [])

  const onChange = useCallback((next: string) => {
    origin.current = 'panel'
    setText(next)
    if (parseTimer.current) clearTimeout(parseTimer.current)
    parseTimer.current = setTimeout(() => applyNow(next), TEXT_TO_DOC_MS)
  }, [applyNow])

  /**
   * §7: "Done dismisses it and applies any pending valid edit."
   *
   * Without this, closing the panel within 300ms of the last keystroke drops
   * that keystroke — the debounce is still counting and the component goes
   * away with it. Typing a character and immediately reaching for Close is not
   * an unusual thing to do, and losing the edit silently is exactly what rule 7
   * is about. Runs on unmount too, so Escape, ⌘/ and an outside click get it as
   * well as the button.
   */
  useEffect(() => () => {
    if (!parseTimer.current) return
    clearTimeout(parseTimer.current)
    parseTimer.current = null
    applyNow(textRef.current)
  }, [applyNow])

  /**
   * The caret, from `selectionchange` rather than from React's `onSelect`.
   *
   * `onSelect` fires for a click and for a drag-select, and not for an arrow
   * key, a Home, a programmatic `setSelectionRange`, or the field's own undo —
   * so the readout in the status line went stale the moment somebody navigated
   * with the keyboard, which is how you navigate a wall of pixel rows.
   * `selectionchange` is the event that means what this needs.
   */
  useEffect(() => {
    const read = () => {
      const a = area.current
      if (a && document.activeElement === a) setCaret(a.selectionStart)
    }
    document.addEventListener('selectionchange', read)
    return () => document.removeEventListener('selectionchange', read)
  }, [])

  /**
   * Closing the modal: an outside `mousedown` or `Escape`, on top of the
   * existing Close button and `⌘/`. This codebase's own convention —
   * `FileMenu`, `PalettePopover`, `DitherMenu` all use it (`HANDOFF §5`: a
   * `click` listener fires on the same gesture that opened the panel, because
   * that gesture's `mousedown` already finished before this effect registers,
   * but its `click` has not). Skipped in sheet mode, where the panel fills the
   * screen and there is nothing to click outside of.
   */
  useEffect(() => {
    if (sheet) return
    const down = (e: MouseEvent) => {
      if (modal.current && !modal.current.contains(e.target as Node)) setCodeOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCodeOpen(false)
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [sheet, setCodeOpen])

  /**
   * Undo inside the panel is the DOCUMENT's undo, not the textarea's.
   *
   * A textarea brings its own history, and it wins by default: ⌘Z in here would
   * revert the field, which then parses and commits — so "undo" would push a
   * *new* command rather than reversing one, and §5's "one ⌘Z reverses an
   * arbitrary code edit" would be quietly false. There is one history in this
   * app and it belongs to the document; the panel is a view of it.
   *
   * The pending parse is cancelled first. Without that, a keystroke from 200ms
   * ago lands after the undo and immediately re-applies what was just undone.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    const undo = k === 'z' && !e.shiftKey
    const redo = (k === 'z' && e.shiftKey) || k === 'y'
    if (!undo && !redo) return
    e.preventDefault()
    if (parseTimer.current) clearTimeout(parseTimer.current)

    /**
     * While the buffer does not parse, the first ⌘Z undoes **the typing**, not
     * the document. See §9.8.
     *
     * It used to go straight to the document and then rewrite the buffer from
     * it, so text somebody had typed vanished with no message — the one place
     * in the app where that could happen. Undoing an edit that was never
     * applied is also what ⌘Z plainly means here: the unapplied edit is the
     * most recent thing that happened. The document's own history is one more
     * press away, and the notice says which one you just got.
     */
    if (undo && error) {
      const d = useDocStore.getState().doc
      if (d) {
        setText(serializeDoc(d))
        setError(null)
        useEditorStore.getState().setNotice(CODE_REVERTED)
      }
      origin.current = 'canvas'
      lastEdit.current = null
      return
    }
    // The document is about to change from somewhere that is not this panel, so
    // the buffer must be rewritten from it — including when it was mid-edit.
    origin.current = 'canvas'
    const s = useDocStore.getState()
    if (undo) s.undo()
    else s.redo()
    const d = useDocStore.getState().doc
    if (d) {
      setText(serializeDoc(d))
      setError(null)
    }
    lastEdit.current = null
  }

  // ── the two marks (§3, §4) ────────────────────────────────────────────────
  const rows = useMemo(() => (error ? [] : pxRowRanges(text, frame, layer)), [text, frame, layer, error])

  const errorMark = useMemo((): Range | null => {
    if (!error?.path) return null
    const r = locate(text, error.path)
    // §3, and code-panel.ts's MAX_MARK: a path can resolve to a whole container
    // — washing 60KB of text red says "everything is wrong", which is useless
    // and untrue. The message still shows; only the mark degrades.
    return r && r.to - r.from <= MAX_MARK ? r : null
  }, [text, error])

  /**
   * Canvas → panel (§4). Suppressed in sheet mode, off the Code tab (there is
   * no canvas cell a read-only preview's caret could point at) and while the
   * text is invalid, where the row ranges mean nothing.
   */
  const cursorMark = useMemo(
    () => (sheet || activeTab !== 'code' || !cursor || error ? null : cellRange(rows, cursor.x, cursor.y)),
    [sheet, activeTab, cursor, error, rows],
  )

  const cell = caretCell(rows, caret)
  const where = caretLine(cell)

  /** Panel → canvas (§4): the caret's pixel, outlined on the artwork. Degraded
   *  but not removed by the modal change — 08 §14.3: the canvas is very often
   *  behind the panel now, and the footer's `row Y · char X → pixel (X, Y)`
   *  line is what survives as the honest substitute. */
  const setCodeCell = useEditorStore((s) => s.setCodeCell)
  useEffect(() => {
    setCodeCell(sheet || activeTab !== 'code' ? null : cell ? { x: cell.x, y: cell.y } : null)
    return () => setCodeCell(null)
  }, [sheet, activeTab, cell?.x, cell?.y, setCodeCell]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── scroll sync: one scroller, two followers ──────────────────────────────
  const syncScroll = useCallback(() => {
    const a = area.current
    if (!a) return
    /**
     * The overlay scrolls; it is not translated.
     *
     * Translating it was the obvious thing and it was wrong: `transform` moves
     * the element's BOX, so the overlay's bottom edge rose with the content and
     * `overflow: hidden` clipped the last N lines — scroll to the end of a
     * 16×16 document and the final three pixel rows simply were not painted,
     * while the gutter cheerfully numbered them. Every probe passed; only
     * looking at it found it. Setting `scrollTop` on a hidden-overflow element
     * moves the content and leaves the box where it is.
     */
    if (overlay.current) {
      overlay.current.scrollTop = a.scrollTop
      overlay.current.scrollLeft = a.scrollLeft
    }
    // The gutter IS translated, and correctly so: the moving part is an inner
    // div inside a box that stays put.
    if (gutter.current) gutter.current.style.transform = `translateY(${-a.scrollTop}px)`
  }, [])

  useLayoutEffect(syncScroll, [text, syncScroll])

  /** Select a range and put it on screen. `Go to error`, and nothing else. */
  const reveal = (r: Range) => {
    const a = area.current
    if (!a) return
    a.focus()
    a.setSelectionRange(r.from, r.to)
    // A textarea will not scroll to a selection on its own. Approximating the
    // line's offset is enough: the browser then keeps the caret visible.
    const line = lineAt(text, r.from)
    a.scrollTop = Math.max(0, (line - 4) * lineHeight(a))
    setCaret(r.from)
    syncScroll()
  }

  const lines = useMemo(() => text.split('\n').length, [text])

  // ── read-only previews, one per non-Code tab (08 §14.4) ─────────────────────
  const svgResult = useMemo(() => (doc ? exportSvg(doc, { frame }) : null), [doc, frame])
  const cssResult = useMemo(
    () => (doc ? exportCss(doc, { frame, animated: animated.css }) : null),
    [doc, frame, animated.css],
  )
  const reactResult = useMemo(
    () => (doc ? exportReact(doc, { frame, typescript: reactTs, animated: animated.react }) : null),
    [doc, frame, reactTs, animated.react],
  )
  const asciiResult = useMemo(() => (doc ? exportAscii(doc, { frame }) : null), [doc, frame])

  // ── the single Export button: acts on whichever tab is showing ─────────────
  const run = (result: ExportResult, tab: FormatTabId) => {
    setRowError(null)
    const message = saveExport(result)
    if (!result.ok) {
      setRowError({ tab, message: message ?? result.error })
      return
    }
    if (message) setNotice(message)
  }

  const runGif = () => {
    if (!doc || gifProgress) return
    setRowError(null)
    setGifProgress({ done: 0, total: doc.frames.length })
    runGifExport(doc, (done, total) => setGifProgress({ done, total }))
      .then((result) => run(result, 'gif'))
      .catch((e: unknown) => {
        setRowError({ tab: 'gif', message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => setGifProgress(null))
  }

  const runExport = () => {
    if (!doc) return
    switch (activeTab) {
      case 'code': run(exportJson(doc), 'code'); return
      case 'svg': if (svgResult) run(svgResult, 'svg'); return
      case 'css': if (cssResult) run(cssResult, 'css'); return
      case 'react': if (reactResult) run(reactResult, 'react'); return
      case 'ascii': if (asciiResult) run(asciiResult, 'ascii'); return
      case 'png':
        // Loaded only on the click that needs it — `pngjs` (08 §12.4) is big
        // enough that every other tab would otherwise pay to have it sit in
        // the same chunk.
        void import('@/lib/exporters/png').then((m) => run(m.exportPng(doc, { frame, scale: pngScale }), 'png'))
        return
      case 'gif': runGif(); return
      case 'spritesheet':
        // Two files from one click — 08 §13.1: the shared `ExportOk` shape
        // carries exactly one, and a sprite sheet is genuinely two.
        void import('@/lib/exporters/spritesheet').then((m) => {
          run(m.exportSpriteSheet(doc), 'spritesheet')
          run(m.exportSpriteSheetAtlas(doc), 'spritesheet')
        })
        return
    }
  }

  // ── layout ────────────────────────────────────────────────────────────────
  const headerH = chromeFor(tier).headerHeight
  const showOptions = activeTab === 'png' || activeTab === 'react' || (activeTab === 'css' && frameCount > 1)

  const frameStyle: React.CSSProperties = sheet
    ? {
        position: 'absolute', inset: 0, zIndex: 60,
        background: 'var(--panel)',
      }
    : {
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 61, width,
        // `height`, not just `maxHeight` — a flex column with `maxHeight`
        // alone has no definite height for a `flex: 1 1 0` child to fill, so
        // the body region below the header/tabs/options rendered at 0 height
        // regardless of content. A fixed frame with the body scrolling inside
        // it is also the more ordinary modal shape.
        height: 'min(80vh, 720px)',
        border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
        background: 'var(--panel)', boxShadow: 'var(--shadow-lg)',
      }

  return (
    <>
      {/* The scrim. Visual only — closing is decided by the mousedown-outside
          listener above, the same convention every other popover in this app
          uses, not by a click handler on the backdrop itself. `pointerEvents:
          'none'` is load-bearing, not decoration: without it this div — not
          the modal box, which sits above it, but this one — silently ate
          every click and hover the canvas would otherwise have received
          outside the modal's own bounds, which is most of the screen on a
          wide viewport. §14.3 undersold the cost of the modal change before
          this was found; with the scrim passable, a click still closes the
          panel (the window listener below doesn't need the scrim's help for
          that) but a bare hover over the visible canvas still reaches it, so
          §4's hover-highlight survives wherever the canvas isn't literally
          covered by the modal's own opaque box. */}
      {!sheet && (
        <div
          aria-hidden
          style={{
            position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none',
            background: 'color-mix(in srgb, var(--fg) 30%, transparent)',
          }}
        />
      )}
      <aside
        id={CODE_DOM_ID}
        ref={modal as React.RefObject<HTMLElement>}
        role="dialog"
        aria-modal={!sheet}
        aria-label={PANEL_TITLE}
        style={{ ...frameStyle, display: 'flex', flexDirection: 'column', minWidth: 0 }}
      >
        {!sheet && <ResizeHandle />}

        <header
          style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 8,
            height: headerH, padding: '0 10px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span style={{ color: 'var(--muted)', display: 'grid', placeItems: 'center' }}>
            <Code size={18} />
          </span>
          <span style={{ flex: 1 }} />
          {doc && (
            <span className="tabular" style={{ font: 'var(--t-label-sm)', color: 'var(--faint)' }}>
              {doc.w}×{doc.h}
            </span>
          )}
          <button
            id={CODE_EXPORT_DOM_ID}
            aria-label="Export"
            onClick={runExport}
            disabled={!doc || (activeTab === 'gif' && !!gifProgress)}
            style={{
              height: 28, width: 28, display: 'grid', placeItems: 'center',
              borderRadius: 'var(--r-md)',
              color: doc ? 'var(--muted)' : 'var(--disabled)',
            }}
          >
            <Export size={16} />
          </button>
          <button
            onClick={() => setCodeOpen(false)}
            style={{
              height: 28, padding: '0 10px', borderRadius: 'var(--r-md)',
              font: 'var(--t-label-sm)', color: 'var(--muted)',
            }}
          >
            {sheet ? SHEET_DONE : 'Close'}
          </button>
        </header>

        {/* The tab strip — every format, always visible, one active selection.
            08 §14: "it just exports the one I'm currently at" only means
            something if there is exactly one of these at a time. */}
        <div
          role="tablist"
          aria-label="Format"
          style={{
            flex: 'none', display: 'flex', gap: 2, padding: '6px 8px',
            borderBottom: '1px solid var(--line)', overflowX: 'auto',
          }}
        >
          {tabs.map((t) => {
            const active = t.id === activeTab
            return (
              <button
                key={t.id}
                id={formatTabDomId(t.id)}
                role="tab"
                aria-selected={active}
                onClick={() => setCodeTab(t.id)}
                style={{
                  flex: 'none', height: 28, padding: '0 10px', borderRadius: 'var(--r-md)',
                  font: 'var(--t-label-sm)',
                  color: active ? 'var(--fg)' : 'var(--muted)',
                  background: active ? 'var(--hover)' : 'transparent',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Per-tab options — only the controls that apply to whichever tab is
            active, replacing the popover's inline per-row chevrons. */}
        {showOptions && (
          <div
            style={{
              flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderBottom: '1px solid var(--line)',
            }}
          >
            {activeTab === 'png' && PNG_SCALES.map((scale) => (
              <button
                key={scale}
                id={exportScaleDomId(scale)}
                aria-pressed={pngScale === scale}
                onClick={() => setPngScale(scale)}
                style={{
                  height: 24, minWidth: 24, padding: '0 4px', borderRadius: 'var(--r-sm)',
                  font: 'var(--t-label-sm)',
                  color: pngScale === scale ? 'var(--onsolid)' : 'var(--muted)',
                  background: pngScale === scale ? 'var(--solid)' : 'var(--panel2)',
                }}
              >
                {scale}×
              </button>
            ))}
            {activeTab === 'react' && (
              <button
                id={EXPORT_REACT_LANG_DOM_ID}
                onClick={() => setReactTs((v) => !v)}
                aria-label={reactTs ? 'TypeScript — click for JavaScript' : 'JavaScript — click for TypeScript'}
                style={{
                  height: 24, padding: '0 8px', borderRadius: 'var(--r-pill)',
                  font: 'var(--t-label-sm)', color: 'var(--muted)', background: 'var(--panel2)',
                }}
              >
                {reactTs ? 'TS' : 'JS'}
              </button>
            )}
            {(activeTab === 'react' || activeTab === 'css') && frameCount > 1 && (
              <button
                id={exportAnimatedToggleDomId(activeTab)}
                onClick={() => setAnimated((a) => ({ ...a, [activeTab]: !a[activeTab as 'react' | 'css'] }))}
                aria-pressed={animated[activeTab as 'react' | 'css']}
                aria-label={
                  animated[activeTab as 'react' | 'css'] ? 'Animated — click for one frame' : 'One frame — click to animate'
                }
                style={{
                  height: 24, padding: '0 8px', borderRadius: 'var(--r-pill)',
                  font: 'var(--t-label-sm)',
                  color: animated[activeTab as 'react' | 'css'] ? 'var(--onsolid)' : 'var(--muted)',
                  background: animated[activeTab as 'react' | 'css'] ? 'var(--solid)' : 'var(--panel2)',
                }}
              >
                Animated
              </button>
            )}
          </div>
        )}

        {activeTab === 'gif' && gifProgress && (
          <div
            id={EXPORT_GIF_PROGRESS_DOM_ID}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={gifProgress.total}
            aria-valuenow={gifProgress.done}
            style={{
              flex: 'none', margin: '0 10px', marginTop: 8, height: 4, borderRadius: 'var(--r-sm)',
              background: 'var(--panel2)', overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(gifProgress.done / gifProgress.total) * 100}%`, height: '100%',
                background: 'var(--accent)',
              }}
            />
          </div>
        )}

        <div style={{ flex: '1 1 0', position: 'relative', overflow: 'hidden' }}>
          {activeTab === 'code' ? (
            <>
              <div
                aria-hidden
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: GUTTER,
                  overflow: 'hidden', borderRight: '1px solid var(--line)',
                  background: 'var(--panel2)', zIndex: 1,
                }}
              >
                <div ref={gutter} style={{ padding: `${PAD}px 6px 0 0`, textAlign: 'right' }}>
                  {Array.from({ length: lines }, (_, i) => (
                    <div
                      key={i}
                      className="tabular"
                      style={{
                        font: 'var(--t-mono-sm)',
                        color: i + 1 === lineAt(text, caret) ? 'var(--fg)' : 'var(--faint)',
                      }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {/* The same string, behind the transparent textarea, with the ranges
                  that mean something marked. Not one span per character — three text
                  nodes and two marks, so document size does not matter. */}
              <pre
                ref={overlay}
                aria-hidden
                style={{
                  ...TEXT_BOX,
                  position: 'absolute', inset: 0, color: 'var(--fg)', zIndex: 0,
                  // Hidden, not auto: it is scrolled programmatically from the
                  // textarea and must never grow a scrollbar of its own — a scrollbar
                  // here would take width the textarea does not lose, and every line
                  // would wrap one character earlier than the text above it.
                  overflow: 'hidden',
                }}
              >
                <Marked text={text} error={errorMark} cursor={cursorMark} />
              </pre>

              <textarea
                id={CODE_TEXT_DOM_ID}
                ref={area}
                value={text}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                aria-label="Document source"
                aria-invalid={!!error}
                onChange={(e) => onChange(e.target.value)}
                onScroll={syncScroll}
                onKeyDown={onKeyDown}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                style={{
                  ...TEXT_BOX,
                  position: 'absolute', inset: 0, zIndex: 2,
                  width: '100%', height: '100%', resize: 'none',
                  overflow: 'auto',
                  background: 'transparent',
                  // Transparent text over the overlay's text: one string, drawn once,
                  // so they cannot disagree about where a character is.
                  color: 'transparent',
                  caretColor: 'var(--fg)',
                }}
              />
            </>
          ) : rowError?.tab === activeTab ? (
            <TextPreview result={{ ok: false, error: rowError.message }} />
          ) : (
            <NonCodeTab
              tab={activeTab}
              doc={doc}
              frame={frame}
              svgResult={svgResult}
              cssResult={cssResult}
              reactResult={reactResult}
              asciiResult={asciiResult}
              frameCount={frameCount}
            />
          )}
        </div>

        <footer
          id={CODE_STATUS_DOM_ID}
          style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 8,
            minHeight: 30, padding: '4px 10px', borderTop: '1px solid var(--line)',
            font: 'var(--t-label-sm)',
          }}
        >
          {activeTab === 'code' ? (
            error ? (
              <>
                <span style={{ flex: 1, color: 'var(--diff-remove)' }}>{errorLine(error)}</span>
                {errorMark && (
                  <button
                    onClick={() => reveal(errorMark)}
                    style={{
                      flex: 'none', padding: '2px 8px', borderRadius: 'var(--r-sm)',
                      color: 'var(--diff-remove)', font: 'var(--t-label-sm)',
                    }}
                  >
                    {GO_TO_ERROR}
                  </button>
                )}
              </>
            ) : (
              <>
                <span style={{ flex: 'none', color: 'var(--muted)' }}>{STATUS_VALID}</span>
                {where && (
                  <span className="tabular" style={{ flex: 1, textAlign: 'right', color: 'var(--faint)' }}>
                    {where}
                  </span>
                )}
              </>
            )
          ) : (
            <span style={{ flex: 1, color: 'var(--muted)' }}>
              {activeTab === 'gif' && gifProgress
                ? `Encoding… ${gifProgress.done}/${gifProgress.total}`
                : 'Read-only — generated from the document'}
            </span>
          )}
        </footer>
      </aside>
    </>
  )
}

/** Everything but the Code tab: a read-only preview, built from the same
 *  exporter the Export button uses. See docs/specs/08-exporters.md §14.4. */
function NonCodeTab({
  tab, doc, frame, svgResult, cssResult, reactResult, asciiResult, frameCount,
}: {
  tab: Exclude<FormatTabId, 'code'>
  doc: Doc | null
  frame: number
  svgResult: ExportResult | null
  cssResult: ExportResult | null
  reactResult: ExportResult | null
  asciiResult: ExportResult | null
  frameCount: number
}) {
  if (!doc) return null
  switch (tab) {
    case 'svg': return svgResult && <TextPreview result={svgResult} />
    case 'css': return cssResult && <TextPreview result={cssResult} />
    case 'react': return reactResult && <TextPreview result={reactResult} />
    case 'ascii': return asciiResult && <TextPreview result={asciiResult} />
    case 'png':
      return (
        <ImagePreview
          load={() => import('@/lib/exporters/png').then((m) => m.exportPng(doc, { frame, scale: 4 }))}
          deps={[doc.id, frame, doc.w, doc.h]}
        />
      )
    case 'gif':
      return (
        <ImagePreview
          load={() => import('@/lib/exporters/png').then((m) => m.exportPng(doc, { frame, scale: 4 }))}
          deps={[doc.id, frame, doc.w, doc.h]}
          caption={`${frameCount} frames — Export encodes the animated GIF`}
        />
      )
    case 'spritesheet':
      return (
        <ImagePreview
          load={() => import('@/lib/exporters/spritesheet').then((m) => m.exportSpriteSheet(doc))}
          deps={[doc.id, doc.frames.length, doc.w, doc.h]}
        />
      )
  }
}

// ─── the overlay's marks ─────────────────────────────────────────────────────

/**
 * How each token kind is painted.
 *
 * Chosen for THIS document rather than for JSON in general (§9.1). The file is
 * a short header, a palette, and then a wall of pixel rows — so the scaffolding
 * recedes to the base colour and the artwork is the most legible thing on the
 * screen, which is the opposite of what a generic JSON theme would do.
 */
const INK: Record<TokenKind, string> = {
  key: 'var(--muted)',
  string: 'var(--fg)',
  number: 'var(--fg)',
  literal: 'var(--fg)',
  /** The content. Everything else in the file exists to hold these up. */
  pixels: 'var(--fg)',
  /** Text stays legible; the colour itself is shown by the underline below. */
  colour: 'var(--fg)',
}

/**
 * The text, coloured, with at most two ranges marked.
 *
 * One span per *token*, and punctuation and whitespace get none — so a 256×256
 * document is a few hundred nodes rather than the seventy thousand §9.1
 * originally assumed a span per character would cost. `pieces` does the cutting;
 * this only decides what each run looks like.
 */
function Marked({
  text, error, cursor,
}: {
  text: string
  error: Range | null
  cursor: Range | null
}) {
  const tokens = useMemo(() => tokenizeJson(text), [text])

  // The error wins where the two overlap: a red wash and a blue one on the same
  // character is a muddy character, and the error is the one that needs an
  // answer.
  const marks: Marked_[] = []
  if (error) marks.push({ from: error.from, to: error.to, kind: 'error' })
  if (cursor && (!error || cursor.to <= error.from || cursor.from >= error.to)) {
    marks.push({ from: cursor.from, to: cursor.to, kind: 'cursor' })
  }

  const runs = useMemo(() => pieces(text.length, tokens, marks), [text, tokens, JSON.stringify(marks)]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {runs.map((p, i) => {
        const body = text.slice(p.from, p.to)
        if (!p.kind && !p.mark) return body
        const style: React.CSSProperties = {
          color: p.kind ? INK[p.kind] : 'inherit',
        }
        if (p.colour) {
          // The palette, drawn in its own colours — the thing that makes this
          // read as an artwork file rather than as configuration.
          //
          // A BAR UNDER the text rather than the text colour, for two reasons
          // that both matter. The palette's near-black ink as text on a dark
          // panel is unreadable, and any colour a document happens to hold
          // could be; the text stays `--fg` and the swatch carries the colour.
          // (No hex literal in that sentence on purpose — `tokens.test.ts`
          // scans this file for them and cannot tell prose from a value, which
          // is the right way round for a guard to be wrong.) And it is
          // layout-safe,
          // which the overlay absolutely requires — anything that changed a
          // glyph's advance would slide every mark off its character.
          //
          // An inset box-shadow rather than `text-decoration`, so a hairline can
          // go beneath it: a colour close to the panel's own is a swatch you
          // cannot find, and each theme has a whole end of the palette like
          // that. The hairline says "there is a swatch here" and the swatch
          // still tells the truth about the colour.
          style.boxShadow = [
            // token-exempt: an artwork colour is document data, not a design token
            `inset 0 -2px 0 ${p.colour}`,
            'inset 0 -3px 0 var(--line-strong)',
          ].join(', ')
        }
        if (p.mark) {
          style.background = p.mark === 'error'
            ? 'color-mix(in srgb, var(--diff-remove) 32%, transparent)'
            : 'var(--accent-soft)'
          // A one-character mark is easy to miss on a wall of dots, so it gets
          // an outline as well as a wash.
          style.outline = p.mark === 'error'
            ? '1px solid var(--diff-remove)'
            : '1px solid var(--accent)'
        }
        return p.mark ? (
          <mark key={i} style={style}>{body}</mark>
        ) : (
          <span key={i} style={style}>{body}</span>
        )
      })}
    </>
  )
}

// ─── the divider ─────────────────────────────────────────────────────────────

/**
 * §1's resizable divider, 320–800 and persisted.
 *
 * Pointer capture rather than window listeners: dragging fast enough to leave
 * the 6px strip is normal, and without capture the drag simply stops there.
 *
 * §14.2: the panel is centred now, not flush against the window's right edge,
 * so a drag on this (left) edge has to grow the box symmetrically around its
 * own midpoint or the box visibly slides sideways while being resized.
 */
function ResizeHandle() {
  const setCodeWidth = useEditorStore((s) => s.setCodeWidth)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize code panel"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        setCodeWidth(2 * (window.innerWidth / 2 - e.clientX))
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        setDragging(false)
        try {
          localStorage.setItem(CODE_WIDTH_KEY, String(useEditorStore.getState().codeWidth))
        } catch {
          // Private mode. The width is still live for this session, which is
          // the part that matters; only remembering it is lost.
        }
      }}
      style={{
        position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, zIndex: 3,
        cursor: 'col-resize',
        background: dragging ? 'var(--accent)' : 'transparent',
      }}
    />
  )
}

// ─── shared metrics ──────────────────────────────────────────────────────────

const GUTTER = 44
const PAD = 8

/**
 * The overlay and the textarea must lay text out identically, to the pixel, or
 * a mark drifts off the character it marks. One object, spread into both, so
 * there is nothing to keep in sync by hand.
 */
const TEXT_BOX: React.CSSProperties = {
  margin: 0,
  padding: `${PAD}px 10px ${PAD}px ${GUTTER + 8}px`,
  font: 'var(--t-mono-sm)',
  // `pre`, not `pre-wrap`: a wrapped 256-character pixel row stops being a row,
  // and the whole point of the format is that a row of text is a row of pixels.
  whiteSpace: 'pre',
  border: 'none',
  outline: 'none',
  tabSize: 2,
}

/** The rendered line height, for scrolling to a line. */
function lineHeight(el: HTMLElement): number {
  const h = parseFloat(getComputedStyle(el).lineHeight)
  return Number.isFinite(h) && h > 0 ? h : 16
}

/**
 * `⌘/` — §1. Lives here rather than in `app/page.tsx` so the panel owns its key.
 *
 * **Deliberately NOT behind `isTyping`**, unlike ⌘N, ⌘O and ⌘V. That guard
 * exists because those keys mean something *inside a text field* — new, open,
 * paste — and stealing them there would break the field (spec 17 §3). ⌘/ means
 * nothing in a field. Guarding it made the panel's own textarea the one place
 * the shortcut that closes the panel did not work, which is the opposite of
 * what the guard is for.
 *
 * The rule, now that there are four of these: guard a key the field itself
 * needs; do not guard a chord it has no use for.
 */
export function useCodeShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== '/') return
      e.preventDefault()
      const s = useEditorStore.getState()
      s.setCodeOpen(!s.codeOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
