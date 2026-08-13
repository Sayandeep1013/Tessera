/**
 * Frame helpers. See docs/specs/10-animation.md §1 and §0.3.
 *
 * Small on purpose, mirroring lib/artwork-core/layers.ts: the format has carried
 * `frames[]` since v1 and every write path already addresses it by index. What
 * was missing was the handful of questions the timeline needs to ask about the
 * list — is this index still valid, what does a new frame's duration default to.
 */

import type { Doc } from './schema'

/**
 * Ceiling on frames per document, enforced where a frame is ADDED — deliberately
 * NOT by the zod schema, on the same reasoning MAX_LAYERS gives (14-layers.md
 * §3): tightening `serializedDocSchema` would make a hand-authored 65-frame file
 * fail to open, and refusing to open somebody's artwork is worse than a long
 * filmstrip. 10-animation.md §1.
 */
export const MAX_FRAMES = 64

/** A new frame's duration before anyone changes it. Matches the format example
 *  in docs/HANDOFF.md §1 and every starter fixture. */
export const DEFAULT_FRAME_MS = 100

/** Clamp an index into the document's frame range. 0 when there are no frames. */
export function clampFrame(doc: Doc | null, frame: number): number {
  const count = doc?.frames.length ?? 0
  if (count === 0) return 0
  if (!Number.isFinite(frame)) return 0
  return Math.max(0, Math.min(count - 1, Math.floor(frame)))
}
