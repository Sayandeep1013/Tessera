/**
 * Shared timing math for the animated React and CSS exports. See
 * docs/specs/08-exporters.md §5, §9's Phase-5 hooks, and §13.4.
 *
 * Both exports switch a whole property (`visibility`, `box-shadow`) at hard
 * frame boundaries rather than letting the browser interpolate between two
 * different pictures — a blended half-frame is not a frame this document
 * ever had. The trick is two keyframes an instant apart: the property holds
 * its value for the frame's own share of the timeline, then jumps to the
 * next frame's value across a gap too small to see. `hardCutEpsilon` keeps
 * that gap from ever exceeding the window it is cutting into, which a fixed
 * epsilon would risk on a document with many very short frames.
 */

export type FrameWindow = { start: number; end: number }

/** Each frame's [start, end) as a percentage of the total animation, cumulative. */
export function frameWindows(frames: readonly { ms: number }[]): FrameWindow[] {
  const total = frames.reduce((sum, f) => sum + f.ms, 0)
  let cursor = 0
  return frames.map((f) => {
    const start = (cursor / total) * 100
    cursor += f.ms
    const end = (cursor / total) * 100
    return { start, end }
  })
}

/** Never wider than a tenth of the window it cuts, so an extreme document
 *  (many frames at the 10ms floor) cannot let the epsilon swallow a whole
 *  frame's own share of the timeline. */
export function hardCutEpsilon(windowWidth: number): number {
  return Math.min(0.01, windowWidth / 10)
}

/** Fixed precision, trailing zeros trimmed — keeps golden output stable and
 *  the generated CSS legible rather than carrying float noise. */
export function formatPct(n: number): string {
  return n.toFixed(4).replace(/\.?0+$/, '') || '0'
}
