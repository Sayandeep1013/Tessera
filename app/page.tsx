'use client'

import { useEffect, useState } from 'react'
import { Canvas } from '@/components/Canvas'
import { TopBar, ToolRail, ZoomBar } from '@/components/Chrome'
import { AgentPanel } from '@/components/AgentPanel'
import { MosaicLoader } from '@/components/Loaders'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { loadStarter } from '@/lib/artwork-core/create'
import { loadLatestDraft } from '@/lib/persist/idb'
import { fitViewport, nextScale } from '@/lib/editor/viewport'
import { serializeDoc } from '@/lib/artwork-core/codec'

export default function EditorPage() {
  const [notice, setNotice] = useState<string | null>(null)
  const doc = useDocStore((s) => s.doc)

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
      if (!cancelled) useDocStore.getState().setDoc(loadStarter('face'))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

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
        case '+': case '=': ed.setViewport({ ...ed.viewport, scale: nextScale(ed.viewport.scale, 1) }); break
        case '-': ed.setViewport({ ...ed.viewport, scale: nextScale(ed.viewport.scale, -1) }); break
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
      <TopBar />
      <main style={{ flex: '1 1 0', position: 'relative', overflow: 'hidden' }}>
        {doc ? (
          <>
            <Canvas />
            <ToolRail />
            <ZoomBar />
            <AgentPanel />
          </>
        ) : (
          // Boot previously rendered an empty <main> — a blank rectangle that is
          // indistinguishable from a broken app. The loader gates itself, so a
          // document that resolves quickly still shows nothing at all.
          <div
            style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            }}
          >
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
