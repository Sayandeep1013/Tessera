import { describe, expect, it } from 'vitest'
import {
  CLEAR_ACTION, CLEAR_TONE, FILE_MENU, FILE_MENU_ITEMS, NEW_ACTION, NEW_TONE,
  clearConfirm, needsNewConfirm, newConfirm, starterLabel,
} from '../file-menu'
import { createDoc, listStarters } from '../../artwork-core/create'

describe('the menu, as a shape', () => {
  it('has no empty groups — a divider around nothing is worse than no divider', () => {
    expect(FILE_MENU.length).toBeGreaterThan(0)
    for (const group of FILE_MENU) expect(group.length).toBeGreaterThan(0)
  })

  it('gives every item a unique id, because the ids are the probe handles', () => {
    const ids = FILE_MENU_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * SPEC.md §0 puts accounts out permanently and the user confirmed it on
   * 12 Aug 2026. This is here because "we removed the accounts feature" is
   * exactly the kind of decision a later hand undoes by reaching for a familiar
   * menu.
   */
  it('has no account items, in any spelling', () => {
    const words = ['dashboard', 'explore', 'publish', 'community', 'profile', 'sign in', 'log in']
    for (const item of FILE_MENU_ITEMS) {
      for (const w of words) {
        expect(item.label.toLowerCase()).not.toContain(w)
        expect(item.id.toLowerCase()).not.toContain(w)
      }
    }
  })

  it('has exactly one destructive item, and it is last', () => {
    const destructive = FILE_MENU_ITEMS.filter((i) => i.destructive)
    expect(destructive.map((i) => i.id)).toEqual(['clear'])
    expect(FILE_MENU_ITEMS[FILE_MENU_ITEMS.length - 1]!.id).toBe('clear')
  })

  it('puts the destructive item in a group of its own', () => {
    const last = FILE_MENU[FILE_MENU.length - 1]!
    expect(last.map((i) => i.id)).toEqual(['clear'])
  })

  /**
   * §7.2. A hint is a promise about a key, and only Ctrl+S is wired
   * (app/page.tsx). Shortcuts are step 3 of §6; when they land this test moves
   * with them rather than being deleted.
   */
  it('only promises a shortcut that is actually wired', () => {
    const hinted = FILE_MENU_ITEMS.filter((i) => i.hint)
    expect(hinted.map((i) => [i.id, i.hint])).toEqual([['download', 'Ctrl S']])
  })

  it('marks exactly one item as a submenu', () => {
    expect(FILE_MENU_ITEMS.filter((i) => i.submenu).map((i) => i.id)).toEqual(['examples'])
  })

  it('every label is real text — no placeholder or "coming soon" rows', () => {
    for (const item of FILE_MENU_ITEMS) {
      expect(item.label.trim().length).toBeGreaterThan(0)
      expect(item.label.toLowerCase()).not.toContain('soon')
    }
  })

  it('says Download, not Export, for the document itself', () => {
    const ids = FILE_MENU_ITEMS.map((i) => i.id)
    expect(ids).toContain('download')
    expect(FILE_MENU_ITEMS.find((i) => i.id === 'download')!.label).toBe('Download .tessera.json')
  })
})

describe('starterLabel', () => {
  it('titles a starter name', () => {
    expect(starterLabel('face')).toBe('Face')
    expect(starterLabel('bird')).toBe('Bird')
  })

  /** The submenu reads listStarters(); adding a starter must add a row without
   *  anyone editing the menu. */
  it('covers every starter that exists', () => {
    for (const s of listStarters()) expect(starterLabel(s).length).toBeGreaterThan(0)
  })
})

describe('needsNewConfirm — spec §5', () => {
  it('does not ask on a blank document', () => {
    expect(needsNewConfirm(createDoc({ id: 'a', w: 8, h: 8 }), 0)).toBe(false)
  })

  it('asks once anything is painted', () => {
    const d = createDoc({ id: 'a', w: 8, h: 8 })
    d.frames[0]!.layers[0]!.px[9] = 2
    expect(needsNewConfirm(d, 0)).toBe(true)
  })

  it('does not ask when there is no document at all', () => {
    expect(needsNewConfirm(null, 0)).toBe(false)
  })
})

describe('what the confirms say', () => {
  it('New names the size it will leave you with', () => {
    expect(newConfirm(32, 32)).toContain('32×32')
  })

  /**
   * §7.11. New forks to a fresh document id, so the previous drawing keeps its
   * own draft AND undo restores it. Both halves are promised, and both are true
   * — the earlier wording had to hedge about a reload because the id was reused.
   */
  it('New promises the draft is kept, and that undo works', () => {
    const m = newConfirm(16, 16)
    expect(m).toContain('kept as its own draft')
    expect(m.toLowerCase()).toContain('undo brings it straight back')
  })

  it('New no longer hedges about a reload, because it no longer has to', () => {
    expect(newConfirm(16, 16).toLowerCase()).not.toContain('reload')
  })

  /**
   * The tones are the whole point of having two confirms. A red button that
   * never costs anything is how a red button stops meaning anything.
   */
  it('only the confirm that destroys work is red', () => {
    expect(CLEAR_TONE).toBe('danger')
    expect(NEW_TONE).toBe('primary')
  })

  it('Clear says the cost while the decision is still open', () => {
    expect(clearConfirm(143)).toContain('143 painted pixels')
    expect(clearConfirm(143)).toContain('every layer')
  })

  it('Clear counts one pixel as one pixel', () => {
    expect(clearConfirm(1)).toContain('1 painted pixel from')
    expect(clearConfirm(1)).toContain('brings it back')
    expect(clearConfirm(2)).toContain('brings them back')
  })

  it('Clear promises undo, because it goes through commit', () => {
    expect(clearConfirm(5)).toContain('Undo brings')
  })

  it('both action buttons say the verb rather than OK', () => {
    for (const label of [CLEAR_ACTION, NEW_ACTION]) {
      expect(label.toLowerCase()).not.toMatch(/^(ok|yes|confirm)$/)
      expect(label.length).toBeGreaterThan(2)
    }
  })
})
