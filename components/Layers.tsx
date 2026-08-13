'use client'

/**
 * The layer panel. See docs/specs/14-layers.md §6 (phase 1) and §12.6 (phase 2:
 * opacity, blend mode, merge/flatten, drag reorder).
 *
 * Rows are listed TOP LAYER FIRST — the reverse of `frames[].layers`, because
 * index 0 is the bottom of the stack and every editor draws a stack the way it
 * looks. The index on screen is never the array index; `rows` does that mapping
 * once so nothing else has to think about it.
 *
 * Every control here goes through commit(), so every one is a single undo step.
 * Select is the one that differs: it is UI state (like choosing a tool) and
 * never enters history.
 */

import { useEffect, useRef, useState } from 'react'
import { Tooltip } from './Tooltip'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { chromeFor, useTier, type Tier } from '@/lib/editor/breakpoint'
import { cloneLayer } from '@/lib/artwork-core/commands'
import {
  MAX_LAYERS, MAX_LAYER_NAME, cleanLayerName, layerAlpha, layerBlendMode, nextLayerName,
} from '@/lib/artwork-core/layers'
import { flattenCommand, mergeDownCommand } from '@/lib/artwork-core/merge-layers'
import { BLEND_MODES, type BlendMode, type Layer } from '@/lib/artwork-core/schema'
import { mergeReport } from '@/lib/editor/merge-report'
import { CaretDown, CaretUp, DotsThree, Eye, EyeSlash, Plus } from './icons'

const WIDTH: Record<Tier, number> = { wide: 248, compact: 248, tablet: 224, mobile: 224 }

/** Where a drag currently stands. Indices are DISPLAY order (top-first), the
 *  same order `rows` renders in — converted to array order only on commit. */
type Drag = { pointerId: number; from: number; to: number }

export function LayersPanel({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc)
  const frame = useDocStore((s) => s.frame)
  const active = useDocStore((s) => s.layer)
  const setLayer = useDocStore((s) => s.setLayer)
  const commit = useDocStore((s) => s.commit)
  const setNotice = useEditorStore((s) => s.setNotice)
  const tier = useTier()
  const c = chromeFor(tier)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // The opacity slider's value while a drag is in progress but not yet
  // committed — committing per `input` event would be sixty undo steps for
  // one drag, so this holds the live number for display only.
  const [pendingOpacity, setPendingOpacity] = useState<number | null>(null)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && renaming === null) onClose()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose, renaming])

  if (!doc) return null
  const layers = doc.frames[frame]?.layers ?? []
  // Top of the stack first.
  const rows = layers.map((l, i) => ({ layer: l, i })).reverse()
  const displayRows = (() => {
    if (!drag) return rows
    const copy = [...rows]
    const [item] = copy.splice(drag.from, 1)
    copy.splice(drag.to, 0, item!)
    return copy
  })()

  const add = () => {
    const at = active + 1
    commit({
      type: 'layer_add',
      label: 'Add layer',
      frame,
      at,
      layer: { n: nextLayerName(doc, frame), px: new Uint8Array(doc.w * doc.h) },
    })
    setLayer(at)
  }

  const duplicate = () => {
    const source = layers[active]
    if (!source) return
    const at = active + 1
    commit({
      type: 'layer_add',
      label: 'Duplicate layer',
      frame,
      at,
      layer: { ...cloneLayer(source), n: cleanLayerName(`${source.n} copy`) },
    })
    setLayer(at)
  }

  const remove = () => {
    const source = layers[active]
    if (!source || layers.length <= 1) return
    commit({
      type: 'layer_delete',
      label: 'Delete layer',
      frame,
      at: active,
      layer: cloneLayer(source),
    })
    // commit() clamps, so this only matters when the deleted layer was not the top.
    setLayer(Math.min(active, layers.length - 2))
  }

  const move = (delta: number) => {
    const to = active + delta
    if (to < 0 || to >= layers.length) return
    commit({ type: 'layer_move', label: 'Reorder layer', frame, from: active, to })
    setLayer(to)
  }

  const rename = (at: number, raw: string) => {
    const before = layers[at]?.n
    const after = cleanLayerName(raw)
    setRenaming(null)
    if (before === undefined || before === after) return
    commit({ type: 'layer_rename', label: 'Rename layer', frame, at, before, after })
  }

  const toggle = (at: number) => {
    const before = Boolean(layers[at]?.hidden)
    commit({
      type: 'layer_visible',
      label: before ? 'Show layer' : 'Hide layer',
      frame,
      at,
      before,
      after: !before,
    })
  }

  const commitOpacity = (next: number) => {
    const layer = layers[active]
    if (!layer) return
    const before = Math.round(layerAlpha(layer) * 100)
    if (before === next) return
    commit({ type: 'layer_opacity', label: 'Layer opacity', frame, at: active, before, after: next })
  }

  const setBlendMode = (mode: BlendMode) => {
    const layer = layers[active]
    if (!layer) return
    const before = layerBlendMode(layer)
    if (before === mode) return
    commit({ type: 'layer_blend_mode', label: 'Layer blend mode', frame, at: active, before, after: mode })
  }

  const doMergeDown = () => {
    const { cmd, result } = mergeDownCommand(doc, frame, active)
    if (!cmd) return
    commit(cmd)
    setLayer(active - 1)
    setNotice(mergeReport('Merged', result))
  }

  const doFlatten = () => {
    const { cmd, result } = flattenCommand(doc, frame)
    if (!cmd) return
    commit(cmd)
    setLayer(0)
    setNotice(mergeReport('Flattened', result))
  }

  // ── drag reorder ──────────────────────────────────────────────────────────
  //
  // Window-level listeners, not element-level `setPointerCapture`: every move
  // sets `drag.to`, which re-renders the reordered preview, and a captured
  // pointer on a row that has just been reordered in the DOM is not reliable
  // across that re-render. The window is not going anywhere.

  const indexForY = (y: number): number => {
    for (let i = 0; i < rows.length; i++) {
      const rect = rowRefs.current[i]?.getBoundingClientRect()
      if (rect && y < rect.top + rect.height / 2) return i
    }
    return rows.length - 1
  }

  const dragRef = useRef(drag)
  dragRef.current = drag

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== dragRef.current?.pointerId) return
      setDrag((d) => (d ? { ...d, to: indexForY(e.clientY) } : d))
    }
    const onUp = (e: PointerEvent) => {
      const current = dragRef.current
      if (!current || e.pointerId !== current.pointerId) return
      const { from, to } = current
      setDrag(null)
      if (from === to) return
      // Display order is top-first, the reverse of the array `layers` is
      // stored in — flipping an index through `n - 1 - i` is the same remap
      // either direction, so the same formula converts both ends of the drag.
      const n = layers.length
      const arrFrom = n - 1 - from
      const arrTo = n - 1 - to
      commit({ type: 'layer_move', label: 'Reorder layer', frame, from: arrFrom, to: arrTo })
      setLayer(arrTo)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  const startDrag = (displayIndex: number, e: React.PointerEvent) => {
    setDrag({ pointerId: e.pointerId, from: displayIndex, to: displayIndex })
  }

  const full = layers.length >= MAX_LAYERS
  const activeLayerObj: Layer | undefined = layers[active]
  const opacityValue = pendingOpacity ?? (activeLayerObj ? Math.round(layerAlpha(activeLayerObj) * 100) : 100)

  return (
    <div
      role="dialog"
      aria-label="Layers"
      style={{
        position: 'absolute',
        top: c.inset,
        right: c.inset,
        zIndex: 30,
        width: WIDTH[tier],
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'min(46vh, 420px)',
        borderRadius: 'var(--r-xl)',
        background: 'color-mix(in srgb, var(--panel) 90%, transparent)',
        backdropFilter: 'blur(8px)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span style={{ flex: 1, font: 'var(--t-label)', color: 'var(--fg)' }}>Layers</span>
        <span className="tabular" style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>
          {layers.length}
        </span>
      </div>

      <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: 4 }}>
        {displayRows.map(({ layer, i }, displayIndex) => (
          <LayerRow
            key={`${i}-${layer.n}`}
            rowRef={(el) => { rowRefs.current[displayIndex] = el }}
            name={layer.n}
            hidden={Boolean(layer.hidden)}
            active={i === active}
            renaming={renaming === i}
            dragging={drag?.from === displayIndex}
            onSelect={() => setLayer(i)}
            onToggle={() => toggle(i)}
            onStartRename={() => setRenaming(i)}
            onRename={(v) => rename(i, v)}
            onDragStart={(e) => startDrag(displayIndex, e)}
          />
        ))}
      </div>

      <div
        style={{
          flex: 'none',
          padding: '6px 10px',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: 'var(--t-label-sm)', color: 'var(--muted)', flex: 'none' }}>Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={opacityValue}
            aria-label="Layer opacity"
            disabled={!activeLayerObj}
            onChange={(e) => setPendingOpacity(Number(e.currentTarget.value))}
            onPointerUp={() => {
              if (pendingOpacity !== null) commitOpacity(pendingOpacity)
              setPendingOpacity(null)
            }}
            onKeyUp={() => {
              if (pendingOpacity !== null) commitOpacity(pendingOpacity)
              setPendingOpacity(null)
            }}
            onBlur={() => {
              if (pendingOpacity !== null) commitOpacity(pendingOpacity)
              setPendingOpacity(null)
            }}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span className="tabular" style={{ font: 'var(--t-label-sm)', color: 'var(--muted)', width: 32, textAlign: 'right' }}>
            {opacityValue}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: 'var(--t-label-sm)', color: 'var(--muted)', flex: 'none' }}>Blend</span>
          <select
            aria-label="Layer blend mode"
            value={activeLayerObj ? layerBlendMode(activeLayerObj) : 'normal'}
            disabled={!activeLayerObj}
            onChange={(e) => setBlendMode(e.currentTarget.value as BlendMode)}
            style={{
              flex: 1, height: 26, padding: '0 6px', borderRadius: 'var(--r-md)',
              background: 'var(--panel2)', border: '1px solid var(--line)',
              font: 'var(--t-label-sm)', color: 'var(--fg)',
            }}
          >
            {BLEND_MODES.map((m) => (
              <option key={m} value={m}>{m[0]!.toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: 4,
        }}
      >
        <TextBtn
          label="Add"
          Icon={Plus}
          disabled={full}
          title={full ? `A frame holds at most ${MAX_LAYERS} layers` : 'Add a layer above this one'}
          onClick={add}
        />
        <TextBtn label="Copy" title="Duplicate this layer" disabled={full} onClick={duplicate} />
        <TextBtn
          label="Delete"
          title={layers.length <= 1 ? 'A frame must keep at least one layer' : 'Delete this layer'}
          disabled={layers.length <= 1}
          onClick={remove}
        />
        <span style={{ flex: 1 }} />
        <IconBtn
          title="Move up"
          Icon={CaretUp}
          disabled={active >= layers.length - 1}
          onClick={() => move(1)}
        />
        <IconBtn title="Move down" Icon={CaretDown} disabled={active <= 0} onClick={() => move(-1)} />
      </div>

      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '0 4px 4px',
          borderTop: '1px solid var(--line)',
          paddingTop: 4,
        }}
      >
        <TextBtn
          label="Merge down"
          title={active === 0 ? 'Nothing below the bottom layer' : `Combine this layer into "${layers[active - 1]?.n || 'Untitled'}"`}
          disabled={active === 0}
          onClick={doMergeDown}
        />
        <TextBtn
          label="Flatten"
          title={layers.length <= 1 ? 'Already one layer' : 'Combine every layer into one'}
          disabled={layers.length <= 1}
          onClick={doFlatten}
        />
      </div>
    </div>
  )
}

// ─── row ─────────────────────────────────────────────────────────────────────

function LayerRow({
  rowRef, name, hidden, active, renaming, dragging,
  onSelect, onToggle, onStartRename, onRename, onDragStart,
}: {
  rowRef: (el: HTMLDivElement | null) => void
  name: string
  hidden: boolean
  active: boolean
  renaming: boolean
  dragging: boolean
  onSelect: () => void
  onToggle: () => void
  onStartRename: () => void
  onRename: (v: string) => void
  onDragStart: (e: React.PointerEvent) => void
}) {
  const [hover, setHover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  return (
    <div
      ref={rowRef}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: 'var(--r-md)',
        background: active ? 'var(--accent-soft)' : hover ? 'var(--hover)' : 'transparent',
        opacity: dragging ? 0.5 : 1,
      }}
    >
      <Tooltip label="Drag to reorder" placement="left">
      <button
        type="button"
        aria-label={`Reorder ${name || 'untitled layer'}`}
        onPointerDown={onDragStart}
        style={{
          width: 20, height: 28, display: 'grid', placeItems: 'center', flex: 'none',
          borderRadius: 'var(--r-md)', color: 'var(--muted)', cursor: 'grab', touchAction: 'none',
        }}
      >
        <DotsThree size={14} style={{ transform: 'rotate(90deg)' }} />
      </button>
      </Tooltip>

      <Tooltip label={hidden ? 'Show this layer' : 'Hide this layer'} placement="left">
      <button
        type="button"
        aria-label={hidden ? `Show ${name || 'untitled layer'}` : `Hide ${name || 'untitled layer'}`}
        aria-pressed={!hidden}
        onClick={onToggle}
        style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center', flex: 'none',
          borderRadius: 'var(--r-md)',
          color: hidden ? 'var(--disabled)' : 'var(--muted)',
        }}
      >
        {hidden ? <EyeSlash size={16} /> : <Eye size={16} />}
      </button>
      </Tooltip>

      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={name}
          maxLength={MAX_LAYER_NAME}
          aria-label="Layer name"
          onBlur={(e) => onRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            // Escape reverts by writing the value back untouched.
            if (e.key === 'Escape') {
              e.stopPropagation()
              e.currentTarget.value = name
              e.currentTarget.blur()
            }
          }}
          style={{
            flex: 1, minWidth: 0, height: 28, padding: '0 6px',
            borderRadius: 'var(--r-md)', background: 'var(--panel2)',
            font: 'var(--t-label-sm)', color: 'var(--fg)',
          }}
        />
      ) : (
        <Tooltip label="Click to select, double-click to rename" placement="left">
        <button
          type="button"
          aria-pressed={active}
          onClick={onSelect}
          onDoubleClick={onStartRename}
          style={{
            flex: 1, minWidth: 0, height: 28, padding: '0 4px', textAlign: 'left',
            font: 'var(--t-label-sm)',
            // A hidden layer is still selectable and still paintable — drawing on
            // one reveals it (see Canvas). It just reads as switched off.
            color: hidden ? 'var(--disabled)' : active ? 'var(--fg)' : 'var(--muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {name || <span style={{ color: 'var(--faint)' }}>Untitled</span>}
        </button>
        </Tooltip>
      )}
    </div>
  )
}

// ─── footer controls ─────────────────────────────────────────────────────────

type IconCmp = typeof Plus

function TextBtn({
  label, title, onClick, disabled, Icon,
}: {
  label: string
  title: string
  onClick: () => void
  disabled?: boolean
  Icon?: IconCmp
}) {
  const [hover, setHover] = useState(false)
  return (
    <Tooltip label={title} placement="top">
    <button
      type="button"
      // No aria-label: the visible text is the accessible name. Adding one
      // would override the label a user can actually see, and the tooltip
      // already carries the longer explanation for anyone who hovers.
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        height: 28, display: 'flex', alignItems: 'center', gap: 3,
        padding: Icon ? '0 8px 0 5px' : '0 8px',
        borderRadius: 'var(--r-md)', font: 'var(--t-label-sm)',
        background: hover && !disabled ? 'var(--hover)' : 'transparent',
        color: disabled ? 'var(--disabled)' : 'var(--fg)',
      }}
    >
      {Icon && <Icon size={14} />}
      {label}
    </button>
    </Tooltip>
  )
}

function IconBtn({
  title, Icon, onClick, disabled,
}: {
  title: string
  Icon: IconCmp
  onClick: () => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState(false)
  return (
    <Tooltip label={title} placement="top">
    <button
      type="button"
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        width: 28, height: 28, display: 'grid', placeItems: 'center', flex: 'none',
        borderRadius: 'var(--r-md)',
        background: hover && !disabled ? 'var(--hover)' : 'transparent',
        color: disabled ? 'var(--disabled)' : 'var(--muted)',
      }}
    >
      <Icon size={16} />
    </button>
    </Tooltip>
  )
}
