import { describe, expect, it } from 'vitest'
import {
  EXPORT_FORMATS, exportAnimatedToggleDomId, exportMenuDomHandles, exportRowDomId,
  visibleFormats,
} from '../export-menu'

describe('EXPORT_FORMATS', () => {
  it('gives every format a unique id', () => {
    const ids = EXPORT_FORMATS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries GIF and sprite sheet, after ASCII — §10\'s mockup order', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual([
      'png', 'svg', 'css', 'react', 'json', 'ascii', 'gif', 'spritesheet',
    ])
  })
})

describe('visibleFormats', () => {
  it('a single-frame document never sees gif or spritesheet — absent, not disabled', () => {
    const ids = visibleFormats(1).map((f) => f.id)
    expect(ids).not.toContain('gif')
    expect(ids).not.toContain('spritesheet')
    expect(ids).toEqual(['png', 'svg', 'css', 'react', 'json', 'ascii'])
  })

  it('a multi-frame document sees every format', () => {
    expect(visibleFormats(3).map((f) => f.id)).toEqual(EXPORT_FORMATS.map((f) => f.id))
  })

  it('the boundary is more than one frame, not at least one', () => {
    expect(visibleFormats(2).map((f) => f.id)).toContain('gif')
  })
})

describe('DOM handles', () => {
  it('exportMenuDomHandles has no duplicates', () => {
    const handles = exportMenuDomHandles()
    expect(new Set(handles).size).toBe(handles.length)
  })

  it('every EXPORT_FORMATS row has a handle', () => {
    const handles = exportMenuDomHandles()
    for (const f of EXPORT_FORMATS) expect(handles).toContain(exportRowDomId(f.id))
  })

  it('react and css each get their own animated-toggle handle', () => {
    expect(exportAnimatedToggleDomId('react')).not.toBe(exportAnimatedToggleDomId('css'))
  })
})
