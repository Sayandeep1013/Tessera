import { describe, expect, it } from 'vitest'
import {
  FORMAT_TABS, clampTab, exportAnimatedToggleDomId, formatTabDomHandles, formatTabDomId,
  visibleTabs,
} from '../export-menu'

describe('FORMAT_TABS', () => {
  it('gives every tab a unique id', () => {
    const ids = FORMAT_TABS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('Code is first — the only editable tab, and the one every document has', () => {
    expect(FORMAT_TABS[0]!.id).toBe('code')
  })

  it('carries GIF and sprite sheet last, and no separate JSON tab', () => {
    expect(FORMAT_TABS.map((f) => f.id)).toEqual([
      'code', 'svg', 'css', 'react', 'png', 'ascii', 'gif', 'spritesheet',
    ])
  })
})

describe('visibleTabs', () => {
  it('a single-frame document never sees gif or spritesheet — absent, not disabled', () => {
    const ids = visibleTabs(1).map((f) => f.id)
    expect(ids).not.toContain('gif')
    expect(ids).not.toContain('spritesheet')
    expect(ids).toEqual(['code', 'svg', 'css', 'react', 'png', 'ascii'])
  })

  it('a multi-frame document sees every tab', () => {
    expect(visibleTabs(3).map((f) => f.id)).toEqual(FORMAT_TABS.map((f) => f.id))
  })

  it('the boundary is more than one frame, not at least one', () => {
    expect(visibleTabs(2).map((f) => f.id)).toContain('gif')
  })
})

describe('clampTab', () => {
  it('leaves a reachable tab alone', () => {
    expect(clampTab('svg', 1)).toBe('svg')
    expect(clampTab('gif', 3)).toBe('gif')
  })

  it('falls back to code when the tab is not reachable at this frame count', () => {
    expect(clampTab('gif', 1)).toBe('code')
    expect(clampTab('spritesheet', 1)).toBe('code')
  })
})

describe('DOM handles', () => {
  it('formatTabDomHandles has no duplicates', () => {
    const handles = formatTabDomHandles()
    expect(new Set(handles).size).toBe(handles.length)
  })

  it('every FORMAT_TABS tab has a handle', () => {
    const handles = formatTabDomHandles()
    for (const f of FORMAT_TABS) expect(handles).toContain(formatTabDomId(f.id))
  })

  it('react and css each get their own animated-toggle handle', () => {
    expect(exportAnimatedToggleDomId('react')).not.toBe(exportAnimatedToggleDomId('css'))
  })
})
