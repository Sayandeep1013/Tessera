'use client'

/**
 * The full-viewport canvas. See docs/specs/04-renderer.md and 05-editor.md.
 *
 * Owns: sizing, the rAF render loop, and pointer input. The stroke buffer lives
 * here; one gesture commits exactly one command.
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  renderCursor, renderDiffOverlay, renderDoc, readTheme, resizeCanvas, type ThemeColors,
} from '@/lib/renderer/canvas'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { useAiStore } from '@/lib/store/ai'
import { fitViewport, isInside, nextScale, screenToDoc, snapScale, zoomAt } from '@/lib/editor/viewport'
import { brushMask } from '@/lib/editor/brush'
import { floodFillPoints, linePoints } from '@/lib/artwork-core/ops'
import { paintCommand, type PaintCell } from '@/lib/artwork-core/commands'

export function Canvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<ThemeColors | null>(null)
  const dirty = useRef(true)

  /** key = y*w+x, so re-crossing a cell in one stroke updates rather than duplicates */
  const stroke = useRef<Map<number, PaintCell> | null>(null)
  const lastCell = useRef<{ x: number; y: number } | null>(null)
  const panFrom = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const markDirty = useCallback(() => {
    dirty.current = true
  }, [])

  // ── sizing ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = ref.current
    if (!wrap || !canvas) return

    const apply = () => {
      const r = wrap.getBoundingClientRect()
      resizeCanvas(canvas, r.width, r.height)
      themeRef.current = readTheme(document.documentElement)
      const { doc } = useDocStore.getState()
      const vp = useEditorStore.getState().viewport
      // First real layout: fit the artwork rather than leaving it at 0,0.
      if (doc && vp.offsetX === 0 && vp.offsetY === 0) {
        useEditorStore.getState().setViewport(fitViewport(doc, r.width, r.height))
      }
      markDirty()
    }

    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(wrap)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onTheme = () => {
      themeRef.current = readTheme(document.documentElement)
      markDirty()
    }
    mq.addEventListener('change', onTheme)
    return () => {
      ro.disconnect()
      mq.removeEventListener('change', onTheme)
    }
  }, [markDirty])

  // ── render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!dirty.current) return
      dirty.current = false

      const canvas = ref.current
      const ctx = canvas?.getContext('2d', { alpha: false })
      const theme = themeRef.current
      if (!canvas || !ctx || !theme) return

      const { doc, frame } = useDocStore.getState()
      if (!doc) return
      const { viewport, showGrid, cursor, brushSize, tool } = useEditorStore.getState()
      const ai = useAiStore.getState()

      // During review the canvas shows the PREVIEW, never the document — the
      // document is not mutated until Accept.
      const reviewing = ai.status === 'review' && ai.proposal !== null
      const showAfter = reviewing && ai.view === 'after'
      const shown = showAfter ? ai.proposal!.preview : doc

      renderDoc(ctx, shown, frame, viewport, theme, { showGrid, showChecker: true })

      if (showAfter) {
        renderDiffOverlay(ctx, ai.proposal!.diff, viewport, theme)
      } else if (cursor && isInside(cursor.x, cursor.y, doc) && tool !== 'eyedropper') {
        renderCursor(ctx, cursor.x, cursor.y, brushSize, viewport, theme)
      }
    }
    raf = requestAnimationFrame(tick)

    const unsubDoc = useDocStore.subscribe(markDirty)
    const unsubEd = useEditorStore.subscribe(markDirty)
    const unsubAi = useAiStore.subscribe(markDirty)
    return () => {
      cancelAnimationFrame(raf)
      unsubDoc()
      unsubEd()
      unsubAi()
    }
  }, [markDirty])

  // ── painting ──────────────────────────────────────────────────────────────
  const paintAt = useCallback((x: number, y: number) => {
    const { doc, frame } = useDocStore.getState()
    const buf = stroke.current
    if (!doc || !buf) return
    const { tool, colorIndex, brushSize, brushShape } = useEditorStore.getState()
    const value = tool === 'eraser' ? 0 : colorIndex
    const px = doc.frames[frame]!.layers[0]!.px

    for (const [dx, dy] of brushMask(brushShape, brushSize)) {
      const cx = x + dx
      const cy = y + dy
      if (!isInside(cx, cy, doc)) continue // ignore, never clamp — clamping smears along the edge
      const key = cy * doc.w + cx
      const existing = buf.get(key)
      const before = existing ? existing[2] : px[key]!
      buf.set(key, [cx, cy, before, value])
      px[key] = value // immediate feedback; the document is committed on pointerup
    }
    dirty.current = true
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = ref.current
      const { doc } = useDocStore.getState()
      if (!canvas || !doc) return
      const ed = useEditorStore.getState()
      const rect = canvas.getBoundingClientRect()

      // Painting is blocked while a proposal is under review — accept or reject
      // first, so an edit can never land half on top of a pending preview.
      if (useAiStore.getState().status === 'review' && e.button === 0 && !ed.panning) return

      // pan: middle button or space held
      if (e.button === 1 || ed.panning) {
        panFrom.current = {
          x: e.clientX,
          y: e.clientY,
          ox: ed.viewport.offsetX,
          oy: ed.viewport.offsetY,
        }
        canvas.setPointerCapture(e.pointerId)
        return
      }
      if (e.button !== 0) return

      const { x, y } = screenToDoc(e.clientX, e.clientY, rect, ed.viewport)
      if (!isInside(x, y, doc)) return
      canvas.setPointerCapture(e.pointerId)

      const px = doc.frames[useDocStore.getState().frame]!.layers[0]!.px

      if (ed.tool === 'eyedropper') {
        ed.setColorIndex(px[y * doc.w + x]!)
        return
      }

      if (ed.tool === 'fill') {
        const target = ed.colorIndex
        const cells: PaintCell[] = []
        for (const [fx, fy] of floodFillPoints(px, doc.w, doc.h, x, y)) {
          cells.push([fx, fy, px[fy * doc.w + fx]!, target])
        }
        useDocStore.getState().commit(paintCommand('Fill', useDocStore.getState().frame, cells))
        return
      }

      stroke.current = new Map()
      lastCell.current = { x, y }
      paintAt(x, y)
    },
    [paintAt],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = ref.current
      const { doc } = useDocStore.getState()
      if (!canvas || !doc) return
      const ed = useEditorStore.getState()
      const rect = canvas.getBoundingClientRect()

      if (panFrom.current) {
        const p = panFrom.current
        ed.setViewport({
          ...ed.viewport,
          offsetX: p.ox + (e.clientX - p.x),
          offsetY: p.oy + (e.clientY - p.y),
        })
        return
      }

      const { x, y } = screenToDoc(e.clientX, e.clientY, rect, ed.viewport)
      ed.setCursor({ x, y })

      if (!stroke.current) return
      const last = lastCell.current
      if (last && (last.x !== x || last.y !== y)) {
        // Interpolate: at 60Hz a fast drag skips cells and the stroke comes out
        // dotted without this.
        for (const [ix, iy] of linePoints(last.x, last.y, x, y)) paintAt(ix, iy)
      } else if (!last) {
        paintAt(x, y)
      }
      lastCell.current = { x, y }
    },
    [paintAt],
  )

  const endStroke = useCallback(() => {
    panFrom.current = null
    const buf = stroke.current
    stroke.current = null
    lastCell.current = null
    if (!buf) return
    const { frame } = useDocStore.getState()
    const label = useEditorStore.getState().tool === 'eraser' ? 'Erase' : 'Brush'
    useDocStore.getState().commit(paintCommand(label, frame, buf.values()))
  }, [])

  const onPointerCancel = useCallback(() => {
    // Discard the buffer and repaint from the document — nothing is committed.
    const buf = stroke.current
    const { doc, frame } = useDocStore.getState()
    if (buf && doc) {
      const px = doc.frames[frame]!.layers[0]!.px
      for (const [x, y, before] of buf.values()) px[y * doc.w + x] = before
    }
    stroke.current = null
    lastCell.current = null
    panFrom.current = null
    dirty.current = true
  }, [])

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = ref.current
    if (!canvas) return
    const ed = useEditorStore.getState()
    const rect = canvas.getBoundingClientRect()
    const target = e.deltaY < 0 ? nextScale(ed.viewport.scale, 1) : nextScale(ed.viewport.scale, -1)
    ed.setViewport(
      zoomAt(ed.viewport, snapScale(target), e.clientX - rect.left, e.clientY - rect.top),
    )
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: '48px 0 0 0' }}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Pixel artwork canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => useEditorStore.getState().setCursor(null)}
        onWheel={onWheel}
        style={{ cursor: useEditorStore.getState().panning ? 'grab' : 'crosshair' }}
      />
    </div>
  )
}
