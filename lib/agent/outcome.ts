/**
 * What the panel says a run did. See docs/specs/15-feedback-and-input.md §3.
 *
 * Reported from real use: "told ai to draw a smily face .. it worked for
 * sometime and no changes were made .. as if the ai didnt work".
 *
 * The model had replied in prose without calling anything, so runAgent ended
 * with stoppedBy 'no-calls' and a summary of that prose. The panel rendered the
 * sentence — which claimed success — above three counters reading zero, and
 * withheld "Undo all" because it is gated on changed > 0. Nothing on screen
 * distinguished it from a real edit.
 *
 * Hence the rule this module exists to enforce: the panel's own verdict, which
 * is computed from the diff, outranks whatever the model said about itself. The
 * model's sentence is still shown, because it is often the useful part ("I
 * couldn't find a face to modify"), but it is never the headline. A model is
 * not a reliable narrator of its own effects.
 */

import type { SessionOutcome } from './session'

export type OutcomeTone = 'normal' | 'warning' | 'neutral'

export type Outcome = {
  headline: string
  tone: OutcomeTone
  /** Whether there is anything for "Undo all" to undo. */
  undoable: boolean
}

/**
 * Exhaustive over stoppedBy on purpose. Adding a new stop reason is a type
 * error here until it has been given something to say, which is the point —
 * the fault above was a state nobody had written a sentence for.
 */
export function describeOutcome(
  changed: number,
  stoppedBy: SessionOutcome['stoppedBy'] | null,
): Outcome {
  if (changed > 0) {
    return {
      headline: `${changed} pixel${changed === 1 ? '' : 's'} changed`,
      tone: 'normal',
      undoable: true,
    }
  }

  switch (stoppedBy) {
    case 'no-calls':
      return { headline: 'No changes were made.', tone: 'warning', undoable: false }
    case 'finish':
      return {
        headline: 'The agent finished without changing anything.',
        tone: 'warning',
        undoable: false,
      }
    case 'cap':
      return {
        headline: 'Stopped at the step limit without changing anything.',
        tone: 'warning',
        undoable: false,
      }
    case 'abort':
      // Neutral, not a warning: the user asked for this one.
      return { headline: 'Stopped. Nothing was changed.', tone: 'neutral', undoable: false }
    case 'error':
      // ErrorRow owns this case and renders instead of DoneRow. Covered so the
      // switch stays exhaustive rather than falling through to a guess.
      return { headline: 'Nothing was changed.', tone: 'warning', undoable: false }
    case null:
      return { headline: 'Nothing was changed.', tone: 'warning', undoable: false }
  }
}
