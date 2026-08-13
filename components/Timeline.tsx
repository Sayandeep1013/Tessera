'use client'

/**
 * The animation timeline. See docs/specs/10-animation.md §2 (layout), §3
 * (playback) and §0.4 (why it docks to the top of `<main>` rather than "above
 * the composer").
 *
 * Frames are listed in document order — unlike the layer panel, which reverses
 * `frames[].layers` so index 0 (bottom of the stack) reads at the bottom of the
 * list. A filmstrip has no such inversion: frame 0 is first, and that is
 * already how it reads.
 *
 * Every control that changes the document goes through commit(); selecting a
 * frame is UI state, exactly like selecting a layer.
 */

import { useEffect, useRef, useState } from 'react'
import { Tooltip } from './Tooltip'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { usePlaybackStore } from '@/lib/store/playback'
import { chromeFor, useTier } from '@/lib/editor/breakpoint'
import { cloneFrame, type EditorCommand } from '@/lib/artwork-core/commands'
import { MAX_FRAMES } from '@/lib/artwork-core/frames'
import { MAX_FRAME_MS, MIN_FRAME_MS } from '@/lib/artwork-core/schema'
import { spriteRects } from '@/lib/renderer/sprite-svg'

/** The strip's own height — Layers panel offsets its `top` by this when both
 *  are open (app/page.tsx), the same coordination `railLift` does elsewhere. */
export const TIMELINE_HEIGHT = 72
/** The DOM id app/page.tsx's global Space handler checks focus against — see
 *  spec §2 "Space toggles playback only when the timeline has focus". */
export const TIMELINE_DOM_ID = 'tessera-timeline'

const THUMB = 48

/** Where a frame drag currently stands. `moved` distinguishes a drag from a
 *  plain click — a thumbnail is both "select this frame" and "drag handle",
 *  which a Layers-style separate grip button has no room for at 48px. */
type Drag = { pointerId: number; from: number; to: number; moved: boolean }
type Menu = { at: number; x: number; y: number }

export function TimelinePanel({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc)
  const frame = useDocStore((s) => s.frame)
  const setFrame = useDocStore((s) => s.setFrame)
  const commit = useDocStore((s) => s.commit)
  const onionSkin = useEditorStore((s) => s.onionSkin)
  const setOnionSkin = useEditorStore((s) => s.setOnionSkin)
  const pingPong = useEditorStore((s) => s.pingPong)
  const setPingPong = useEditorStore((s) => s.setPingPong)
  const playing = usePlaybackStore((s) => s.playing)
  const playToggle = usePlaybackStore((s) => s.toggle)
  const tier = useTier()
  const c = chromeFor(tier)

  const [drag, setDrag] = useState<Drag | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  /** Shift-click extends a selection from the active frame to this one — spec
   *  §2's "⇧-click selects a range and sets all of them", for the duration
   *  field. Cleared by a plain click. */
  const [rangeEnd, setRangeEnd] = useState<number | null>(null)
  const colRefs = useRef<Array<HTMLButtonElement | null>>([])
  const dragStartX = useRef(0)
  const durationRef = useRef<HTMLInputElement>(null)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (menu) setMenu(null)
      else onClose()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose, menu])

  // The outside-click listener lives inside FrameMenu itself, with its own
  // ref — see FrameMenu for why (a bug caught by tools/probe-timeline.ts: a
  // listener with no containment check closes the menu on its own items'
  // mousedown, before their click ever runs).

  // ── drag reorder ──────────────────────────────────────────────────────────
  const indexForX = (frames: unknown[], x: number): number => {
    for (let i = 0; i < frames.length; i++) {
      const rect = colRefs.current[i]?.getBoundingClientRect()
      if (rect && x < rect.left + rect.width / 2) return i
    }
    return frames.length - 1
  }

  const dragRef = useRef(drag)
  dragRef.current = drag

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const current = dragRef.current
      if (!current || e.pointerId !== current.pointerId) return
      const frames = useDocStore.getState().doc?.frames ?? []
      const moved = current.moved || Math.abs(e.clientX - dragStartX.current) > 4
      setDrag((d) => (d ? { ...d, to: indexForX(frames, e.clientX), moved } : d))
    }
    const onUp = (e: PointerEvent) => {
      const current = dragRef.current
      if (!current || e.pointerId !== current.pointerId) return
      setDrag(null)
      if (!current.moved) {
        if (e.shiftKey) setRangeEnd(current.from)
        else {
          setFrame(current.from)
          setRangeEnd(null)
        }
        return
      }
      if (current.from === current.to) return
      commit({ type: 'frame_move', label: 'Reorder frame', from: current.from, to: current.to })
      setFrame(current.to)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  const startDrag = (i: number, e: React.PointerEvent) => {
    dragStartX.current = e.clientX
    setDrag({ pointerId: e.pointerId, from: i, to: i, moved: false })
  }

  if (!doc) return null
  const frames = doc.frames
  const displayFrames = (() => {
    if (!drag) return frames.map((f, i) => ({ f, i }))
    const rows = frames.map((f, i) => ({ f, i }))
    const [item] = rows.splice(drag.from, 1)
    rows.splice(drag.to, 0, item!)
    return rows
  })()

  const full = frames.length >= MAX_FRAMES
  const rangeLo = rangeEnd === null ? frame : Math.min(frame, rangeEnd)
  const rangeHi = rangeEnd === null ? frame : Math.max(frame, rangeEnd)

  const duplicateAt = (i: number) => {
    const source = frames[i]
    if (!source || full) return
    commit({ type: 'frame_add', label: 'Duplicate frame', at: i + 1, frame: cloneFrame(source) })
    setFrame(i + 1)
    setMenu(null)
  }

  const deleteAt = (i: number) => {
    const target = frames[i]
    if (!target || frames.length <= 1) return
    commit({ type: 'frame_delete', label: 'Delete frame', at: i, frame: cloneFrame(target) })
    // commit() clamps generically; this corrects the one case it cannot know
    // about — an earlier frame being deleted out from under the active one.
    if (i < frame) setFrame(frame - 1)
    setMenu(null)
  }

  const openDuration = (i: number) => {
    setFrame(i)
    setRangeEnd(null)
    setMenu(null)
    setTimeout(() => durationRef.current?.focus(), 0)
  }

  const commitDuration = (raw: string) => {
    const ms = Math.max(MIN_FRAME_MS, Math.min(MAX_FRAME_MS, Math.round(Number(raw))))
    if (!Number.isFinite(ms)) return
    const indices: number[] = []
    for (let i = rangeLo; i <= rangeHi; i++) indices.push(i)
    const cmds: EditorCommand[] = indices
      .filter((i) => frames[i] && frames[i]!.ms !== ms)
      .map((i) => ({
        type: 'frame_duration', label: 'Frame duration', at: i, before: frames[i]!.ms, after: ms,
      }))
    if (!cmds.length) return
    commit(cmds.length === 1 ? cmds[0]! : { type: 'batch', label: 'Frame duration', cmds })
  }

  const contextMenuFor = (i: number, x: number, y: number) => setMenu({ at: i, x, y })

  return (
    <div
      id={TIMELINE_DOM_ID}
      role="dialog"
      aria-label="Timeline"
      style={{
        position: 'absolute',
        top: c.inset,
        left: c.inset,
        right: c.inset,
        zIndex: 25,
        height: TIMELINE_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        borderRadius: 'var(--r-xl)',
        background: 'color-mix(in srgb, var(--panel) 90%, transparent)',
        backdropFilter: 'blur(8px)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <PlayBtn playing={playing} disabled={frames.length <= 1} onClick={playToggle} />
      <ToggleGlyph
        glyph="⟲"
        title={pingPong ? 'Loop end to end' : 'Ping-pong'}
        active={pingPong}
        onClick={() => setPingPong(!pingPong)}
      />

      <div style={{ width: 1, height: 40, background: 'var(--line)', flex: 'none' }} />

      <div style={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
          {displayFrames.map(({ f, i }, displayIndex) => (
            <FrameThumb
              key={`${i}`}
              thumbRef={(el) => { colRefs.current[displayIndex] = el }}
              doc={doc}
              frameIndex={i}
              active={i === frame}
              inRange={rangeEnd !== null && i >= rangeLo && i <= rangeHi}
              dragging={drag?.from === displayIndex}
              onPointerDownStart={(e) => startDrag(displayIndex, e)}
              onContextMenu={(x, y) => contextMenuFor(i, x, y)}
              onLongPressStart={(x, y) => {
                longPress.current = setTimeout(() => contextMenuFor(i, x, y), 500)
              }}
              onLongPressEnd={() => {
                if (longPress.current) clearTimeout(longPress.current)
              }}
            />
          ))}
          <Tooltip
            label={full ? `A document holds at most ${MAX_FRAMES} frames` : 'Add a frame — duplicates the current one'}
            placement="top"
          >
            <button
              type="button"
              aria-label="Add frame"
              disabled={full}
              onClick={() => duplicateAt(frame)}
              style={{
                width: THUMB, height: THUMB, flex: 'none', display: 'grid', placeItems: 'center',
                borderRadius: 'var(--r-md)', border: '1px dashed var(--line)',
                color: full ? 'var(--disabled)' : 'var(--muted)',
              }}
            >
              +
            </button>
          </Tooltip>
        </div>
      </div>

      <div style={{ width: 1, height: 40, background: 'var(--line)', flex: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
        <Tooltip label={rangeEnd === null ? 'This frame’s duration, in ms' : 'Sets every selected frame’s duration'} placement="top">
          <input
            key={`${frame}:${rangeLo}:${rangeHi}:${frames[frame]?.ms}`}
            ref={durationRef}
            type="number"
            min={MIN_FRAME_MS}
            max={MAX_FRAME_MS}
            step={10}
            aria-label="Frame duration, milliseconds"
            defaultValue={frames[frame]?.ms ?? 100}
            onBlur={(e) => commitDuration(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.currentTarget.value = String(frames[frame]?.ms ?? 100)
                e.currentTarget.blur()
              }
            }}
            style={{
              width: 64, height: 28, padding: '0 6px', borderRadius: 'var(--r-md)',
              background: 'var(--panel2)', border: '1px solid var(--line)',
              font: 'var(--t-label-sm)', color: 'var(--fg)',
            }}
          />
        </Tooltip>
        <span style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>ms</span>
        <ToggleGlyph
          glyph="◐"
          title={onionSkin ? 'Hide onion skin' : 'Show onion skin'}
          active={onionSkin}
          onClick={() => setOnionSkin(!onionSkin)}
        />
      </div>

      {menu && (
        <FrameMenu
          menu={menu}
          canDelete={frames.length > 1}
          full={full}
          onDuplicate={() => duplicateAt(menu.at)}
          onDelete={() => deleteAt(menu.at)}
          onSetDuration={() => openDuration(menu.at)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

// ─── frame thumbnail ────────────────────────────────────────────────────────

function FrameThumb({
  thumbRef, doc, frameIndex, active, inRange, dragging,
  onPointerDownStart, onContextMenu, onLongPressStart, onLongPressEnd,
}: {
  thumbRef: (el: HTMLButtonElement | null) => void
  doc: NonNullable<ReturnType<typeof useDocStore.getState>['doc']>
  frameIndex: number
  active: boolean
  inRange: boolean
  dragging: boolean
  onPointerDownStart: (e: React.PointerEvent) => void
  onContextMenu: (x: number, y: number) => void
  onLongPressStart: (x: number, y: number) => void
  onLongPressEnd: () => void
}) {
  return (
    <Tooltip label={`Frame ${frameIndex + 1}`} placement="top">
      <button
        ref={thumbRef}
        type="button"
        aria-label={`Frame ${frameIndex + 1}`}
        aria-pressed={active}
        onPointerDown={(e) => {
          onPointerDownStart(e)
          onLongPressStart(e.clientX, e.clientY)
        }}
        onPointerUp={onLongPressEnd}
        onPointerLeave={onLongPressEnd}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e.clientX, e.clientY)
        }}
        style={{
          width: THUMB, height: THUMB, flex: 'none', position: 'relative',
          borderRadius: 'var(--r-md)', overflow: 'hidden', cursor: 'grab', touchAction: 'none',
          background: 'var(--panel2)',
          boxShadow: active
            ? 'inset 0 0 0 2px var(--accent)'
            : inRange
              ? 'inset 0 0 0 2px var(--accent-soft)'
              : 'inset 0 0 0 1px var(--line)',
          opacity: dragging ? 0.5 : 1,
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${doc.w} ${doc.h}`}
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          {spriteRects(doc, frameIndex).map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
          ))}
        </svg>
        <span
          className="tabular"
          style={{
            position: 'absolute', left: 2, bottom: 1, font: 'var(--t-label-sm)',
            color: 'var(--fg)', textShadow: '0 0 2px var(--panel), 0 0 4px var(--panel)',
          }}
        >
          {frameIndex + 1}
        </span>
      </button>
    </Tooltip>
  )
}

// ─── context menu ───────────────────────────────────────────────────────────

function FrameMenu({
  menu, canDelete, full, onDuplicate, onDelete, onSetDuration, onClose,
}: {
  menu: Menu
  canDelete: boolean
  full: boolean
  onDuplicate: () => void
  onDelete: () => void
  onSetDuration: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // A containment check, not just "mousedown fired somewhere" — see
    // Chrome.tsx's FileMenu/PalettePopover for the same pattern. A listener
    // without it closes the menu on its own items' mousedown, before their
    // click ever runs; caught by tools/probe-timeline.ts.
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Frame"
      style={{
        position: 'fixed', left: menu.x, top: menu.y, width: 168, padding: 4, zIndex: 70,
        background: 'var(--panel)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)',
      }}
    >
      <MenuRow label="Duplicate" disabled={full} onClick={() => { onDuplicate(); onClose() }} />
      <MenuRow label="Set duration…" onClick={onSetDuration} />
      <MenuRow
        label="Delete"
        destructive
        disabled={!canDelete}
        onClick={() => { onDelete(); onClose() }}
      />
    </div>
  )
}

function MenuRow({
  label, onClick, disabled, destructive,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex', width: '100%', padding: '7px 10px', borderRadius: 'var(--r-md)',
        font: 'var(--t-label)', textAlign: 'left',
        color: disabled ? 'var(--disabled)' : destructive ? 'var(--diff-remove)' : 'var(--fg)',
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}

// ─── small controls ─────────────────────────────────────────────────────────

function PlayBtn({ playing, disabled, onClick }: { playing: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Tooltip label={playing ? 'Pause (Space)' : 'Play (Space)'} placement="top">
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        aria-pressed={playing}
        disabled={disabled}
        onClick={onClick}
        style={{
          width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center',
          borderRadius: 'var(--r-pill)',
          background: playing ? 'var(--accent)' : 'transparent',
          color: disabled ? 'var(--disabled)' : playing ? 'var(--onaccent)' : 'var(--fg)',
        }}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>{playing ? '⏸' : '▶'}</span>
      </button>
    </Tooltip>
  )
}

/** A toggle rendered from a single glyph — the mockup's own notation (§2:
 *  `⟲`, `◐`) rather than a hand-drawn path in the generated icon set, which is
 *  Phosphor-sourced only (icons.tsx's own header: do not hand-edit). */
function ToggleGlyph({
  glyph, title, active, onClick,
}: {
  glyph: string
  title: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Tooltip label={title} placement="top">
      <button
        type="button"
        aria-label={title}
        aria-pressed={active}
        onClick={onClick}
        style={{
          width: 32, height: 32, flex: 'none', display: 'grid', placeItems: 'center',
          borderRadius: 'var(--r-pill)',
          background: active ? 'var(--accent-soft)' : 'transparent',
          color: active ? 'var(--fg)' : 'var(--muted)',
        }}
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>{glyph}</span>
      </button>
    </Tooltip>
  )
}
