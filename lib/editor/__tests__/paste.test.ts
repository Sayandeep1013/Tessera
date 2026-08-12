import { describe, expect, it } from 'vitest'
import {
  NOTICE_MS, PASTE_NO_CLIPBOARD, PASTE_NO_IMAGE, PASTE_UNREADABLE, pasteReport,
} from '../paste'
import type { PasteResult } from '../../artwork-core/paste-image'

const result = (over: Partial<PasteResult> = {}): PasteResult => ({
  src: { w: 1000, h: 500 },
  at: { x: 0, y: 8, w: 32, h: 16, mode: 'reduce' },
  sourceColours: 214,
  colours: 18,
  added: 18,
  clipped: false,
  cells: 512,
  ...over,
})

describe('pasteReport — F-M3, the count rather than a shrug', () => {
  it('names the loss with its number', () => {
    expect(pasteReport(result())).toBe('Pasted 1000×500 as 32×16. Reduced from 214 colours to 18.')
  })

  it('says the placed size when the image was scaled', () => {
    expect(pasteReport(result())).toContain('as 32×16')
  })

  /** "Pasted 20×10 as 20×10" reads like a bug. */
  it('does not repeat the size when nothing was scaled', () => {
    const r = pasteReport(result({
      src: { w: 20, h: 10 },
      at: { x: 6, y: 11, w: 20, h: 10, mode: 'exact' },
      sourceColours: 7, colours: 7, added: 7, cells: 200,
    }))
    expect(r).toBe('Pasted 20×10. 7 colours.')
    expect(r).not.toContain(' as ')
  })

  it('reports an enlargement as the size it became', () => {
    expect(pasteReport(result({
      src: { w: 16, h: 16 },
      at: { x: 0, y: 0, w: 32, h: 32, mode: 'enlarge' },
      sourceColours: 7, colours: 7, added: 7, cells: 900,
    }))).toBe('Pasted 16×16 as 32×32. 7 colours.')
  })

  it('says the count plainly when nothing was lost', () => {
    expect(pasteReport(result({ sourceColours: 4, colours: 4, cells: 9 })))
      .toContain('4 colours.')
  })

  it('counts one colour as one colour', () => {
    expect(pasteReport(result({ sourceColours: 1, colours: 1, cells: 9 })))
      .toContain('1 colour.')
  })
})

describe('pasteReport — the honest edges', () => {
  it('says so when the image had nothing visible in it', () => {
    expect(pasteReport(result({ sourceColours: 0, colours: 0, added: 0, cells: 0,
      src: { w: 8, h: 8 }, at: { x: 0, y: 0, w: 8, h: 8, mode: 'exact' } })))
      .toBe('Pasted 8×8. Every pixel was transparent, so nothing changed.')
  })

  /**
   * Claiming a paste and changing nothing is the kind of small lie that makes
   * somebody paste again to check whether it worked.
   */
  it('distinguishes "already there" from "nothing in it"', () => {
    const r = pasteReport(result({ cells: 0 }))
    expect(r).toContain('Nothing changed')
    expect(r).toContain('already on this layer')
    expect(r).not.toContain('transparent')
  })

  it('says when the palette ran out, as its own fact', () => {
    const r = pasteReport(result({ clipped: true, added: 0 }))
    expect(r).toContain('Reduced from 214 colours to 18.')
    expect(r).toContain('The palette is full')
  })

  /**
   * Clipping can happen *after* some colours were added — a few free slots, then
   * none. An earlier draft of the spec said "all already in the palette", which
   * is only true when no slot was free at all.
   */
  it('does not claim every colour was already there when some were added', () => {
    expect(pasteReport(result({ clipped: true, added: 3 }))).not.toContain('all already')
  })

  it('does not mention the palette when there was room throughout', () => {
    expect(pasteReport(result())).not.toContain('palette')
  })
})

describe('the messages that are not a success', () => {
  it('F-M2 never goes silent on an empty clipboard', () => {
    expect(PASTE_NO_IMAGE).toBe('No image on the clipboard.')
  })

  /** F-M5 has to offer the way out, not just report the wall. */
  it('F-M5 offers the fallback rather than only naming the problem', () => {
    expect(PASTE_NO_CLIPBOARD).toContain('choose a file')
  })

  it('a failed decode says the image, not the clipboard', () => {
    expect(PASTE_UNREADABLE).toContain('image')
    expect(PASTE_UNREADABLE).not.toContain('clipboard')
  })

  it('every message is a finished sentence', () => {
    for (const m of [PASTE_NO_IMAGE, PASTE_NO_CLIPBOARD, PASTE_UNREADABLE, pasteReport(result())]) {
      expect(m.trim()).toMatch(/[.!]$/)
      expect(m[0]).toBe(m[0]!.toUpperCase())
    }
  })

  it('a notice is long enough to read and short enough not to be furniture', () => {
    expect(NOTICE_MS).toBeGreaterThanOrEqual(4000)
    expect(NOTICE_MS).toBeLessThanOrEqual(10_000)
  })
})
