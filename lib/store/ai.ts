'use client'

/**
 * AI proposal lifecycle. See docs/specs/06-ai-protocol.md §7.
 *
 *   idle -> pending -> review -> (accept | reject) -> idle
 *                   -> error  -> (retry | dismiss)
 *
 * The proposal is transient and is NOT part of the document. Reject discards it;
 * nothing was ever mutated. Accept pushes ONE ai_edit command, so a single undo
 * reverses the whole thing.
 */

import { create } from 'zustand'
import type { Doc, PaletteEntry } from '../artwork-core/schema'
import type { Op } from '../artwork-core/ops'
import { applyOps } from '../artwork-core/ops'
import { diff as computeDiff, type PixelDiff } from '../artwork-core/diff'
import type { PaintCell } from '../artwork-core/commands'
import { useDocStore } from './editor'

export type AiStatus = 'idle' | 'pending' | 'review' | 'error'

export type Proposal = {
  instruction: string
  summary: string
  ops: Op[]
  diff: PixelDiff
  preview: Doc
  frame: number
  latencyMs?: number
}

type AiState = {
  status: AiStatus
  instruction: string
  proposal: Proposal | null
  error: string | null
  /** 'after' shows the proposed result; 'before' peeks at the original */
  view: 'after' | 'before'

  setInstruction: (s: string) => void
  submit: () => Promise<void>
  accept: () => void
  reject: () => void
  setView: (v: 'after' | 'before') => void
  dismissError: () => void
}

export const useAiStore = create<AiState>((set, get) => ({
  status: 'idle',
  instruction: '',
  proposal: null,
  error: null,
  view: 'after',

  setInstruction: (s) => set({ instruction: s }),
  setView: (v) => set({ view: v }),
  dismissError: () => set({ status: 'idle', error: null }),

  submit: async () => {
    const instruction = get().instruction.trim()
    if (!instruction || get().status === 'pending') return

    const { doc, frame } = useDocStore.getState()
    if (!doc) return

    set({ status: 'pending', error: null })

    try {
      const res = await fetch('/api/ai/edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doc: serialize(doc), frame, instruction }),
      })
      const data = (await res.json()) as Record<string, unknown>

      if (!res.ok) {
        set({ status: 'error', error: String(data.message ?? 'Something went wrong.') })
        return
      }

      const ops = data.operations as Op[]
      // Re-apply locally: the preview is derived here, not trusted from the wire.
      const applied = applyOps(doc, ops, frame)
      if (!applied.ok) {
        set({ status: 'error', error: 'The proposed edit could not be applied. Nothing changed.' })
        return
      }

      set({
        status: 'review',
        view: 'after',
        proposal: {
          instruction,
          summary: String(data.summary ?? ''),
          ops,
          diff: computeDiff(doc, applied.value, frame),
          preview: applied.value,
          frame,
          latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
        },
      })
    } catch {
      set({ status: 'error', error: "Couldn't reach the server. Your artwork is safe." })
    }
  },

  accept: () => {
    const p = get().proposal
    const { doc } = useDocStore.getState()
    if (!p || !doc) return

    // Build the before/after cell list from the diff so undo is a pure swap.
    const cells: PaintCell[] = []
    for (const [x, y, to] of p.diff.added) cells.push([x, y, 0, to])
    for (const [x, y, from, to] of p.diff.changed) cells.push([x, y, from, to])
    for (const [x, y, from] of p.diff.removed) cells.push([x, y, from, 0])

    const paletteAdded: PaletteEntry[] = p.diff.paletteAdded.map((e) => ({ ...e }))

    useDocStore.getState().commit({
      type: 'ai_edit',
      label: `AI: ${p.instruction}`,
      frame: p.frame,
      cells,
      summary: p.summary,
      ops: p.ops,
      paletteAdded,
    })

    set({ status: 'idle', proposal: null, instruction: '', error: null })
  },

  reject: () => set({ status: 'idle', proposal: null, error: null }),
}))

/** Serialize without importing the codec's Doc->string path into the store bundle twice. */
function serialize(doc: Doc): unknown {
  return {
    v: doc.v,
    id: doc.id,
    name: doc.name,
    w: doc.w,
    h: doc.h,
    palette: doc.palette,
    frames: doc.frames.map((f) => ({
      ms: f.ms,
      layers: f.layers.map((l) => ({
        n: l.n,
        ...(l.hidden ? { hidden: true } : {}),
        px: encode(l.px, doc.w, doc.h),
      })),
    })),
    meta: doc.meta,
  }
}

function encode(px: Uint8Array, w: number, h: number): string[] {
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      const i = px[y * w + x]!
      row += i === 0 ? '.' : i <= 9 ? String(i) : String.fromCharCode(87 + i)
    }
    rows.push(row)
  }
  return rows
}
