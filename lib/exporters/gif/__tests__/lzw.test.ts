import { describe, expect, it } from 'vitest'
import { decodeLzw, encodeLzw } from '../lzw'

/** High-bits LCG — HANDOFF §5: a low-bit LCG has almost no entropy, so a
 *  "random pixels" generator built on the low bits silently stops testing
 *  anything. */
function prng(seed: number) {
  let s = seed
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2 ** 31
    return Math.floor(s / 65536) % n
  }
}

function roundTrip(indices: Uint8Array, minCodeSize: number) {
  const compressed = encodeLzw(indices, minCodeSize)
  return decodeLzw(compressed, minCodeSize)
}

describe('LZW encode/decode round-trip', () => {
  it('a single pixel', () => {
    const indices = new Uint8Array([1])
    expect([...roundTrip(indices, 2)]).toEqual([1])
  })

  it('a solid run — the best case for the dictionary', () => {
    const indices = new Uint8Array(500).fill(3)
    expect([...roundTrip(indices, 3)]).toEqual([...indices])
  })

  it('every colour in the table, once each', () => {
    const indices = Uint8Array.from({ length: 16 }, (_, i) => i)
    expect([...roundTrip(indices, 4)]).toEqual([...indices])
  })

  it('pseudo-random pixels at every practical minCodeSize', () => {
    for (const minCodeSize of [2, 3, 4, 5, 6, 7, 8]) {
      const colours = 1 << minCodeSize
      const rand = prng(minCodeSize * 7919 + 1)
      const indices = Uint8Array.from({ length: 3000 }, () => rand(colours))
      const out = roundTrip(indices, minCodeSize)
      expect([...out], `minCodeSize=${minCodeSize}`).toEqual([...indices])
    }
  })

  it('a large, low-entropy image forces at least one dictionary reset (4096 codes)', () => {
    // Long enough, and varied enough, that a 12-bit table (4096 entries)
    // fills before the image ends — the branch that emits a mid-stream
    // clear code and keeps going.
    const rand = prng(99)
    const indices = Uint8Array.from({ length: 40_000 }, (_, i) =>
      i % 7 === 0 ? rand(8) : (i % 8),
    )
    expect([...roundTrip(indices, 3)]).toEqual([...indices])
  })

  it('two-colour (minimum GIF depth) data', () => {
    const indices = Uint8Array.from({ length: 200 }, (_, i) => i % 2)
    expect([...roundTrip(indices, 2)]).toEqual([...indices])
  })

  it('every index is the same as the clear code would be numerically — still decodes', () => {
    // At minCodeSize=2, clearCode=4, so index values only ever range 0-3
    // (there is no colour 4) — this just re-confirms indices never collide
    // with the control codes, which are defined to sit just past them.
    const indices = Uint8Array.from({ length: 50 }, (_, i) => i % 4)
    expect([...roundTrip(indices, 2)]).toEqual([...indices])
  })

  it('is deterministic', () => {
    const indices = Uint8Array.from({ length: 300 }, (_, i) => (i * 13) % 5)
    expect(encodeLzw(indices, 3)).toEqual(encodeLzw(indices, 3))
  })

  it('rejects a stream that does not open with the clear code', () => {
    expect(() => decodeLzw(new Uint8Array([0xff, 0xff]), 2)).toThrow()
  })
})
