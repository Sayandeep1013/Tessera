import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs/browser'
import { exportPng } from '../png'
import { flattenFrame } from '../geometry'
import { loadStarter, createDoc } from '../../artwork-core/create'
import { docFrom, docFromLayers } from './helpers'

function decode(data: string | Uint8Array) {
  return PNG.sync.read(Buffer.from(data as Uint8Array))
}

describe('exportPng', () => {
  it('round-trips, pixel for pixel, at 1×', () => {
    const doc = loadStarter('face')
    const r = exportPng(doc)
    if (!r.ok) throw new Error(r.error)
    const png = decode(r.value.data)
    expect(png.width).toBe(doc.w)
    expect(png.height).toBe(doc.h)

    const flat = flattenFrame(doc, 0)
    for (let y = 0; y < doc.h; y++) {
      for (let x = 0; x < doc.w; x++) {
        const i = flat[y * doc.w + x]!
        const p = (y * doc.w + x) * 4
        if (i === 0) {
          expect(png.data[p + 3]).toBe(0) // transparent
        } else {
          const c = doc.palette[i]!.c
          expect(png.data[p]).toBe(parseInt(c.slice(1, 3), 16))
          expect(png.data[p + 1]).toBe(parseInt(c.slice(3, 5), 16))
          expect(png.data[p + 2]).toBe(parseInt(c.slice(5, 7), 16))
        }
      }
    }
  })

  it('alpha is preserved from an #rrggbbaa palette entry', () => {
    const doc = docFrom(['1'], ['transparent', '#11223380'])
    const r = exportPng(doc)
    if (!r.ok) throw new Error(r.error)
    const png = decode(r.value.data)
    expect([...png.data]).toEqual([0x11, 0x22, 0x33, 0x80])
  })

  it('a 1×1 document encodes and decodes cleanly', () => {
    const doc = docFrom(['1'], ['transparent', '#ff0000'])
    const r = exportPng(doc)
    if (!r.ok) throw new Error(r.error)
    const png = decode(r.value.data)
    expect(png.width).toBe(1)
    expect(png.height).toBe(1)
    expect([...png.data]).toEqual([0xff, 0, 0, 255])
  })

  it('an all-transparent document is fully transparent', () => {
    const doc = docFrom(['..', '..'], ['transparent'])
    const r = exportPng(doc)
    if (!r.ok) throw new Error(r.error)
    const png = decode(r.value.data)
    for (let p = 3; p < png.data.length; p += 4) expect(png.data[p]).toBe(0)
  })

  it('scale multiplies both dimensions and each cell becomes a solid block', () => {
    const doc = docFrom(['1'], ['transparent', '#ff0000'])
    const r = exportPng(doc, { scale: 4 })
    if (!r.ok) throw new Error(r.error)
    const png = decode(r.value.data)
    expect(png.width).toBe(4)
    expect(png.height).toBe(4)
    for (let p = 0; p < png.data.length; p += 4) {
      expect([png.data[p], png.data[p + 1], png.data[p + 2], png.data[p + 3]]).toEqual([255, 0, 0, 255])
    }
  })

  it('filename encodes the scale: {name}@{scale}x.png', () => {
    const doc = createDoc({ id: 't', name: 'Knight' })
    const r = exportPng(doc, { scale: 8 })
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename).toBe('Knight@8x.png')
  })

  it('the top layer wins for an overlapping multilayer document', () => {
    const doc = docFromLayers(
      [{ rows: ['1'] }, { rows: ['2'] }],
      ['transparent', '#ffffff', '#000000'],
    )
    const r = exportPng(doc)
    if (!r.ok) throw new Error(r.error)
    const png = decode(r.value.data)
    expect([...png.data]).toEqual([0, 0, 0, 255])
  })

  it('rejects a frame that does not exist', () => {
    expect(exportPng(loadStarter('face'), { frame: 9 }).ok).toBe(false)
  })

  it('is deterministic — same doc, same bytes, twice', () => {
    const doc = loadStarter('bird')
    const a = exportPng(doc)
    const b = exportPng(doc)
    if (!a.ok || !b.ok) throw new Error('export failed')
    expect(a.value.data).toEqual(b.value.data)
  })
})
