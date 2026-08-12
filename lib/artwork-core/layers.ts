/**
 * Layer helpers. See docs/specs/14-layers.md §3.
 *
 * Small on purpose. The format has carried `frames[].layers[]` since v1 and the
 * renderer has always composited it; what was missing was the handful of
 * questions the editor needs to ask about a stack — what is on top here, is this
 * index still valid, what do I call the next one.
 */

import type { Doc } from './schema'

/**
 * Ceiling on layers per frame, enforced by `add_layer` and by the panel —
 * deliberately NOT by the zod schema. Tightening `serializedFrameSchema` would
 * make a hand-authored 20-layer file fail to parse, and refusing to open
 * somebody's artwork is a bigger problem than a long list. The cap exists to
 * keep the panel and the serialized document sane, not to police input.
 */
export const MAX_LAYERS = 16

/** Longest layer name the format accepts (`serializedLayerSchema`). */
export const MAX_LAYER_NAME = 32

/**
 * The palette index the user actually sees at (x, y): the topmost visible,
 * non-transparent layer. Returns 0 when every layer is clear there.
 *
 * Walks top-down and stops, rather than compositing bottom-up, because the
 * answer is the first hit.
 */
export function compositeAt(doc: Doc, frame: number, x: number, y: number): number {
  const layers = doc.frames[frame]?.layers
  if (!layers || x < 0 || y < 0 || x >= doc.w || y >= doc.h) return 0
  const p = y * doc.w + x
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!
    if (layer.hidden) continue
    const idx = layer.px[p]!
    if (idx !== 0) return idx
  }
  return 0
}

/** Clamp an index into the frame's layer range. 0 when the frame is missing. */
export function clampLayer(doc: Doc | null, frame: number, layer: number): number {
  const count = doc?.frames[frame]?.layers.length ?? 0
  if (count === 0) return 0
  if (!Number.isFinite(layer)) return 0
  return Math.max(0, Math.min(count - 1, Math.floor(layer)))
}

/**
 * "Layer 2", "Layer 3", … skipping names already taken in this frame. Bounded by
 * the layer cap plus slack, so a frame full of oddly-named layers still
 * terminates. Never longer than MAX_LAYER_NAME.
 */
export function nextLayerName(doc: Doc, frame: number): string {
  const taken = new Set((doc.frames[frame]?.layers ?? []).map((l) => l.n))
  for (let n = taken.size + 1; n <= taken.size + MAX_LAYERS + 2; n++) {
    const name = `Layer ${n}`
    if (!taken.has(name)) return name.slice(0, MAX_LAYER_NAME)
  }
  return 'Layer'
}

/** Trim, collapse whitespace, and cut to the format's limit. */
export function cleanLayerName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LAYER_NAME)
}
