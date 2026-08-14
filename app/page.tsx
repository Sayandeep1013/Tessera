'use client'

import { useEffect, useState } from 'react'
import { Canvas } from '@/components/Canvas'
import { TopBar, ToolRail, ZoomBar } from '@/components/Chrome'
import { AgentPanel } from '@/components/AgentPanel'
import { LayersPanel } from '@/components/Layers'
import { TimelinePanel, TIMELINE_DOM_ID, TIMELINE_HEIGHT } from '@/components/Timeline'
import { CodePanel, useCodeShortcut } from '@/components/CodePanel'
import { chromeFor, useTier } from '@/lib/editor/breakpoint'
import { MosaicLoader } from '@/components/Loaders'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { usePlaybackStore } from '@/lib/store/playback'
import { createDoc } from '@/lib/artwork-core/create'
import { cloneFrame } from '@/lib/artwork-core/commands'
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
  const timelineOpen = useEditorStore((s) => s.timelineOpen)
  // Both panels are withheld on a phone (see breakpoint.ts). Gating here as
  // well as on the button means a resize while one is open puts it away
  // rather than leaving it stranded over a 320px canvas.
  const c = chromeFor(useTier())
  const { showLayers, showTimeline } = c
  const timelineShown = timelineOpen && showTimeline

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
          // Opacity and blend mode (14-layers.md §12) aren't visible in px, and
          // the probe needs to check a commit landed with the right value, not
          // just that pixels moved.
          o: l.o ?? 100,
          mode: l.mode ?? 'normal',
          px: Array.from(l.px),
        })) ?? null,
      active: () => useDocStore.getState().layer,
      // Unit F: the timeline probe needs the active frame index and the
      // document's frame count/durations without pulling every layer's pixels
      // for every frame — `layers()` already answers the active frame's own
      // layers.
      frame: () => useDocStore.getState().frame,
      frames: () =>
        useDocStore.getState().doc?.frames.map((f) => ({ ms: f.ms, layerCount: f.layers.length })) ?? null,
      playing: () => usePlaybackStore.getState().playing,
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

      // Spec 10 §2: Space collides with hold-to-pan, and the resolution is
      // decided here rather than left to discovery — it toggles playback only
      // when the timeline has focus, and pans everywhere else. `e.repeat` is
      // guarded because holding the key fires many keydowns, and play/pause is
      // a flip, not a hold, the way panning is.
      if (e.key === ' ' && !isTyping(e.target)) {
        const inTimeline = (e.target as HTMLElement | null)?.closest(`#${TIMELINE_DOM_ID}`)
        if (inTimeline) {
          e.preventDefault()
          if (!e.repeat) usePlaybackStore.getState().toggle()
          return
        }
        e.preventDefault()
        if (!ed.panning) ed.setPanning(true)
        return
      }
      if (isTyping(e.target)) return

      // `⌥D` / `⌥⌫` — spec 10 §2. `e.code` rather than `e.key`: Option remaps
      // `e.key` to a different character on a Mac (Option+D types "∂"), and
      // `KeyD`/`Backspace` are the same physical keys on every layout.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.code === 'KeyD') {
          e.preventDefault()
          const d = ds.doc
          const source = d?.frames[ds.frame]
          if (source) {
            const at = ds.frame + 1
            ds.commit({ type: 'frame_add', label: 'Duplicate frame', at, frame: cloneFrame(source) })
            ds.setFrame(at)
          }
          return
        }
        if (e.code === 'Backspace') {
          e.preventDefault()
          const d = ds.doc
          const target = d?.frames[ds.frame]
          if (d && target && d.frames.length > 1) {
            ds.commit({ type: 'frame_delete', label: 'Delete frame', at: ds.frame, frame: cloneFrame(target) })
          }
          return
        }
      }

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
        // Spec 10 §2: `,` / `.` step the active frame, `⇧,` / `⇧.` move it.
        // Shift changes what a comma/period key REPORTS as `e.key` (US layout:
        // `<` / `>`), so the shifted cases are separate switch arms rather than
        // an `e.shiftKey` check inside one — the same reason `⌥D` above reads
        // `e.code` instead.
        case ',': ds.setFrame(ds.frame - 1); break
        case '.': ds.setFrame(ds.frame + 1); break
        case '<': {
          const to = ds.frame - 1
          if (to < 0) break
          ds.commit({ type: 'frame_move', label: 'Reorder frame', from: ds.frame, to })
          ds.setFrame(to)
          break
        }
        case '>': {
          const to = ds.frame + 1
          if (!ds.doc || to >= ds.doc.frames.length) break
          ds.commit({ type: 'frame_move', label: 'Reorder frame', from: ds.frame, to })
          ds.setFrame(to)
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

      {/* The code panel is a centred modal now (spec 07 §9.11 / 08 §14), not a
          split — it no longer takes width from the canvas, so it renders
          alongside the other overlays below rather than as a sibling flex
          column. `<main>` no longer loses width when it opens, so there is
          nothing left for the canvas's ResizeObserver to re-centre for. */}
      <main style={{ flex: '1 1 0', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        {ready ? (
          <>
            <Canvas />
            <ToolRail />
            <ZoomBar />
            {timelineShown && (
              <TimelinePanel onClose={() => useEditorStore.getState().setTimelineOpen(false)} />
            )}
            {layersOpen && showLayers && (
              <LayersPanel
                onClose={() => useEditorStore.getState().setLayersOpen(false)}
                topOffset={timelineShown ? TIMELINE_HEIGHT + c.inset : 0}
              />
            )}
            <AgentPanel />
            <CodePanel />
          </>
        ) : (
          // Boot previously rendered an empty <main> — a blank rectangle that is
          // indistinguishable from a broken app.
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <MosaicLoader />
          </div>
        )}
      </main>
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
