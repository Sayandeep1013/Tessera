'use client'

import { useEffect, useState } from 'react'
import { Canvas } from '@/components/Canvas'
import { TopBar, ToolRail, ZoomBar } from '@/components/Chrome'
import { AgentPanel } from '@/components/AgentPanel'
import { LayersPanel } from '@/components/Layers'
import { CodePanel, useCodeShortcut } from '@/components/CodePanel'
import { chromeFor, useTier } from '@/lib/editor/breakpoint'
import { MosaicLoader } from '@/components/Loaders'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { createDoc } from '@/lib/artwork-core/create'
import { nanoid } from 'nanoid'
import { loadLatestDraft } from '@/lib/persist/idb'
import { fitViewport, stepScale } from '@/lib/editor/viewport'
// Shared with Chrome.tsx, which owns the File menu's own shortcuts. Spec 17 §3:
// one guard for "is the user typing", not one per handler.
import { isTyping } from '@/lib/editor/keys'
import { NOTICE_MS } from '@/lib/editor/paste'
import { serializeDoc } from '@/lib/artwork-core/codec'

export default function EditorPage() {
  const doc = useDocStore((s) => s.doc)
  const layersOpen = useEditorStore((s) => s.layersOpen)
  // The panel is withheld on a phone (see breakpoint.ts). Gating here as well as
  // on the button means a resize while it is open puts it away rather than
  // leaving it stranded over a 320px canvas.
  const { showLayers } = chromeFor(useTier())

  /**
   * The editor does not server-render.
   *
   * Everything it displays comes from somewhere the server cannot see: the
   * document from IndexedDB, the theme from localStorage, the viewport from a
   * measured canvas rect. Prerendering it produced markup that could not match —
   * React reported a hydration mismatch on the undo and redo buttons on every
   * single load, and "this won't be patched up" means the client keeps whatever
   * the server guessed.
   *
   * Rendering the shell on the server and mounting the editor after hydration
   * removes the whole class of bug rather than one instance of it, and costs
   * nothing visible: the boot loader occupies exactly this gap and gates itself,
   * so a fast load still shows nothing at all.
   */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const ready = mounted && doc

  // ⌘/ — spec 07 §1. The panel owns its own key; this is only where the hook
  // has to be called from, because the panel is not mounted until it is open.
  useCodeShortcut()

  // ── initial document ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const found = await loadLatestDraft()
        if (cancelled) return
        if (found && 'doc' in found) {
          useDocStore.getState().setDoc(found.doc)
          return
        }
        if (found && 'corrupt' in found) {
          // Never delete work we cannot read — keep it and say so, and do not
          // take the saying-so away on a timer.
          useEditorStore
            .getState()
            .setNotice("Couldn't open your last drawing. It's still saved.", true)
        }
      } catch {
        /* IndexedDB unavailable (private mode) — fall through to a starter */
      }
      // A blank canvas, not the face starter. Opening on somebody else's drawing
      // makes the first thing you do "delete this"; the examples live in the File
      // menu, where they are something you reach for rather than something you
      // are handed.
      if (!cancelled) useDocStore.getState().setDoc(createDoc({ id: nanoid() }))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * A read-only window hook for the probe scripts in tools/.
   *
   * Development only, and deliberately without a setter: the probes need to
   * assert which LAYER a stroke landed on, which is not observable from a
   * screenshot, and `commit()` stays the only way anything writes the document.
   * tools/probe-tools-ui.ts carried a stub for this that referenced a global
   * nothing ever defined, so its per-pixel assertions never ran.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const w = window as unknown as { __tessera?: unknown }
    w.__tessera = {
      layers: () =>
        useDocStore.getState().doc?.frames[useDocStore.getState().frame]?.layers.map((l) => ({
          n: l.n,
          hidden: Boolean(l.hidden),
          px: Array.from(l.px),
        })) ?? null,
      active: () => useDocStore.getState().layer,
      // Layers alone cannot answer "is this 64x36 or 36x64" — a px array of
      // 2304 entries is the same either way — and that is exactly what the
      // resize probe has to check.
      size: () => {
        const d = useDocStore.getState().doc
        return d ? { w: d.w, h: d.h } : null
      },
      // Duplicate's whole contract is "a fresh id, and the original survives".
      // Neither half is visible on screen — the header shows the name and
      // nothing shows the id — so the File menu probe reads it here.
      identity: () => {
        const d = useDocStore.getState().doc
        return d ? { id: d.id, name: d.name } : null
      },
      // Paste image's whole contract is "reduced to N colours, and the palette
      // is still legal". Neither half is on screen, and the palette popover
      // shows swatches rather than a count.
      palette: () => useDocStore.getState().doc?.palette.map((p) => p.c) ?? null,
      // Spec 07 §1 and §8: the code panel's text must be byte-identical to what
      // `Download .tessera.json` writes. Both are serializeDoc, so the probe
      // proves it by comparing the textarea against this.
      source: () => {
        const d = useDocStore.getState().doc
        return d ? serializeDoc(d) : null
      },
      viewport: () => useEditorStore.getState().viewport,
    }
    return () => {
      delete w.__tessera
    }
  }, [])

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const ed = useEditorStore.getState()
      const ds = useDocStore.getState()

      if (e.key === ' ' && !isTyping(e.target)) {
        e.preventDefault()
        if (!ed.panning) ed.setPanning(true)
        return
      }
      if (isTyping(e.target)) return

      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? ds.redo() : ds.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        ds.redo()
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (ds.doc) download(`${ds.doc.name || 'artwork'}.tessera.json`, serializeDoc(ds.doc))
        return
      }
      if (mod) return

      switch (e.key.toLowerCase()) {
        case 'b': ed.setTool('brush'); break
        case 'e': ed.setTool('eraser'); break
        case 'f': ed.setTool('fill'); break
        case 'r': ed.setTool('rect'); break
        case 'i': ed.setTool('eyedropper'); break
        case 'g': ed.toggleGrid(); break
        case '[': ed.setBrushSize(ed.brushSize - 1); break
        case ']': ed.setBrushSize(ed.brushSize + 1); break
        case '+': case '=': ed.setViewport({ ...ed.viewport, scale: stepScale(ed.viewport.scale, 1) }); break
        case '-': ed.setViewport({ ...ed.viewport, scale: stepScale(ed.viewport.scale, -1) }); break
        case '1': {
          const el = document.querySelector('canvas')
          if (el && ds.doc) {
            const r = el.getBoundingClientRect()
            ed.setViewport(fitViewport(ds.doc, r.width, r.height))
          }
          break
        }
      }
    }

    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') useEditorStore.getState().setPanning(false)
    }

    const beforeUnload = () => void useDocStore.getState().flushSave()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--surface)',
        color: 'var(--fg)',
      }}
    >
      {/* The header reserves its height on the server so nothing jumps when the
          real chrome mounts. */}
      {ready ? <TopBar /> : <div style={{ flex: 'none', height: 48 }} />}

      {/* A row, because the code panel is a SPLIT and not an overlay (spec 07
          §1): the canvas gives up width to it rather than being covered by it.
          The canvas's own ResizeObserver re-centres the view by half the change,
          so opening the panel slides the artwork over instead of hiding half of
          it (§9.3). */}
      <div style={{ flex: '1 1 0', display: 'flex', minHeight: 0, minWidth: 0 }}>
        <main style={{ flex: '1 1 0', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
          {ready ? (
            <>
              <Canvas />
              <ToolRail />
              <ZoomBar />
              {layersOpen && showLayers && (
                <LayersPanel onClose={() => useEditorStore.getState().setLayersOpen(false)} />
              )}
              <AgentPanel />
            </>
          ) : (
            // Boot previously rendered an empty <main> — a blank rectangle that is
            // indistinguishable from a broken app.
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <MosaicLoader />
            </div>
          )}
        </main>
        {ready && <CodePanel />}
      </div>
      <Notice />
    </div>
  )
}

/**
 * The app's one status line. See docs/specs/17-file-menu.md §9.6.
 *
 * Its own component so that a message arriving does not re-render the editor,
 * and so the dismissal timer lives with the thing it dismisses. It reads
 * `notice.seq` rather than the text, because two identical messages in a row is
 * a real case — pressing ⌘V twice with text on the clipboard — and a string
 * that does not change cannot restart a timer.
 *
 * Dismissable by click as well as by time: the one thing a status line must
 * never do is sit over the artwork it is describing.
 */
function Notice() {
  const notice = useEditorStore((s) => s.notice)
  const setNotice = useEditorStore((s) => s.setNotice)
  const seq = notice?.seq
  const sticky = notice?.sticky

  useEffect(() => {
    if (seq === undefined || sticky) return
    const t = setTimeout(() => useEditorStore.getState().setNotice(null), NOTICE_MS)
    return () => clearTimeout(t)
  }, [seq, sticky])

  if (!notice) return null
  return (
    // The live region is the wrapper, not the button. `role="status"` on the
    // button itself would replace its button semantics, leaving a control that
    // a screen reader cannot tell is a control — and this one is clickable.
    // Polite by definition, so it never interrupts, which is right for
    // something that has already happened.
    <div
      role="status"
      style={{
        position: 'absolute', left: '50%', top: 60, transform: 'translateX(-50%)',
        maxWidth: 'min(520px, calc(100vw - 32px))', zIndex: 50,
      }}
    >
      <button
        onClick={() => setNotice(null)}
        style={{
          width: '100%', textAlign: 'center',
          background: 'var(--panel)', color: 'var(--fg)', font: 'var(--t-copy-sm)',
          padding: '8px 14px', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-lg)',
        }}
      >
        {notice.text}
      </button>
    </div>
  )
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
