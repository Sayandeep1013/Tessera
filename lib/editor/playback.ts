/**
 * Playback scheduling — pure. See docs/specs/10-animation.md §3.
 *
 * Wall-clock scheduled: given how long playback has been running, compute
 * which frame should be showing right now. Never `setTimeout(ms)` per frame,
 * which drifts and compounds a dropped frame into a growing lag. Computing the
 * frame fresh from elapsed time means a dropped frame (a slow tab, a GC pause)
 * self-corrects on the very next tick instead of catching up one frame at a
 * time.
 *
 * `lib/store/playback.ts` owns the rAF loop and the actual wall clock; this
 * module is the arithmetic underneath it, kept separate so it is testable in
 * node without faking `requestAnimationFrame`.
 */

export type Playback = { playing: boolean; frame: number; startedAt: number; loop: boolean }

/**
 * Which frame is showing after `elapsedMs` of playback, given each frame's
 * duration in the same order as `doc.frames`.
 *
 * Non-ping-pong: walks the cumulative durations modulo their sum. Ping-pong
 * appends the reverse of the interior frames (excluding both ends, so the
 * first and last frame are not held twice at the turnaround) before doing the
 * same walk over the doubled-back sequence.
 *
 * Returns 0 for zero or one frame — there is nothing to advance to.
 */
export function frameAtElapsed(durations: number[], elapsedMs: number, pingPong = false): number {
  const n = durations.length
  if (n <= 1) return 0

  if (!pingPong) return walk(durations, elapsedMs)

  // The interior frames' durations, reversed: for [d0, d1, d2, d3] this is
  // [d2, d1] — the return trip visits frames 2 then 1, using each frame's own
  // duration, before the cycle repeats at frame 0.
  const back = durations.slice(1, n - 1).reverse()
  const cycle = [...durations, ...back]
  const idx = walk(cycle, elapsedMs)
  return idx < n ? idx : n - 2 - (idx - n)
}

/** Cumulative walk over `durations`, modulo their sum. */
function walk(durations: number[], elapsedMs: number): number {
  const total = durations.reduce((a, b) => a + b, 0)
  if (total <= 0) return 0
  let t = elapsedMs % total
  if (t < 0) t += total
  for (let i = 0; i < durations.length; i++) {
    if (t < durations[i]!) return i
    t -= durations[i]!
  }
  return durations.length - 1
}
