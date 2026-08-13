import { describe, expect, it } from 'vitest'
import { exportAscii } from '../ascii'
import { decodeRows } from '../../artwork-core/codec'
import { flattenFrame } from '../geometry'
import { loadStarter, loadLogo } from '../../artwork-core/create'
import { docFromLayers } from './helpers'

describe('exportAscii', () => {
  it('round-trips through decodeRows back to the flattened pixel grid', () => {
    const doc = loadStarter('face')
    const r = exportAscii(doc)
    if (!r.ok) throw new Error(r.error)
    const rows = (r.value.data as string).replace(/\n$/, '').split('\n')
    const decoded = decodeRows(rows, doc.w, doc.h)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(Array.from(decoded.value)).toEqual(Array.from(flattenFrame(doc, 0)))
  })

  it('one row per document row, ending with a trailing newline', () => {
    const doc = loadStarter('bird')
    const r = exportAscii(doc)
    if (!r.ok) throw new Error(r.error)
    const text = r.value.data as string
    expect(text.endsWith('\n')).toBe(true)
    expect(text.split('\n').slice(0, -1)).toHaveLength(doc.h)
  })

  it('composites layers the same way every other exporter does', () => {
    const doc = docFromLayers(
      [{ rows: ['1'] }, { rows: ['2'] }],
      ['transparent', '#ffffff', '#000000'],
    )
    const r = exportAscii(doc)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toBe('2\n')
  })

  it('filename ends in .txt', () => {
    const r = exportAscii(loadStarter('face'))
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename.endsWith('.txt')).toBe(true)
  })

  it('rejects a frame that does not exist', () => {
    expect(exportAscii(loadStarter('face'), { frame: 9 }).ok).toBe(false)
  })

  it('golden: face, bird, logo', () => {
    const face = exportAscii(loadStarter('face'))
    const bird = exportAscii(loadStarter('bird'))
    const logo = exportAscii(loadLogo())
    if (!face.ok || !bird.ok || !logo.ok) throw new Error('export failed')
    expect(face.value.data).toMatchSnapshot()
    expect(bird.value.data).toMatchSnapshot()
    expect(logo.value.data).toMatchSnapshot()
  })
})
