/**
 * What Merge down and Flatten say. See docs/specs/14-layers.md §12.5.
 *
 * Same split as `paste.ts`, for the same reason (HANDOFF §11): wording is a
 * decision, and only a module `npm test` can reach without a dev server gives
 * that decision a CI guard.
 */

import type { MergeResult } from '../artwork-core/merge-layers'

const plural = (n: number) => (n === 1 ? '' : 's')

/**
 * `verb` is "Merged" or "Flattened" — the two operations differ only in how
 * many layers they consume, not in what there is to say about the result.
 */
export function mergeReport(verb: string, r: MergeResult): string {
  const layers = `${verb} ${r.layersConsumed} layer${plural(r.layersConsumed)}.`
  const reveal = r.revealedHidden
    ? ` ${r.revealedHidden} hidden layer${plural(r.revealedHidden)} ${r.revealedHidden === 1 ? 'was' : 'were'} revealed first.`
    : ''
  // Same rule 7 shape as paste's report: a merge that quietly needed new
  // colours, or ran out of room for them, says so with the number.
  const colours = r.added ? ` Added ${r.added} colour${plural(r.added)}.` : ''
  const full = r.clipped
    ? ' The palette is full, so some colours were matched to ones already in it.'
    : ''
  return `${layers}${reveal}${colours}${full}`
}
