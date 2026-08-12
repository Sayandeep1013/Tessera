import { describe, expect, it } from 'vitest'
import {
  RECENT_CORRUPT, RECENT_EMPTY, RECENT_LIMIT, THUMB_MAX_CELLS,
  recentRows, relativeTime,
} from '../recent'
import { createDoc } from '../../artwork-core/create'
import { UNTITLED } from '../../artwork-core/doc-name'
import type { RecentEntry } from '../../persist/idb'

const T = Date.parse('2026-08-12T12:00:00.000Z')
const ago = (ms: number) => T - ms
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function entry(
  id: string,
  opts: { name?: string; at?: number; w?: number; h?: number; error?: string } = {},
): RecentEntry {
  const record = {
    id,
    doc: '{}',
    name: opts.name ?? '',
    updatedAt: opts.at ?? T,
  }
  if (opts.error) return { record, error: opts.error }
  return { record, doc: createDoc({ id, w: opts.w ?? 32, h: opts.h ?? 32, name: opts.name }) }
}

describe('relativeTime', () => {
  it('is coarse on purpose — you scan a list, you do not time it', () => {
    expect(relativeTime(ago(0), T)).toBe('just now')
    expect(relativeTime(ago(30 * SEC), T)).toBe('just now')
    expect(relativeTime(ago(5 * MIN), T)).toBe('5 min ago')
    expect(relativeTime(ago(3 * HOUR), T)).toBe('3 hours ago')
  })

  it('says hour, not hours, once', () => {
    expect(relativeTime(ago(HOUR), T)).toBe('1 hour ago')
  })

  it('has a word for yesterday, because a number there reads wrong', () => {
    expect(relativeTime(ago(DAY), T)).toBe('yesterday')
    expect(relativeTime(ago(3 * DAY), T)).toBe('3 days ago')
  })

  /** "23 days ago" is arithmetic; a date is a memory. */
  it('becomes a date past a week', () => {
    const out = relativeTime(ago(30 * DAY), T)
    expect(out).not.toContain('ago')
    expect(out.length).toBeGreaterThan(0)
  })

  it('never goes negative when a clock disagrees with itself', () => {
    expect(relativeTime(T + 10 * MIN, T)).toBe('just now')
  })
})

describe('recentRows', () => {
  it('drops the document that is already open', () => {
    const rows = recentRows([entry('a'), entry('b')], 'a', T, UNTITLED)
    expect(rows.map((r) => r.id)).toEqual(['b'])
  })

  it('keeps everything when nothing is open', () => {
    expect(recentRows([entry('a'), entry('b')], null, T, UNTITLED)).toHaveLength(2)
  })

  it('preserves the order it was given — idb sorts, this does not resort', () => {
    const rows = recentRows([entry('c'), entry('a'), entry('b')], null, T, UNTITLED)
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('names an unnamed draft rather than rendering a blank row', () => {
    expect(recentRows([entry('a')], null, T, UNTITLED)[0]!.label).toBe(UNTITLED)
    expect(recentRows([entry('a', { name: '   ' })], null, T, UNTITLED)[0]!.label).toBe(UNTITLED)
  })

  it('uses the name the draft was saved under', () => {
    expect(recentRows([entry('a', { name: 'gull' })], null, T, UNTITLED)[0]!.label).toBe('gull')
  })

  /**
   * F-M4. The row is the only remaining evidence the work exists, so hiding it
   * is the same as deleting it as far as the person who drew it is concerned.
   */
  it('keeps a corrupt record in the list, flagged', () => {
    const rows = recentRows(
      [entry('bad', { name: 'broken', error: 'schema_invalid: nope' })],
      null, T, UNTITLED,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.error).toBe('schema_invalid: nope')
    // Still named — the record remembers what it was called even when the
    // document inside it cannot be read.
    expect(rows[0]!.label).toBe('broken')
  })

  it('never offers a thumbnail for a record it could not parse', () => {
    const rows = recentRows([entry('bad', { error: 'x' })], null, T, UNTITLED)
    expect(rows[0]!.thumb).toBe(false)
  })

  /** §8.3, the measured rule: cheap where it is cheap, and not above that. */
  it('draws a thumbnail up to 64x64 and not beyond', () => {
    const at = (w: number, h: number) =>
      recentRows([entry('a', { w, h })], null, T, UNTITLED)[0]!.thumb
    expect(at(16, 16)).toBe(true)
    expect(at(64, 64)).toBe(true)
    expect(at(256, 256)).toBe(false)
    expect(64 * 64).toBe(THUMB_MAX_CELLS)
  })

  it('dates every row against one instant', () => {
    const rows = recentRows([entry('a', { at: ago(MIN) }), entry('b', { at: ago(MIN) })], null, T, UNTITLED)
    expect(rows[0]!.when).toBe(rows[1]!.when)
  })
})

describe('the strings', () => {
  it('has a real empty state — never an empty menu', () => {
    expect(RECENT_EMPTY).toBe('Nothing saved yet.')
  })

  /** Rule 7: the row must say the record was kept, or it reads as deleted. */
  it('says a corrupt record was kept', () => {
    expect(RECENT_CORRUPT.toLowerCase()).toContain('kept')
    expect(RECENT_CORRUPT.toLowerCase()).toContain('not deleted')
  })

  it('caps the list at 10, as §2 says', () => {
    expect(RECENT_LIMIT).toBe(10)
  })
})
