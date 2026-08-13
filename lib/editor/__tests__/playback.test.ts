import { describe, expect, it } from 'vitest'
import { frameAtElapsed } from '../playback'

describe('frameAtElapsed — non-ping-pong', () => {
  it('the spec example: 250ms on [100,100,100] lands on frame 2', () => {
    expect(frameAtElapsed([100, 100, 100], 250)).toBe(2)
  })

  it('lands on frame 0 at the very start', () => {
    expect(frameAtElapsed([100, 100, 100], 0)).toBe(0)
  })

  it('a duration boundary belongs to the NEXT frame, not the one ending', () => {
    expect(frameAtElapsed([100, 100, 100], 99)).toBe(0)
    expect(frameAtElapsed([100, 100, 100], 100)).toBe(1)
  })

  it('wraps at the total cycle rather than running off the end', () => {
    expect(frameAtElapsed([100, 100, 100], 300)).toBe(0) // exactly one full cycle
    expect(frameAtElapsed([100, 100, 100], 301)).toBe(0)
    expect(frameAtElapsed([100, 100, 100], 250 + 300)).toBe(2) // one more cycle, same offset
  })

  it('self-corrects after a dropped-frame gap instead of lagging behind', () => {
    // Ten full cycles later at the same offset within the cycle: still frame 2,
    // not "10 cycles worth of frames behind" — the whole point of computing the
    // frame fresh from elapsed time rather than accumulating a counter.
    const durations = [100, 100, 100]
    const total = 300
    expect(frameAtElapsed(durations, 250 + 400)).toBe(frameAtElapsed(durations, 250 + 400 - total))
    expect(frameAtElapsed(durations, 250 + 10 * total)).toBe(2)
  })

  it('respects uneven durations', () => {
    const durations = [50, 200, 10]
    expect(frameAtElapsed(durations, 0)).toBe(0)
    expect(frameAtElapsed(durations, 49)).toBe(0)
    expect(frameAtElapsed(durations, 50)).toBe(1)
    expect(frameAtElapsed(durations, 249)).toBe(1)
    expect(frameAtElapsed(durations, 250)).toBe(2)
    expect(frameAtElapsed(durations, 259)).toBe(2)
    expect(frameAtElapsed(durations, 260)).toBe(0) // wraps
  })

  it('stays at 0 for zero or one frame — nothing to advance to', () => {
    expect(frameAtElapsed([], 5000)).toBe(0)
    expect(frameAtElapsed([100], 5000)).toBe(0)
  })

  it('never goes negative for a negative elapsed value', () => {
    expect(frameAtElapsed([100, 100, 100], -50)).toBe(2)
  })
})

describe('frameAtElapsed — ping-pong', () => {
  const durations = [100, 200, 300, 400] // frames 0,1,2,3

  it('plays forward through all four frames first', () => {
    expect(frameAtElapsed(durations, 0, true)).toBe(0)
    expect(frameAtElapsed(durations, 150, true)).toBe(1)
    expect(frameAtElapsed(durations, 350, true)).toBe(2)
    expect(frameAtElapsed(durations, 750, true)).toBe(3)
  })

  it('then plays the interior frames back down, without holding either end twice', () => {
    // forward leg total = 100+200+300+400 = 1000; return leg is frame 2 for 300ms
    // (its own duration), then frame 1 for 200ms.
    expect(frameAtElapsed(durations, 1100, true)).toBe(2) // first tick of the return leg
    expect(frameAtElapsed(durations, 1299, true)).toBe(2)
    expect(frameAtElapsed(durations, 1300, true)).toBe(1) // second tick of the return leg
    expect(frameAtElapsed(durations, 1499, true)).toBe(1)
  })

  it('wraps back to frame 0 to start the next forward leg', () => {
    // full cycle = 1000 (forward) + 300 + 200 (return) = 1500
    expect(frameAtElapsed(durations, 1500, true)).toBe(0)
    expect(frameAtElapsed(durations, 1550, true)).toBe(frameAtElapsed(durations, 50, true))
  })

  it('with only two frames there is no interior to reverse through — it just alternates', () => {
    const two = [100, 200]
    expect(frameAtElapsed(two, 0, true)).toBe(0)
    expect(frameAtElapsed(two, 150, true)).toBe(1)
    expect(frameAtElapsed(two, 300, true)).toBe(0) // wraps, no held reverse frame
  })

  it('is 0 for zero or one frame, same as the non-ping-pong case', () => {
    expect(frameAtElapsed([], 5000, true)).toBe(0)
    expect(frameAtElapsed([100], 5000, true)).toBe(0)
  })
})
