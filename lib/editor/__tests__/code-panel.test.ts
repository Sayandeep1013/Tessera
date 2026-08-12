import { describe, expect, it } from 'vitest'
import {
  CODE_DEFAULT_W, CODE_MAX_W, CODE_MIN_W, COALESCE_MS, DOC_TO_TEXT_MS, EDIT_LABEL,
  MAX_MARK, STATUS_VALID, TEXT_TO_DOC_MS,
  caretCell, caretLine, cellRange, clampCodeWidth, errorLine, lineAt, readCodeWidth,
  shouldCoalesce,
} from '../code-panel'
import { pxRowRanges } from '../json-locate'
import { serializeDoc } from '../../artwork-core/codec'
import { createDoc } from '../../artwork-core/create'

const text = () => serializeDoc(createDoc({ id: 'c', w: 4, h: 3, now: '2026-08-12T00:00:00.000Z' }))
const rows = () => pxRowRanges(text(), 0, 0)

describe('width — §1, and the ceiling §1 does not have', () => {
  it('clamps to the specced range', () => {
    expect(clampCodeWidth(100)).toBe(CODE_MIN_W)
    expect(clampCodeWidth(9999)).toBe(CODE_MAX_W)
    expect(clampCodeWidth(500)).toBe(500)
  })

  /** A split panel may not take the thing it is split from. */
  it('never takes more than half the window', () => {
    expect(clampCodeWidth(800, 900)).toBe(450)
    expect(clampCodeWidth(800, 2000)).toBe(CODE_MAX_W)
  })

  it('keeps the minimum even on a window too small for it', () => {
    // Below 640 the panel is a sheet (§7), so this is the tablet floor rather
    // than a phone — but the function must not return 160 whatever it is asked.
    expect(clampCodeWidth(400, 320)).toBe(CODE_MIN_W)
  })

  it('reads a stored width back', () => {
    expect(readCodeWidth('520', 2000)).toBe(520)
  })

  it('falls back to the default for nothing stored or nonsense stored', () => {
    for (const stored of [null, '', 'wide', 'NaN']) {
      expect(readCodeWidth(stored, 2000)).toBe(CODE_DEFAULT_W)
    }
  })

  it('re-clamps a stored width against the window it is opening in', () => {
    // Saved on a desktop, reopened on a laptop.
    expect(readCodeWidth('780', 1000)).toBe(500)
  })
})

describe('the two debounces — §2', () => {
  /**
   * The asymmetry is the design. Equal delays would either flash parse errors
   * at somebody mid-keystroke or make a stroke feel disconnected from the text.
   */
  it('is slower from the panel than from the canvas', () => {
    expect(TEXT_TO_DOC_MS).toBeGreaterThan(DOC_TO_TEXT_MS)
  })

  it('keeps the canvas side fast enough to feel live', () => {
    expect(DOC_TO_TEXT_MS).toBeLessThanOrEqual(120)
  })

  it('keeps the panel side slow enough to survive a half-typed row', () => {
    expect(TEXT_TO_DOC_MS).toBeGreaterThanOrEqual(250)
  })
})

describe('undo coalescing — §5', () => {
  it('joins edits inside the window', () => {
    expect(shouldCoalesce(1000, 1000 + COALESCE_MS - 1)).toBe(true)
    expect(shouldCoalesce(1000, 1001)).toBe(true)
  })

  it('starts a new step at the window and beyond', () => {
    expect(shouldCoalesce(1000, 1000 + COALESCE_MS)).toBe(false)
    expect(shouldCoalesce(1000, 1000 + COALESCE_MS + 1)).toBe(false)
  })

  /** No previous panel edit: the first edit after opening, or after a stroke. */
  it('never joins when there is nothing to join', () => {
    expect(shouldCoalesce(null, 5000)).toBe(false)
  })

  /** §8: ten keystrokes within 2s are one step, two edits 3s apart are two. */
  it('collapses a burst and separates a pause', () => {
    let last: number | null = null
    let steps = 0
    for (const t of [0, 120, 240, 360, 480, 600, 720, 840, 960, 1080]) {
      if (!shouldCoalesce(last, t)) steps++
      last = t
    }
    expect(steps).toBe(1)
    expect(shouldCoalesce(last, 1080 + 3000)).toBe(false)
  })

  it('labels the command so the store can recognise its own', () => {
    expect(EDIT_LABEL).toBe('Edit code')
  })
})

describe('caretCell — the sentence that makes it literal', () => {
  it('maps a caret inside a row to a pixel', () => {
    const r = rows()
    expect(caretCell(r, r[1]!.from)).toEqual({ x: 0, y: 1 })
    expect(caretCell(r, r[1]!.from + 2)).toEqual({ x: 2, y: 1 })
    expect(caretCell(r, r[2]!.from + 3)).toEqual({ x: 3, y: 2 })
  })

  /** A caret resting after the last character is still in that row to anyone
   *  typing, and clamping it beats reporting nothing at the end of every row. */
  it('keeps the last cell when the caret rests past the end of a row', () => {
    const r = rows()
    expect(caretCell(r, r[0]!.to)).toEqual({ x: 3, y: 0 })
  })

  it('is null anywhere else in the file, which is most of it', () => {
    expect(caretCell(rows(), 0)).toBeNull()
    expect(caretCell(rows(), text().length - 1)).toBeNull()
  })

  it('is null when there are no rows to be in', () => {
    expect(caretCell([], 10)).toBeNull()
  })

  it("says it in the artwork's terms, not the buffer's", () => {
    expect(caretLine({ x: 7, y: 12 })).toBe('row 12 · char 7 → pixel (7, 12)')
    expect(caretLine(null)).toBeNull()
  })
})

describe('cellRange — canvas → panel, §4', () => {
  it('is exactly one character', () => {
    const r = cellRange(rows(), 2, 1)
    expect(r!.to - r!.from).toBe(1)
  })

  it('round-trips with caretCell', () => {
    const rs = rows()
    for (const [x, y] of [[0, 0], [3, 0], [1, 2], [2, 1]] as const) {
      expect(caretCell(rs, cellRange(rs, x, y)!.from)).toEqual({ x, y })
    }
  })

  it('is null off the end of a row or past the last row', () => {
    expect(cellRange(rows(), 4, 0)).toBeNull()
    expect(cellRange(rows(), 0, 9)).toBeNull()
  })
})

describe('what the panel says', () => {
  it('reports valid in one word', () => {
    expect(STATUS_VALID).toBe('Valid')
  })

  it('starts the error with a capital, because it is a sentence in a status bar', () => {
    expect(errorLine({ code: 'row_width', message: 'row 2 has 2 characters, expected 4' }))
      .toBe('Row 2 has 2 characters, expected 4')
  })

  it('keeps the detail rather than summarising it away', () => {
    const message = 'pixel at (2, 1) uses palette index 35, but the palette has 16 entries'
    expect(errorLine({ code: 'palette_range', message })).toContain('(2, 1)')
    expect(errorLine({ code: 'palette_range', message })).toContain('16 entries')
  })

  /** §3 degrades a mark that resolved too widely; the message still shows. */
  it('caps a mark well below the size of a document', () => {
    expect(MAX_MARK).toBeGreaterThan(64)
    expect(MAX_MARK).toBeLessThan(serializeDoc(createDoc({ id: 'b', w: 32, h: 32 })).length)
  })
})

describe('lineAt', () => {
  it('is 1-based and counts newlines', () => {
    const t = 'a\nbb\nccc'
    expect(lineAt(t, 0)).toBe(1)
    expect(lineAt(t, 2)).toBe(2)
    expect(lineAt(t, 5)).toBe(3)
  })

  it('agrees with splitting, without allocating a thousand strings to do it', () => {
    const t = text()
    for (const at of [0, 40, 120, t.length - 1, t.length]) {
      expect(lineAt(t, at)).toBe(t.slice(0, at).split('\n').length)
    }
  })
})
