'use client'

/**
 * The full-viewport canvas. See docs/specs/04-renderer.md and 05-editor.md.
 *
 * Owns: sizing, the rAF render loop, and pointer input. The stroke buffer lives
 * here; one gesture commits exactly one command.
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  renderCursor, renderDiffOverlay, renderDoc, renderSelection, readTheme, resizeCanvas,
  type ThemeColors,
} from '@/lib/renderer/canvas'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { useAiStore } from '@/lib/store/ai'
import {
  MAX_SCALE, MIN_SCALE, clampScale, fitViewport, isInside, screenToDoc, zoomAt,
} from '@/lib/editor/viewport'
import { brushMask } from '@/lib/editor/brush'
import { mirrored } from '@/lib/editor/symmetry'
import { floodFillPoints, linePoints, rectPoints } from '@/lib/artwork-core/ops'
import { compositeAt } from '@/lib/artwork-core/layers'
import { densityFor, ditherPasses, gradientCells } from '@/lib/editor/dither'
import { paintCommand, type PaintCell } from '@/lib/artwork-core/commands'

/**
 * Radians-free feel constant: 0.0015 makes a typical trackpad flick move about
 * half an octave, and a mouse notch (deltaY 100) about 14%. Tuned by hand — the
 * only honest way to set a feel constant.
 */
const ZOOM_SENSITIVITY = 0.0015

export function Canvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<ThemeColors | null>(null)
  /** Fractional scale between wheel events — see the wheel handler. */
  const zoomAccum = useRef(0)
  /** Drag origin for the shape tools (rect, gradient, marquee, move). */
  const dragFrom = useRef<{ x: number; y: number } | null>(null)
  /** The pixels a move drag lifted, and where they came from. */
  const moving = useRef<{ cells: Array<[number, number, number]>; from: { x: number; y: number } } | null>(null)
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

    const onTheme = () => {
      themeRef.current = readTheme(document.documentElement)
      markDirty()
    }

    /**
     * Two triggers, because there are two ways the theme changes and watching
     * only one of them was a real bug.
     *
     * The media query catches the OS switching. It does NOT catch the theme
     * button in the top bar, which toggles a `dark`/`light` class on
     * documentElement — so drawing in dark mode and then switching to light
     * left the canvas holding the dark palette, and the artwork sat on a black
     * slab on a white page until something else happened to invalidate the
     * cached theme. Harmless while --art-bg was white in both themes; the
     * moment it started following the theme, it was the most visible thing on
     * the screen.
     */
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onTheme)
    const classes = new MutationObserver(onTheme)
    classes.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      ro.disconnect()
      mq.removeEventListener('change', onTheme)
      classes.disconnect()
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
      const { viewport, gridMode, transparencyGrid, cursor, brushSize, tool } = useEditorStore.getState()
      const ai = useAiStore.getState()

      // During review the canvas shows the PREVIEW, never the document — the
      // document is not mutated until Accept.
      const reviewing = ai.status === 'review' && ai.proposal !== null
      const showAfter = reviewing && ai.view === 'after'
      const shown = showAfter ? ai.proposal!.preview : doc

      renderDoc(ctx, shown, frame, viewport, theme, { gridMode, transparencyGrid })

      if (showAfter) {
        renderDiffOverlay(ctx, ai.proposal!.diff, viewport, theme)
      } else if (cursor && isInside(cursor.x, cursor.y, doc) && tool !== 'eyedropper') {
        renderCursor(ctx, cursor.x, cursor.y, brushSize, viewport, theme)
      }

      const sel = useEditorStore.getState().selection
      if (sel) renderSelection(ctx, sel, viewport)
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
    const { doc, frame, layer } = useDocStore.getState()
    const buf = stroke.current
    if (!doc || !buf) return
    const { tool, colorIndex, brushSize, brushShape } = useEditorStore.getState()
    const value = tool === 'eraser' ? 0 : colorIndex
    const px = doc.frames[frame]?.layers[layer]?.px
    if (!px) return

    const density = densityFor(useEditorStore.getState().dither)

    const symmetry = useEditorStore.getState().symmetry

    for (const [dx, dy] of brushMask(brushShape, brushSize)) {
      /**
       * Symmetry expands each brush cell into up to four, into the SAME stroke
       * buffer. That is what keeps a mirrored stroke one undo, and the Map key
       * is what makes a stroke down the centre of an odd canvas paint once
       * rather than twice. See docs/specs/16-settings.md §3.
       */
      for (const [cx, cy] of mirrored(x + dx, y + dy, doc.w, doc.h, symmetry)) {
        if (!isInside(cx, cy, doc)) continue // ignore, never clamp — clamping smears along the edge
        // Ordered dither: the pattern is anchored to document coordinates, so two
        // strokes over the same area interlock instead of showing a seam.
        if (!ditherPasses(cx, cy, density)) continue
        const key = cy * doc.w + cx
        const existing = buf.get(key)
        const before = existing ? existing[2] : px[key]!
        buf.set(key, [cx, cy, before, value])
        px[key] = value // immediate feedback; the document is committed on pointerup
      }
    }
    dirty.current = true
  }, [])

  /**
   * Redraw a shape preview into the stroke buffer.
   *
   * Every move reverts the previous preview to its `before` value and recomputes
   * from scratch, so the buffer always holds exactly one shape and its `before`
   * values stay the true pre-stroke document. Accumulating instead would make
   * undo restore an intermediate frame of the drag.
   */
  const previewShape = useCallback((cells: Array<[number, number]>, value: number) => {
    const { doc, frame, layer } = useDocStore.getState()
    const buf = stroke.current
    if (!doc || !buf) return
    const px = doc.frames[frame]?.layers[layer]?.px
    if (!px) return

    for (const [bx, by, before] of buf.values()) px[by * doc.w + bx] = before
    buf.clear()

    // Shapes mirror too — rect and gradient go through here, and a symmetry
    // setting that applied to the brush but not to the rectangle tool would be
    // a setting the user has to remember the scope of.
    const symmetry = useEditorStore.getState().symmetry
    for (const [ox, oy] of cells) {
      for (const [cx, cy] of mirrored(ox, oy, doc.w, doc.h, symmetry)) {
        if (cx < 0 || cy < 0 || cx >= doc.w || cy >= doc.h) continue
        const key = cy * doc.w + cx
        if (buf.has(key)) continue // keep the first `before` for this cell
        buf.set(key, [cx, cy, px[key]!, value])
        px[key] = value
      }
    }
    dirty.current = true
  }, [])

  /** Like previewShape, but each cell carries its own value (used by move). */
  const previewMoved = useCallback(
    (cells: Array<[number, number]>, values: Map<string, number>) => {
      const { doc, frame, layer } = useDocStore.getState()
      const buf = stroke.current
      if (!doc || !buf) return
      const px = doc.frames[frame]?.layers[layer]?.px
      if (!px) return

      for (const [bx, by, before] of buf.values()) px[by * doc.w + bx] = before
      buf.clear()

      for (const [cx, cy] of cells) {
        if (cx < 0 || cy < 0 || cx >= doc.w || cy >= doc.h) continue
        const key = cy * doc.w + cx
        const value = values.get(`${cx},${cy}`) ?? 0
        buf.set(key, [cx, cy, px[key]!, value])
        px[key] = value
      }
      dirty.current = true
    },
    [],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = ref.current
      let doc = useDocStore.getState().doc
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

      const { frame, layer } = useDocStore.getState()

      // The eyedropper picks what the user is LOOKING at, not what is on the
      // active layer — sampling the active layer would return transparent
      // whenever the pixel under the cursor belongs to a layer above or below,
      // which reads as the tool being broken. See docs/specs/14-layers.md §5.
      if (ed.tool === 'eyedropper') {
        ed.setColorIndex(compositeAt(doc, frame, x, y))
        return
      }

      // Drawing on a hidden layer would show nothing for the whole drag and then
      // nothing afterwards either. Reveal it first, as its own history entry, so
      // the stroke that follows behaves normally and the reveal is its own undo.
      //
      // commit() replaces the document, so `doc` has to be re-read afterwards —
      // painting into the old clone's buffer would write to a document the store
      // no longer holds, and the stroke would vanish on the next render.
      if (doc.frames[frame]?.layers[layer]?.hidden) {
        useDocStore.getState().commit({
          type: 'layer_visible', label: 'Show layer', frame, at: layer,
          before: true, after: false,
        })
        doc = useDocStore.getState().doc!
      }

      const px = doc.frames[frame]?.layers[layer]?.px
      if (!px) return

      // ── marquee: drag a selection rectangle ──
      if (ed.tool === 'marquee') {
        dragFrom.current = { x, y }
        ed.setSelection({ x, y, w: 1, h: 1 })
        return
      }

      // ── select: drag the contents of the selection ──
      if (ed.tool === 'select') {
        const sel = ed.selection
        if (!sel || x < sel.x || y < sel.y || x >= sel.x + sel.w || y >= sel.y + sel.h) {
          // Clicking outside drops the selection, which is what every editor does
          // and is the only discoverable way to get rid of one.
          ed.setSelection(null)
          return
        }
        const lifted: Array<[number, number, number]> = []
        for (let sy = sel.y; sy < sel.y + sel.h; sy++) {
          for (let sx = sel.x; sx < sel.x + sel.w; sx++) {
            lifted.push([sx - sel.x, sy - sel.y, px[sy * doc.w + sx]!])
          }
        }
        moving.current = { cells: lifted, from: { x, y } }
        dragFrom.current = { x, y }
        stroke.current = new Map()
        return
      }

      // ── rect and gradient: drag out a shape, previewed live ──
      if (ed.tool === 'rect' || ed.tool === 'gradient') {
        dragFrom.current = { x, y }
        stroke.current = new Map()
        previewShape([[x, y]], ed.colorIndex)
        return
      }

      if (ed.tool === 'fill') {
        const target = ed.colorIndex
        /**
         * Symmetry mirrors the SEEDS, not the result. Mirroring the filled
         * region would paint wherever the reflection landed regardless of what
         * was there — across a boundary the fill itself would have respected.
         * Filling from each mirrored seed keeps every region bounded by its own
         * edges, which is what the tool means. See spec 16 §3.2.
         */
        const seen = new Set<number>()
        const cells: PaintCell[] = []
        for (const [sx, sy] of mirrored(x, y, doc.w, doc.h, ed.symmetry)) {
          for (const [fx, fy] of floodFillPoints(px, doc.w, doc.h, sx, sy)) {
            const key = fy * doc.w + fx
            if (seen.has(key)) continue
            seen.add(key)
            cells.push([fx, fy, px[key]!, target])
          }
        }
        const ds = useDocStore.getState()
        ds.commit(paintCommand('Fill', ds.frame, ds.layer, cells))
        return
      }

      stroke.current = new Map()
      lastCell.current = { x, y }
      paintAt(x, y)
    },
    [paintAt, previewShape],
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

      const start = dragFrom.current
      if (start) {
        if (ed.tool === 'marquee') {
          ed.setSelection({
            x: Math.max(0, Math.min(start.x, x)),
            y: Math.max(0, Math.min(start.y, y)),
            w: Math.min(doc.w, Math.abs(x - start.x) + 1),
            h: Math.min(doc.h, Math.abs(y - start.y) + 1),
          })
          return
        }

        if (ed.tool === 'select' && moving.current) {
          const sel = ed.selection
          if (!sel) return
          const dx = x - moving.current.from.x
          const dy = y - moving.current.from.y
          // Clear the source, then stamp the lifted pixels at the offset. Both go
          // through one preview so the whole move is a single undo step.
          const cells: Array<[number, number]> = []
          const values = new Map<string, number>()
          for (let sy = sel.y; sy < sel.y + sel.h; sy++) {
            for (let sx = sel.x; sx < sel.x + sel.w; sx++) {
              cells.push([sx, sy])
              values.set(`${sx},${sy}`, 0)
            }
          }
          for (const [ox, oy, value] of moving.current.cells) {
            const tx = sel.x + ox + dx
            const ty = sel.y + oy + dy
            if (!values.has(`${tx},${ty}`)) cells.push([tx, ty])
            values.set(`${tx},${ty}`, value)
          }
          previewMoved(cells, values)
          return
        }

        if (ed.tool === 'rect') {
          const w = Math.abs(x - start.x) + 1
          const h = Math.abs(y - start.y) + 1
          const rx = Math.min(start.x, x)
          const ry = Math.min(start.y, y)
          previewShape([...rectPoints(rx, ry, w, h, false)], ed.colorIndex)
          return
        }

        if (ed.tool === 'gradient') {
          previewShape(gradientCells(start.x, start.y, x, y, doc.w, doc.h), ed.colorIndex)
          return
        }
      }

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
    [paintAt, previewShape, previewMoved],
  )

  const endStroke = useCallback(() => {
    panFrom.current = null
    const start = dragFrom.current
    dragFrom.current = null
    const wasMoving = moving.current
    moving.current = null

    const ed = useEditorStore.getState()
    // The marquee never touches pixels — it only sets the selection.
    if (ed.tool === 'marquee') {
      const sel = ed.selection
      if (sel && sel.w <= 1 && sel.h <= 1) ed.setSelection(null)
      return
    }

    const buf = stroke.current
    stroke.current = null
    lastCell.current = null
    if (!buf) return

    const { frame, layer } = useDocStore.getState()
    const label =
      ed.tool === 'eraser' ? 'Erase'
      : ed.tool === 'rect' ? 'Rectangle'
      : ed.tool === 'gradient' ? 'Gradient'
      : wasMoving ? 'Move'
      : 'Brush'

    useDocStore.getState().commit(paintCommand(label, frame, layer, buf.values()))

    // A completed move leaves the selection over where the pixels landed, so a
    // second drag continues from there rather than snapping back.
    if (wasMoving && start && ed.selection) {
      const cursor = ed.cursor
      if (cursor) {
        ed.setSelection({
          ...ed.selection,
          x: ed.selection.x + (cursor.x - start.x),
          y: ed.selection.y + (cursor.y - start.y),
        })
      }
    }
  }, [])

  const onPointerCancel = useCallback(() => {
    // Discard the buffer and repaint from the document — nothing is committed.
    const buf = stroke.current
    const { doc, frame, layer } = useDocStore.getState()
    if (buf && doc) {
      const px = doc.frames[frame]?.layers[layer]?.px
      if (px) for (const [x, y, before] of buf.values()) px[y * doc.w + x] = before
    }
    stroke.current = null
    lastCell.current = null
    panFrom.current = null
    dirty.current = true
  }, [])

  /**
   * Wheel: scroll pans, pinch zooms.
   *
   * This used to zoom on every wheel event, a whole ladder rung at a time. A
   * trackpad fires dozens of events per two-finger gesture, so one flick went
   * 32x -> 48x -> 64x and pinned at maximum. Two separate faults: no
   * scroll/zoom distinction, and a step sized for a mouse notch.
   *
   * ctrlKey is the discriminator, and it is not a heuristic — browsers
   * synthesise a wheel event with ctrlKey set for a trackpad pinch, and it is
   * also what a mouse user holds to zoom. Everything else is a scroll, and a
   * scroll pans. Same model as Figma and tldraw.
   *
   * Zoom is continuous rather than laddered: the ladder is for the +/- buttons
   * and the keyboard, where landing on recognisable factors matters. Scale must
   * still be a whole number so cells tile exactly, so the fractional value is
   * accumulated here and only the rounded one reaches the viewport — otherwise
   * small deltas round back to the current scale and the gesture does nothing.
   *
   * Attached natively with passive: false. React registers wheel listeners as
   * passive, so preventDefault from an onWheel prop is ignored and the browser
   * page-zooms on top of us.
   */
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ed = useEditorStore.getState()
      const vp = ed.viewport

      if (e.ctrlKey || e.metaKey) {
        // Re-sync if anything else moved the scale since the last wheel event.
        if (Math.round(zoomAccum.current) !== vp.scale) zoomAccum.current = vp.scale

        // Exponential so each notch is a constant proportion — a linear step
        // feels violent at 4x and imperceptible at 48x.
        zoomAccum.current = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, zoomAccum.current * Math.exp(-e.deltaY * ZOOM_SENSITIVITY)),
        )
        const next = clampScale(zoomAccum.current)
        if (next === vp.scale) return

        const rect = canvas.getBoundingClientRect()
        ed.setViewport(zoomAt(vp, next, e.clientX - rect.left, e.clientY - rect.top))
        return
      }

      ed.setViewport({ ...vp, offsetX: vp.offsetX - e.deltaX, offsetY: vp.offsetY - e.deltaY })
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Pixel artwork canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => useEditorStore.getState().setCursor(null)}
      />
    </div>
  )
}
