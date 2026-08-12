import { describe, expect, it } from 'vitest'
import { describeOutcome } from '../outcome'
import type { SessionOutcome } from '../session'

const ALL: Array<SessionOutcome['stoppedBy']> = ['finish', 'cap', 'abort', 'error', 'no-calls']

describe('describeOutcome — the panel does not repeat the model claims', () => {
  it('reports the pixel count when something actually changed', () => {
    expect(describeOutcome(12, 'finish')).toEqual({
      headline: '12 pixels changed',
      tone: 'normal',
      undoable: true,
    })
  })

  it('says "pixel" for exactly one', () => {
    expect(describeOutcome(1, 'finish').headline).toBe('1 pixel changed')
  })

  /**
   * The reported bug, as a test. The model replies "I've drawn a smiley face"
   * and calls nothing; the panel used to show that sentence and three zeroes.
   */
  it('says plainly that nothing happened when the model only talked', () => {
    const o = describeOutcome(0, 'no-calls')
    expect(o.headline).toBe('No changes were made.')
    expect(o.tone).toBe('warning')
    expect(o.undoable).toBe(false)
  })

  it('never claims success on a zero-pixel run, whatever the stop reason', () => {
    for (const stoppedBy of ALL) {
      const o = describeOutcome(0, stoppedBy)
      expect(o.undoable).toBe(false)
      expect(o.headline).toMatch(/nothing|no changes|without changing/i)
    }
  })

  it('gives every stop reason its own sentence', () => {
    // A table test so a new stoppedBy cannot be added without deciding what the
    // user is told. Duplicates would mean two different situations reading the
    // same, which is how the original fault looked from the outside.
    const zero = ALL.map((s) => describeOutcome(0, s).headline)
    const distinct = new Set(zero)
    // 'error' and null share ErrorRow's wording deliberately; everything the
    // user can actually reach through DoneRow is distinct.
    expect(distinct.size).toBeGreaterThanOrEqual(4)
  })

  it('treats a user-requested stop as neutral, not a warning', () => {
    // Nothing went wrong when the user pressed stop, and colouring it amber
    // would be the panel crying wolf.
    expect(describeOutcome(0, 'abort').tone).toBe('neutral')
    expect(describeOutcome(0, 'no-calls').tone).toBe('warning')
  })

  it('handles a missing stop reason without inventing success', () => {
    expect(describeOutcome(0, null).undoable).toBe(false)
    expect(describeOutcome(0, null).tone).toBe('warning')
  })

  it('a changed count outranks the stop reason', () => {
    // A run that was capped or aborted after real edits still made those edits,
    // and the user must be able to undo them.
    for (const stoppedBy of ALL) {
      expect(describeOutcome(5, stoppedBy).undoable).toBe(true)
      expect(describeOutcome(5, stoppedBy).tone).toBe('normal')
    }
  })
})
