import { describe, expect, it } from 'vitest'
import { formatPct, frameWindows, hardCutEpsilon } from '../timeline'

describe('frameWindows', () => {
  it('splits three equal-duration frames into equal thirds', () => {
    const w = frameWindows([{ ms: 100 }, { ms: 100 }, { ms: 100 }])
    expect(w[0]!.start).toBe(0)
    expect(w[0]!.end).toBeCloseTo(100 / 3)
    expect(w[1]!.start).toBeCloseTo(100 / 3)
    expect(w[2]!.end).toBe(100)
  })

  it('weights windows by each frame\'s own duration', () => {
    const w = frameWindows([{ ms: 100 }, { ms: 300 }])
    expect(w[0]).toEqual({ start: 0, end: 25 })
    expect(w[1]).toEqual({ start: 25, end: 100 })
  })

  it('a single frame spans the whole timeline', () => {
    expect(frameWindows([{ ms: 250 }])).toEqual([{ start: 0, end: 100 }])
  })

  it('always starts at 0 and ends at 100', () => {
    const w = frameWindows([{ ms: 10 }, { ms: 9999 }, { ms: 30 }])
    expect(w[0]!.start).toBe(0)
    expect(w[w.length - 1]!.end).toBe(100)
  })
})

describe('hardCutEpsilon', () => {
  it('is the fixed 0.01 for an ordinary window', () => {
    expect(hardCutEpsilon(50)).toBe(0.01)
  })

  it('shrinks to a tenth of a window narrower than 0.1%', () => {
    expect(hardCutEpsilon(0.05)).toBeCloseTo(0.005)
  })

  it('never exceeds the window it cuts, even at the 64-frame/10ms extreme', () => {
    // 64 frames of 10ms is the tightest real document this app allows.
    const width = 100 / 64
    expect(hardCutEpsilon(width)).toBeLessThan(width)
  })
})

describe('formatPct', () => {
  it('trims trailing zeros', () => {
    expect(formatPct(25)).toBe('25')
    expect(formatPct(33.33)).toBe('33.33')
  })

  it('trims to exactly zero cleanly', () => {
    expect(formatPct(0)).toBe('0')
  })

  it('keeps up to 4 decimal places', () => {
    expect(formatPct(33.333333)).toBe('33.3333')
  })
})
