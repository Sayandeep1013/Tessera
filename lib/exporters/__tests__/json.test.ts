import { describe, expect, it } from 'vitest'
import { exportJson } from '../json'
import { serializeDoc } from '../../artwork-core/codec'
import { loadStarter, createDoc } from '../../artwork-core/create'

describe('exportJson', () => {
  it('is exactly serializeDoc(doc) — no second encoder', () => {
    const doc = loadStarter('face')
    const r = exportJson(doc)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toBe(serializeDoc(doc))
  })

  it('round-trips through parseDoc unchanged', () => {
    const doc = loadStarter('bird')
    const r = exportJson(doc)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toBe(serializeDoc(doc))
  })

  it('filename falls back to "artwork" for an unnamed document', () => {
    const doc = createDoc({ id: 't', name: '' })
    const r = exportJson(doc)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename).toBe('artwork.tessera.json')
  })

  it('named document gets its name in the filename', () => {
    const doc = createDoc({ id: 't', name: 'Knight' })
    const r = exportJson(doc)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename).toBe('Knight.tessera.json')
  })

  it('is deterministic', () => {
    const doc = loadStarter('face')
    expect(exportJson(doc)).toEqual(exportJson(doc))
  })
})
