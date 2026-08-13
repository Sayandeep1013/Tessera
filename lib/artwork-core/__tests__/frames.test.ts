import { describe, expect, it } from 'vitest'
import { clampFrame, DEFAULT_FRAME_MS, MAX_FRAMES } from '../frames'
import { docOf } from './helpers'
import type { PaletteEntry } from '../schema'

const PAL: PaletteEntry[] = [{ c: 'transparent' }, { c: '#111111' }]

describe('clampFrame', () => {
  it('clamps into range', () => {
    const doc = docOf(['1.', '..'], PAL)
    doc.frames = [doc.frames[0]!, doc.frames[0]!, doc.frames[0]!]
    expect(clampFrame(doc, -4)).toBe(0)
    expect(clampFrame(doc, 1)).toBe(1)
    expect(clampFrame(doc, 99)).toBe(2)
  })

  it('is 0 for a null document', () => {
    expect(clampFrame(null, 5)).toBe(0)
  })

  it('floors a fractional index and rejects non-finite input', () => {
    const doc = docOf(['1.', '..'], PAL)
    expect(clampFrame(doc, 0.9)).toBe(0)
    expect(clampFrame(doc, NaN)).toBe(0)
    expect(clampFrame(doc, Infinity)).toBe(0)
  })
})

describe('constants', () => {
  it('MAX_FRAMES matches the spec cap', () => {
    expect(MAX_FRAMES).toBe(64)
  })

  it('DEFAULT_FRAME_MS is within the schema bounds', () => {
    expect(DEFAULT_FRAME_MS).toBeGreaterThanOrEqual(10)
    expect(DEFAULT_FRAME_MS).toBeLessThanOrEqual(10_000)
  })
})
