import { describe, expect, it } from 'vitest'
import { compositeStack } from '../blend'
import type { Doc, Layer } from '../schema'

/** A 1x1 document whose palette is exactly what the test needs. */
function doc1x1(colors: string[]): Doc {
  return {
    v: 1,
    id: 't',
    name: 't',
    w: 1,
    h: 1,
    palette: [{ c: 'transparent' }, ...colors.map((c) => ({ c }))],
    frames: [{ ms: 100, layers: [] }],
    meta: { createdAt: '', updatedAt: '' },
  }
}

function layer(idx: number, opts: Partial<Layer> = {}): Layer {
  return { n: 'l', px: new Uint8Array([idx]), ...opts }
}

function pixel(rgba: ReturnType<typeof compositeStack>) {
  return { r: rgba.data[0], g: rgba.data[1], b: rgba.data[2], a: rgba.data[3] }
}

describe('compositeStack', () => {
  it('one opaque normal layer over nothing is just that colour', () => {
    const doc = doc1x1(['#112233'])
    const out = compositeStack(doc, [layer(1)])
    expect(pixel(out)).toEqual({ r: 0x11, g: 0x22, b: 0x33, a: 255 })
  })

  it('two opaque normal layers: top wins, same as compositeAt (phase-1 regression)', () => {
    const doc = doc1x1(['#000000', '#ffffff'])
    const out = compositeStack(doc, [layer(1), layer(2)])
    expect(pixel(out)).toEqual({ r: 255, g: 255, b: 255, a: 255 })
  })

  it('a fully transparent top layer leaves the backdrop unchanged, for every blend mode', () => {
    const modes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'exclusion'] as const
    const doc = doc1x1(['#804020'])
    for (const mode of modes) {
      // index 0 on the top layer is transparent regardless of its own mode/opacity.
      const out = compositeStack(doc, [layer(1), layer(0, { mode })])
      expect(pixel(out)).toEqual({ r: 0x80, g: 0x40, b: 0x20, a: 255 })
    }
  })

  it('a hidden layer contributes nothing regardless of opacity or blend mode', () => {
    const doc = doc1x1(['#000000', '#ffffff'])
    const out = compositeStack(doc, [layer(1), layer(2, { hidden: true, o: 100, mode: 'multiply' })])
    expect(pixel(out)).toEqual({ r: 0, g: 0, b: 0, a: 255 })
  })

  it('50% opacity normal blend is a plain half-mix (hand-computed)', () => {
    const doc = doc1x1(['#000000', '#ffffff'])
    const out = compositeStack(doc, [layer(1), layer(2, { o: 50 })])
    const p = pixel(out)
    expect(p.r).toBeGreaterThanOrEqual(127)
    expect(p.r).toBeLessThanOrEqual(128)
    expect(p.a).toBe(255)
  })

  it('multiply of pure red over pure blue is black (hand-computed: 255*0/255=0 per channel)', () => {
    const doc = doc1x1(['#0000ff', '#ff0000'])
    const out = compositeStack(doc, [layer(1), layer(2, { mode: 'multiply' })])
    expect(pixel(out)).toEqual({ r: 0, g: 0, b: 0, a: 255 })
  })

  it('screen of pure red over pure blue is magenta (hand-computed: 255+0-0=255 on both channels present)', () => {
    const doc = doc1x1(['#0000ff', '#ff0000'])
    const out = compositeStack(doc, [layer(1), layer(2, { mode: 'screen' })])
    expect(pixel(out)).toEqual({ r: 255, g: 0, b: 255, a: 255 })
  })

  it('darken of white over black is black; lighten of white over black is white', () => {
    const doc = doc1x1(['#000000', '#ffffff'])
    const dark = compositeStack(doc, [layer(1), layer(2, { mode: 'darken' })])
    expect(pixel(dark)).toEqual({ r: 0, g: 0, b: 0, a: 255 })
    const light = compositeStack(doc, [layer(1), layer(2, { mode: 'lighten' })])
    expect(pixel(light)).toEqual({ r: 255, g: 255, b: 255, a: 255 })
  })

  it('difference of white and black is white; exclusion of white and black is white', () => {
    const doc = doc1x1(['#000000', '#ffffff'])
    const diff = compositeStack(doc, [layer(1), layer(2, { mode: 'difference' })])
    expect(pixel(diff)).toEqual({ r: 255, g: 255, b: 255, a: 255 })
    const excl = compositeStack(doc, [layer(1), layer(2, { mode: 'exclusion' })])
    expect(pixel(excl)).toEqual({ r: 255, g: 255, b: 255, a: 255 })
  })

  it('all-transparent stack stays transparent', () => {
    const doc = doc1x1(['#ffffff'])
    const out = compositeStack(doc, [layer(0)])
    expect(pixel(out)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })
})
