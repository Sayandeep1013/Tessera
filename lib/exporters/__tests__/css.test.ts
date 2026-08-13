import { describe, expect, it } from 'vitest'
import { exportCss, CSS_ERROR_PIXELS, CSS_WARN_PIXELS } from '../css'
import { flattenFrame } from '../geometry'
import { loadStarter } from '../../artwork-core/create'
import { createDoc } from '../../artwork-core/create'
import { docFrom } from './helpers'

function paintedCount(doc: ReturnType<typeof createDoc>, frame = 0): number {
  let n = 0
  for (const i of flattenFrame(doc, frame)) if (i !== 0) n++
  return n
}

describe('exportCss', () => {
  it('one shadow per non-transparent pixel, not per run', () => {
    const doc = loadStarter('face')
    const r = exportCss(doc)
    if (!r.ok) throw new Error(r.error)
    const shadowCount = [...(r.value.data as string).matchAll(/var\(--c\d+\)/g)].length
    expect(shadowCount).toBe(paintedCount(doc))
  })

  it('declares a custom property per palette entry actually used, only once each', () => {
    const doc = docFrom(['121'], ['transparent', '#ffffff', '#000000'])
    const r = exportCss(doc)
    if (!r.ok) throw new Error(r.error)
    const css = r.value.data as string
    expect([...css.matchAll(/--c1: /g)]).toHaveLength(1)
    expect([...css.matchAll(/--c2: /g)]).toHaveLength(1)
    expect(css).toContain('--c1: #ffffff;')
    expect(css).toContain('--c2: #000000;')
  })

  it('an all-transparent document exports box-shadow: none, not an empty list', () => {
    const doc = docFrom(['..'], ['transparent'])
    const r = exportCss(doc)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toContain('box-shadow: none;')
  })

  it('warns above the warn threshold but still succeeds', () => {
    const doc = createDoc({ id: 't', w: 90, h: 90 })
    doc.frames[0]!.layers[0]!.px.fill(1)
    expect(paintedCount(doc)).toBeGreaterThan(CSS_WARN_PIXELS)
    const r = exportCss(doc)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.warning).toBeTruthy()
  })

  it('returns an error, not a truncated stylesheet, above the hard cap', () => {
    const doc = createDoc({ id: 't', w: 130, h: 130 })
    doc.frames[0]!.layers[0]!.px.fill(1)
    expect(paintedCount(doc)).toBeGreaterThan(CSS_ERROR_PIXELS)
    const r = exportCss(doc)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/SVG/)
  })

  it('does not error exactly at the cap', () => {
    // 128*128 = 16384, exactly the limit — "above" must not catch the boundary.
    const doc = createDoc({ id: 't', w: 128, h: 128 })
    doc.frames[0]!.layers[0]!.px.fill(1)
    expect(paintedCount(doc)).toBe(CSS_ERROR_PIXELS)
    expect(exportCss(doc).ok).toBe(true)
  })

  it('rejects a frame that does not exist', () => {
    expect(exportCss(loadStarter('face'), { frame: 9 }).ok).toBe(false)
  })

  it('golden: face', () => {
    const r = exportCss(loadStarter('face'))
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toMatchSnapshot()
  })
})
