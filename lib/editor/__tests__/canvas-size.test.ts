import { describe, expect, it } from 'vitest'
import {
  DIM_RANGE_HINT,
  MIN_DIM,
  SIZE_PRESETS,
  lossWarning,
  parseDim,
  pendingSize,
  presetAllowed,
  presetFor,
  sizeLabel,
} from '../canvas-size'
import { createDoc } from '../../artwork-core/create'
import { MAX_DIM, type Doc } from '../../artwork-core/schema'

function docWith(w: number, h: number, paint: Array<[number, number, number]>): Doc {
  const d = createDoc({ id: 'test', w, h })
  const px = d.frames[0]!.layers[0]!.px
  for (const [x, y, v] of paint) px[y * w + x] = v
  return d
}

describe('SIZE_PRESETS', () => {
  /**
   * Eight sized cells plus Custom is the 3x3 grid spec 16 §4.1 measures. A
   * ninth sized preset would silently push Custom onto a fourth row.
   */
  it('is eight presets, so the grid with Custom is exactly 3x3', () => {
    expect(SIZE_PRESETS).toHaveLength(8)
  })

  it('has unique ids and unique sizes', () => {
    expect(new Set(SIZE_PRESETS.map((p) => p.id)).size).toBe(8)
    expect(new Set(SIZE_PRESETS.map((p) => `${p.w}x${p.h}`)).size).toBe(8)
  })

  it('is every preset the spec names, at the sizes it names', () => {
    const byId = Object.fromEntries(SIZE_PRESETS.map((p) => [p.id, [p.w, p.h]]))
    expect(byId).toEqual({
      '16': [16, 16],
      '32': [32, 32],
      '64': [64, 64],
      '128': [128, 128],
      '256': [256, 256],
      '16:9': [64, 36],
      banner: [128, 32],
      portrait: [48, 64],
    })
  })

  /** S-E1. Every preset is inside the schema, so none of them ships disabled. */
  it('is entirely within the schema limits', () => {
    for (const p of SIZE_PRESETS) expect(presetAllowed(p)).toBe(true)
  })
})

describe('presetFor', () => {
  it('finds the square presets', () => {
    expect(presetFor(16, 16)).toBe('16')
    expect(presetFor(256, 256)).toBe('256')
  })

  it('finds the aspect presets', () => {
    expect(presetFor(64, 36)).toBe('16:9')
    expect(presetFor(128, 32)).toBe('banner')
    expect(presetFor(48, 64)).toBe('portrait')
  })

  it('is custom for anything else, including a transposed preset', () => {
    expect(presetFor(17, 16)).toBe('custom')
    expect(presetFor(36, 64)).toBe('custom') // 16:9 the other way up is not 16:9
    expect(presetFor(64, 48)).toBe('custom')
  })

  /** The round trip that makes the presets and the fields one mechanism. */
  it('round-trips every preset through its own size', () => {
    for (const p of SIZE_PRESETS) expect(presetFor(p.w, p.h)).toBe(p.id)
  })
})

describe('parseDim', () => {
  it('accepts a plain integer, with or without surrounding space', () => {
    expect(parseDim('32')).toEqual({ ok: true, value: 32 })
    expect(parseDim(' 32 ')).toEqual({ ok: true, value: 32 })
    expect(parseDim('007')).toEqual({ ok: true, value: 7 })
  })

  it('accepts both ends of the schema exactly', () => {
    expect(parseDim(String(MIN_DIM))).toEqual({ ok: true, value: MIN_DIM })
    expect(parseDim(String(MAX_DIM))).toEqual({ ok: true, value: MAX_DIM })
  })

  /** Blank is not an error — it is what backspacing over a value looks like. */
  it('treats blank as empty rather than as a mistake', () => {
    for (const t of ['', '   ']) {
      const r = parseDim(t)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.reason).toBe('empty')
        expect(r.message).toBe('')
      }
    }
  })

  it('rejects out of range with the reason on screen — S-E1', () => {
    for (const t of ['0', '257', '9999']) {
      const r = parseDim(t)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.reason).toBe('range')
        expect(r.message).toBe(DIM_RANGE_HINT)
      }
    }
  })

  it('rejects rather than rounds a non-integer, and rejects text', () => {
    for (const t of ['16.5', '1e2', '-8', '3２', 'sixteen', '16px', '+16']) {
      expect(parseDim(t).ok).toBe(false)
    }
  })
})

describe('pendingSize', () => {
  const doc = docWith(16, 16, [[8, 8, 1]])

  it('is same at the current size, so apply has nothing to do', () => {
    expect(pendingSize(doc, '16', '16')).toEqual({ kind: 'same', w: 16, h: 16 })
  })

  it('is ready, and lossless, when growing', () => {
    expect(pendingSize(doc, '32', '32')).toEqual({ kind: 'ready', w: 32, h: 32, lost: 0 })
  })

  it('is ready on one axis alone', () => {
    expect(pendingSize(doc, '16', '32')).toEqual({ kind: 'ready', w: 16, h: 32, lost: 0 })
  })

  it('reports the crop count before anything happens — S-E2', () => {
    // Four corners of an 8x8; shrinking to 4x4 keeps the middle and loses all four.
    const corners = docWith(8, 8, [[0, 0, 1], [7, 0, 1], [0, 7, 1], [7, 7, 1]])
    expect(pendingSize(corners, '4', '4')).toEqual({ kind: 'ready', w: 4, h: 4, lost: 4 })
  })

  it('is lossless when a shrink only crops transparent pixels', () => {
    const middle = docWith(8, 8, [[4, 4, 1]])
    expect(pendingSize(middle, '4', '4')).toEqual({ kind: 'ready', w: 4, h: 4, lost: 0 })
  })

  it('is invalid while a field is blank, and says nothing about it', () => {
    expect(pendingSize(doc, '', '16')).toEqual({ kind: 'invalid', message: '' })
    expect(pendingSize(doc, '16', '')).toEqual({ kind: 'invalid', message: '' })
  })

  it('is invalid with the range hint when a field is out of range', () => {
    expect(pendingSize(doc, '512', '16')).toEqual({ kind: 'invalid', message: DIM_RANGE_HINT })
    expect(pendingSize(doc, '16', '0')).toEqual({ kind: 'invalid', message: DIM_RANGE_HINT })
  })

  /** A blank field must not suppress a real error in the other one. */
  it('reports the range error even when the other field is blank', () => {
    expect(pendingSize(doc, '', '999')).toEqual({ kind: 'invalid', message: DIM_RANGE_HINT })
  })

  it('is invalid with no document rather than throwing', () => {
    expect(pendingSize(null, '16', '16')).toEqual({ kind: 'invalid', message: '' })
  })
})

describe('sizeLabel', () => {
  it('is the size and nothing else — the button says what you will get', () => {
    expect(sizeLabel(32, 32)).toBe('32×32')
    expect(sizeLabel(128, 32)).toBe('128×32')
  })
})

describe('lossWarning', () => {
  it('says nothing when nothing is lost', () => {
    expect(lossWarning(0, 32, 32)).toBeNull()
    expect(lossWarning(-1, 32, 32)).toBeNull()
  })

  it('agrees with itself about one pixel', () => {
    expect(lossWarning(1, 8, 8)).toBe(
      '1 painted pixel falls outside 8×8 and will be dropped. Undo restores it.',
    )
  })

  it('carries the count, the target size and the escape hatch', () => {
    const m = lossWarning(47, 16, 16)!
    expect(m).toContain('47 painted pixels')
    expect(m).toContain('16×16')
    expect(m).toContain('Undo')
  })
})
