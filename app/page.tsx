'use client'

import { useEffect, useState } from 'react'
import { Canvas } from '@/components/Canvas'
import { TopBar, ToolRail, ZoomBar } from '@/components/Chrome'
import { AgentPanel } from '@/components/AgentPanel'
import { LayersPanel } from '@/components/Layers'
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
import { serializeDoc } from '@/lib/artwork-core/codec'

export default function EditorPage() {
  const [notice, setNotice] = useState<string | null>(null)
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
          // Never delete work we cannot read — keep it and say so.
          setNotice("Couldn't open your last drawing. It's still saved.")
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

      <main style={{ flex: '1 1 0', position: 'relative', overflow: 'hidden' }}>
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
      {notice && (
        <div
          role="status"
          style={{
            position: 'absolute', left: '50%', top: 60, transform: 'translateX(-50%)',
            background: 'var(--panel)', color: 'var(--fg)', fontSize: 12,
            padding: '8px 14px', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
          }}
        >
          {notice}
        </div>
      )}
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
