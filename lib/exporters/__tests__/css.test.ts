import { describe, expect, it } from 'vitest'
import { exportCss, CSS_ERROR_PIXELS, CSS_WARN_PIXELS } from '../css'
import { flattenFrame } from '../geometry'
import { loadStarter } from '../../artwork-core/create'
import { createDoc } from '../../artwork-core/create'
import { docFrom } from './helpers'
import type { Doc } from '../../artwork-core/schema'

function threeFrameDoc(): Doc {
  const base = docFrom(['1'], ['transparent', '#ff0000'])
  return {
    ...base,
    palette: [{ c: 'transparent' }, { c: '#ff0000' }, { c: '#00ff00' }],
    frames: [
      { ms: 100, layers: [{ n: 'L0', px: new Uint8Array([1]) }] },
      { ms: 100, layers: [{ n: 'L0', px: new Uint8Array([2]) }] },
      { ms: 100, layers: [{ n: 'L0', px: new Uint8Array([1]) }] },
    ],
  }
}

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

describe('exportCss animated', () => {
  it('emits one @keyframes rule driving the class, not a static box-shadow', () => {
    const r = exportCss(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    const css = r.value.data as string
    expect(css).toContain('@keyframes pixel-art-frames {')
    expect(css).toContain('animation: pixel-art-frames 300ms linear infinite;')
    expect(css).not.toMatch(/^\s*box-shadow:/m)
  })

  it('holds each frame\'s value at its own start, hard-cuts before the next', () => {
    const r = exportCss(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    const css = r.value.data as string
    expect(css).toContain('0% { box-shadow: calc(var(--p) * 0)')
    // frame 1 starts at 33.33...%
    expect(css).toMatch(/33\.3\d+% \{ box-shadow: [^}]*--c2/)
    expect(css).toContain('100% { box-shadow:')
  })

  it('ignores `frame` — every frame contributes its own keyframe stops', () => {
    const r = exportCss(threeFrameDoc(), { animated: true, frame: 1 })
    if (!r.ok) throw new Error(r.error)
    const css = r.value.data as string
    expect(css).toContain('--c1:')
    expect(css).toContain('--c2:')
  })

  it('declares a custom property for every colour used across all frames, once each', () => {
    const r = exportCss(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    const css = r.value.data as string
    expect([...css.matchAll(/--c1: /g)]).toHaveLength(1)
    expect([...css.matchAll(/--c2: /g)]).toHaveLength(1)
  })

  it('the pixel cap counts every frame together, not the worst single frame', () => {
    const doc = createDoc({ id: 't', w: 100, h: 100 })
    // Each single frame is under CSS_ERROR_PIXELS on its own (10,000 < 16,384);
    // three of them together are not.
    doc.frames[0]!.layers[0]!.px.fill(1)
    const threeFrames: Doc = {
      ...doc,
      frames: [doc.frames[0]!, doc.frames[0]!, doc.frames[0]!],
    }
    expect(exportCss(threeFrames, { frame: 0 }).ok).toBe(true) // one frame alone: fine
    expect(exportCss(threeFrames, { animated: true }).ok).toBe(false) // all three: over the cap
  })

  it('rejects a document with no frames', () => {
    const doc = { ...threeFrameDoc(), frames: [] }
    expect(exportCss(doc, { animated: true }).ok).toBe(false)
  })

  it('golden: an animated three-frame export', () => {
    const r = exportCss(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toMatchSnapshot()
  })
})
