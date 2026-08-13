import { describe, expect, it } from 'vitest'
import { exportSvg } from '../svg'
import { loadStarter, loadLogo } from '../../artwork-core/create'
import { docFrom, docFromLayers } from './helpers'
import type { Doc } from '../../artwork-core/schema'

/** Generic well-formedness: every tag opens and closes, in order. No DOM parser in this process. */
function isWellFormedXml(s: string): boolean {
  const tag = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g
  const stack: string[] = []
  let m: RegExpExecArray | null
  while ((m = tag.exec(s))) {
    const [, closing, name, attrs] = m
    if (attrs!.trim().endsWith('/')) continue // self-closing
    if (closing) {
      if (stack.pop() !== name) return false
    } else {
      stack.push(name!)
    }
  }
  return stack.length === 0
}

const RECT = /<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6}|none)"(?: fill-opacity="([\d.]+)")?\/>/g

/** Expands every `<rect>` back to a per-pixel colour map, for comparing two renderings. */
function toPixelMap(svg: string): Map<string, string> {
  const px = new Map<string, string>()
  for (const m of svg.matchAll(RECT)) {
    const [, xs, ys, ws, hs, fill] = m
    const x0 = Number(xs), y0 = Number(ys), w = Number(ws), h = Number(hs)
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px.set(`${x},${y}`, fill!)
  }
  return px
}

function svgFor(doc: Doc, opts?: Parameters<typeof exportSvg>[1]): string {
  const r = exportSvg(doc, opts)
  if (!r.ok) throw new Error(r.error)
  return r.value.data as string
}

describe('exportSvg', () => {
  it('is well-formed XML with crispEdges, for the face fixture', () => {
    const svg = svgFor(loadStarter('face'))
    expect(isWellFormedXml(svg)).toBe(true)
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  })

  it('viewBox is document units; width/height scale with pixelSize', () => {
    const doc = loadStarter('bird')
    const svg = svgFor(doc, { pixelSize: 4 })
    expect(svg).toContain(`viewBox="0 0 ${doc.w} ${doc.h}"`)
    expect(svg).toContain(`width="${doc.w * 4}" height="${doc.h * 4}"`)
  })

  it('optimize:true and optimize:false cover exactly the same pixels', () => {
    const doc = loadStarter('face')
    const opt = svgFor(doc, { optimize: true })
    const raw = svgFor(doc, { optimize: false })
    expect(toPixelMap(opt)).toEqual(toPixelMap(raw))
  })

  it('optimize:true has strictly fewer rects than optimize:false for face', () => {
    const doc = loadStarter('face')
    const optCount = [...svgFor(doc, { optimize: true }).matchAll(/<rect/g)].length
    const rawCount = [...svgFor(doc, { optimize: false }).matchAll(/<rect/g)].length
    expect(optCount).toBeLessThan(rawCount)
  })

  it('emits runs grouped by colour, in palette-index order', () => {
    // Two colours interleaved by row: naive scan order would alternate; §3 says
    // group by colour instead, so every "1" rect precedes every "2" rect.
    const doc = docFrom(['12', '12'], ['transparent', '#ffffff', '#000000'])
    const svg = svgFor(doc)
    const order = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1])
    expect(order).toEqual(['#ffffff', '#ffffff', '#000000', '#000000'])
  })

  it('splits #rrggbbaa into fill + fill-opacity', () => {
    const doc = docFrom(['1'], ['transparent', '#11223380'])
    const svg = svgFor(doc)
    expect(svg).toContain('fill="#112233"')
    expect(svg).toContain(`fill-opacity="${Math.round((0x80 / 255) * 1000) / 1000}"`)
  })

  it('an all-transparent document exports an empty svg', () => {
    const doc = docFrom(['..'], ['transparent'])
    const svg = svgFor(doc)
    expect(svg).not.toContain('<rect')
    expect(isWellFormedXml(svg)).toBe(true)
  })

  it('the top layer wins for an overlapping multilayer document', () => {
    const doc = docFromLayers(
      [{ rows: ['1'] }, { rows: ['2'] }],
      ['transparent', '#ffffff', '#000000'],
    )
    const svg = svgFor(doc)
    expect(svg).toContain('fill="#000000"')
    expect(svg).not.toContain('fill="#ffffff"')
  })

  it('a hidden layer contributes nothing', () => {
    const doc = docFromLayers(
      [{ rows: ['.'] }, { rows: ['1'], hidden: true }],
      ['transparent', '#ffffff'],
    )
    expect(svgFor(doc)).not.toContain('<rect')
  })

  it('rejects a frame that does not exist', () => {
    const r = exportSvg(loadStarter('face'), { frame: 9 })
    expect(r.ok).toBe(false)
  })

  it('golden: face, bird, logo', () => {
    expect(svgFor(loadStarter('face'))).toMatchSnapshot()
    expect(svgFor(loadStarter('bird'))).toMatchSnapshot()
    expect(svgFor(loadLogo())).toMatchSnapshot()
  })

  it('is deterministic — same doc, same bytes, twice', () => {
    const doc = loadStarter('face')
    expect(svgFor(doc)).toBe(svgFor(doc))
  })
})
