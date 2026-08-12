'use client'

/**
 * The layer panel. See docs/specs/14-layers.md §6.
 *
 * Rows are listed TOP LAYER FIRST — the reverse of `frames[].layers`, because
 * index 0 is the bottom of the stack and every editor draws a stack the way it
 * looks. The index on screen is never the array index; `rows` does that mapping
 * once so nothing else has to think about it.
 *
 * Every control here goes through commit(), so every one is a single undo step.
 * Select and hide are the two that differ: select is UI state (like choosing a
 * tool) and never enters history, while hide changes `hidden`, which is
 * serialized, so it does.
 */

import { useEffect, useRef, useState } from 'react'
import { useDocStore } from '@/lib/store/editor'
import { chromeFor, useTier, type Tier } from '@/lib/editor/breakpoint'
import { cloneLayer } from '@/lib/artwork-core/commands'
import { MAX_LAYERS, MAX_LAYER_NAME, cleanLayerName, nextLayerName } from '@/lib/artwork-core/layers'
import { CaretDown, CaretUp, Eye, EyeSlash, Plus } from './icons'

const WIDTH: Record<Tier, number> = { wide: 248, compact: 248, tablet: 224, mobile: 224 }

export function LayersPanel({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc)
  const frame = useDocStore((s) => s.frame)
  const active = useDocStore((s) => s.layer)
  const setLayer = useDocStore((s) => s.setLayer)
  const commit = useDocStore((s) => s.commit)
  const tier = useTier()
  const c = chromeFor(tier)
  const [renaming, setRenaming] = useState<number | null>(null)

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

  const full = layers.length >= MAX_LAYERS

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
        {rows.map(({ layer, i }) => (
          <LayerRow
            key={`${i}-${layer.n}`}
            name={layer.n}
            hidden={Boolean(layer.hidden)}
            active={i === active}
            renaming={renaming === i}
            onSelect={() => setLayer(i)}
            onToggle={() => toggle(i)}
            onStartRename={() => setRenaming(i)}
            onRename={(v) => rename(i, v)}
          />
        ))}
      </div>

      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: 4,
          borderTop: '1px solid var(--line)',
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
    </div>
  )
}

// ─── row ─────────────────────────────────────────────────────────────────────

function LayerRow({
  name, hidden, active, renaming, onSelect, onToggle, onStartRename, onRename,
}: {
  name: string
  hidden: boolean
  active: boolean
  renaming: boolean
  onSelect: () => void
  onToggle: () => void
  onStartRename: () => void
  onRename: (v: string) => void
}) {
  const [hover, setHover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  return (
    <div
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: 'var(--r-md)',
        background: active ? 'var(--accent-soft)' : hover ? 'var(--hover)' : 'transparent',
      }}
    >
      <button
        type="button"
        title={hidden ? 'Show this layer' : 'Hide this layer'}
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
        <button
          type="button"
          aria-pressed={active}
          title="Click to select, double-click to rename"
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
    <button
      type="button"
      title={title}
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
    <button
      type="button"
      title={title}
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
  )
}
