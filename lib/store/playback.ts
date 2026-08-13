'use client'

/**
 * Playback — spec 10 §3. Wall-clock scheduled: a module-scope
 * `requestAnimationFrame` loop reads `frameAtElapsed` (lib/editor/playback.ts)
 * against the real clock and calls `setFrame`. Display-only — it never calls
 * `commit`, so it never touches undo history, matching rule 4's "commit is the
 * one writer" (setFrame is not a document write; see editor.ts).
 *
 * Browser-only by construction (rAF, document.visibilitychange) — wired up
 * lazily on first `play()` rather than at module load, so importing this file
 * in a node test does not require a DOM.
 */

import { create } from 'zustand'
import { useDocStore } from './editor'
import { useEditorStore } from './editor'
import { frameAtElapsed } from '../editor/playback'

type PlaybackState = {
  playing: boolean
  play: () => void
  pause: () => void
  toggle: () => void
}

let rafId: number | null = null
let startedAt = 0
let sideEffectsAttached = false

function durations(): number[] {
  const doc = useDocStore.getState().doc
  return doc ? doc.frames.map((f) => f.ms) : []
}

function tick(now: number) {
  const ds = durations()
  if (ds.length <= 1) {
    usePlaybackStore.getState().pause()
    return
  }
  const pingPong = useEditorStore.getState().pingPong
  useDocStore.getState().setFrame(frameAtElapsed(ds, now - startedAt, pingPong))
  rafId = requestAnimationFrame(tick)
}

/**
 * Wired once, lazily, the first time playback starts: a background-tab pause
 * (§3 — "a background tab is not burning frames") and an edit-during-playback
 * pause (§3 — "editing while playing pauses playback and selects the edited
 * frame", the frame already being current since edits target `ctx.frame()`,
 * the same index this loop is driving).
 */
function attachSideEffects() {
  if (sideEffectsAttached) return
  sideEffectsAttached = true

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) usePlaybackStore.getState().pause()
  })

  useDocStore.subscribe((state, prev) => {
    if (state.past.length !== prev.past.length && usePlaybackStore.getState().playing) {
      usePlaybackStore.getState().pause()
    }
  })
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  playing: false,

  play: () => {
    if (get().playing) return
    if (durations().length <= 1) return
    attachSideEffects()
    startedAt = performance.now()
    set({ playing: true })
    rafId = requestAnimationFrame(tick)
  },

  pause: () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    set({ playing: false })
  },

  toggle: () => (get().playing ? get().pause() : get().play()),
}))
