import { describe, expect, it } from 'vitest'
import { UNTITLED, copyName, duplicateDoc } from '../duplicate'
import { createDoc } from '../create'
import { parseDoc, serializeDoc } from '../codec'
import { MAX_NAME } from '../schema'

const NOW = '2026-08-12T10:00:00.000Z'

function painted() {
  const d = createDoc({ id: 'original', w: 4, h: 4, name: 'face' })
  d.frames[0]!.layers[0]!.px[5] = 3
  return d
}

describe('copyName', () => {
  it('appends "copy" to a plain name', () => {
    expect(copyName('face')).toBe('face copy')
  })

  /** Three duplicates must not produce "face copy copy copy". §7.9. */
  it('numbers the second and later copies instead of stacking the word', () => {
    expect(copyName('face copy')).toBe('face copy 2')
    expect(copyName('face copy 2')).toBe('face copy 3')
    expect(copyName('face copy 9')).toBe('face copy 10')
  })

  it('names an unnamed document rather than producing " copy"', () => {
    expect(copyName('')).toBe(`${UNTITLED} copy`)
    expect(copyName('   ')).toBe(`${UNTITLED} copy`)
  })

  it('does not mistake a name that merely contains the word', () => {
    expect(copyName('copycat')).toBe('copycat copy')
    expect(copyName('copy')).toBe('copy copy')
    expect(copyName('face copy two')).toBe('face copy two copy')
  })

  /** A name one character over MAX_NAME fails to parse on the next load. */
  it('stays inside the schema length, trimming the stem not the suffix', () => {
    const long = 'x'.repeat(MAX_NAME)
    const out = copyName(long)
    expect(out.length).toBeLessThanOrEqual(MAX_NAME)
    expect(out.endsWith(' copy')).toBe(true)
  })

  it('a long name still round-trips through the schema', () => {
    const d = createDoc({ id: 'a', w: 2, h: 2, name: 'y'.repeat(MAX_NAME) })
    const copy = duplicateDoc(d, { id: 'b', now: NOW })
    expect(parseDoc(serializeDoc(copy)).ok).toBe(true)
  })
})

describe('duplicateDoc', () => {
  it('takes a fresh id — otherwise the copy overwrites the original draft', () => {
    const copy = duplicateDoc(painted(), { id: 'fresh', now: NOW })
    expect(copy.id).toBe('fresh')
    expect(copy.id).not.toBe('original')
  })

  it('names it a copy', () => {
    expect(duplicateDoc(painted(), { id: 'b', now: NOW }).name).toBe('face copy')
  })

  it('carries the artwork across exactly', () => {
    const d = painted()
    const copy = duplicateDoc(d, { id: 'b', now: NOW })
    expect([copy.w, copy.h]).toEqual([d.w, d.h])
    expect(Array.from(copy.frames[0]!.layers[0]!.px))
      .toEqual(Array.from(d.frames[0]!.layers[0]!.px))
    expect(copy.palette).toEqual(d.palette)
  })

  /** A shallow copy would leave the two documents painting each other. */
  it('does not share pixel buffers with the original', () => {
    const d = painted()
    const copy = duplicateDoc(d, { id: 'b', now: NOW })
    copy.frames[0]!.layers[0]!.px[0] = 7
    expect(d.frames[0]!.layers[0]!.px[0]).toBe(0)
  })

  it('does not share the palette either', () => {
    const d = painted()
    const copy = duplicateDoc(d, { id: 'b', now: NOW })
    copy.palette[1]!.c = '#000000'
    expect(d.palette[1]!.c).not.toBe('#000000')
  })

  it('leaves the original untouched', () => {
    const d = painted()
    const before = JSON.parse(serializeDoc(d))
    duplicateDoc(d, { id: 'b', now: NOW })
    expect(JSON.parse(serializeDoc(d))).toEqual(before)
  })

  /** Open recent orders by save time; a copy claiming its original's birthday
   *  would be a lie the moment anyone looked. */
  it('is born now, not when the original was', () => {
    const copy = duplicateDoc(painted(), { id: 'b', now: NOW })
    expect(copy.meta.createdAt).toBe(NOW)
    expect(copy.meta.updatedAt).toBe(NOW)
  })

  it('produces a document that parses', () => {
    const copy = duplicateDoc(painted(), { id: 'b', now: NOW })
    expect(parseDoc(serializeDoc(copy)).ok).toBe(true)
  })

  it('duplicating a duplicate keeps counting', () => {
    const a = duplicateDoc(painted(), { id: 'b', now: NOW })
    const b = duplicateDoc(a, { id: 'c', now: NOW })
    expect([a.name, b.name]).toEqual(['face copy', 'face copy 2'])
  })
})
