import { describe, expect, it } from 'vitest'
import { encodeGif } from '../gif'
import { flattenFrame } from '../geometry'
import { decodeLzw } from '../gif/lzw'
import { loadStarter, createDoc } from '../../artwork-core/create'
import { docFrom } from './helpers'
import type { Doc } from '../../artwork-core/schema'

/**
 * A minimal GIF89a reader — not shipped, exists only so this test can prove
 * `encodeGif` produces bytes a real decoder could walk, not just bytes this
 * file's own writer happens to like. Reads every block type §9's file
 * actually emits (GCT, Netscape loop extension, one GCE + image block per
 * frame, trailer) and nothing else — an unrecognised block is a bug, not a
 * thing to skip past.
 */
function readGif(bytes: Uint8Array) {
  let p = 0
  const u16 = () => {
    const v = bytes[p]! | (bytes[p + 1]! << 8)
    p += 2
    return v
  }
  const header = String.fromCharCode(...bytes.slice(0, 6))
  p = 6
  const w = u16()
  const h = u16()
  const packed = bytes[p++]!
  const gctFlag = (packed >> 7) & 1
  const gctSizeField = packed & 0b111
  const gctSize = 1 << (gctSizeField + 1)
  p += 2 // background index, aspect ratio
  const gct: Array<[number, number, number]> = []
  if (gctFlag) {
    for (let i = 0; i < gctSize; i++) {
      gct.push([bytes[p]!, bytes[p + 1]!, bytes[p + 2]!])
      p += 3
    }
  }

  const readSubBlocks = () => {
    const chunks: number[] = []
    for (;;) {
      const len = bytes[p++]!
      if (len === 0) break
      for (let i = 0; i < len; i++) chunks.push(bytes[p++]!)
    }
    return new Uint8Array(chunks)
  }

  let loopCount: number | null = null
  const frames: Array<{ delayCs: number; transparentIndex: number | null; w: number; h: number; indices: Uint8Array }> = []

  for (;;) {
    const tag = bytes[p]!
    if (tag === 0x3b) { p++; break } // trailer
    if (tag === 0x21) {
      const label = bytes[p + 1]!
      if (label === 0xff) {
        // Application extension — read block size + 11-byte id/auth, then sub-blocks.
        p += 2
        const blockSize = bytes[p++]!
        p += blockSize // "NETSCAPE2.0"
        const sub = readSubBlocks() // 0x01, loop lo, loop hi (packed as one sub-block by this writer)
        loopCount = sub[1]! | (sub[2]! << 8)
      } else if (label === 0xf9) {
        p += 3 // ext intro, label, block size (always 4)
        const gcePacked = bytes[p++]!
        const delayCs = u16()
        const transparentIndex = (gcePacked & 1) ? bytes[p]! : null
        p += 1 // transparent index byte (present regardless of the flag)
        p += 1 // block terminator
        // Image descriptor follows immediately.
        if (bytes[p] !== 0x2c) throw new Error(`expected image descriptor, got 0x${bytes[p]!.toString(16)}`)
        p++
        p += 2 // left
        p += 2 // top
        const fw = u16()
        const fh = u16()
        p++ // local flags byte (0 — no local table, no interlace)
        const minCodeSize = bytes[p++]!
        const lzw = readSubBlocks()
        const indices = decodeLzw(lzw, minCodeSize)
        frames.push({ delayCs, transparentIndex, w: fw, h: fh, indices })
      } else {
        throw new Error(`unrecognised extension label 0x${label.toString(16)}`)
      }
    } else {
      throw new Error(`unrecognised block tag 0x${tag.toString(16)} at byte ${p}`)
    }
  }

  return { header, w, h, gct, loopCount, frames }
}

function threeFrameDoc(): Doc {
  const base = docFrom(['1'], ['transparent', '#ff0000'])
  return {
    ...base,
    palette: [{ c: 'transparent' }, { c: '#ff0000' }, { c: '#00ff00' }, { c: '#0000ff' }],
    frames: [
      { ms: 100, layers: [{ n: 'L0', px: new Uint8Array([1, 2, 3, 0]) }] },
      { ms: 250, layers: [{ n: 'L0', px: new Uint8Array([2, 2, 1, 1]) }] },
      { ms: 5, layers: [{ n: 'L0', px: new Uint8Array([0, 0, 0, 3]) }] },
    ],
  }
}

function make2x2(): Doc {
  const doc = threeFrameDoc()
  return { ...doc, w: 2, h: 2 }
}

describe('encodeGif', () => {
  it('opens with the GIF89a signature', () => {
    const r = encodeGif(make2x2())
    if (!r.ok) throw new Error(r.error)
    expect(String.fromCharCode(...(r.value.data as Uint8Array).slice(0, 6))).toBe('GIF89a')
  })

  it('parses as a structurally valid GIF, one frame per document frame', () => {
    const doc = make2x2()
    const r = encodeGif(doc)
    if (!r.ok) throw new Error(r.error)
    const parsed = readGif(r.value.data as Uint8Array)
    expect(parsed.header).toBe('GIF89a')
    expect([parsed.w, parsed.h]).toEqual([2, 2])
    expect(parsed.frames).toHaveLength(3)
  })

  it('loops forever (Netscape extension, count 0)', () => {
    const r = encodeGif(make2x2())
    if (!r.ok) throw new Error(r.error)
    expect(readGif(r.value.data as Uint8Array).loopCount).toBe(0)
  })

  it('frame delays match the document, converted to centiseconds', () => {
    const r = encodeGif(make2x2())
    if (!r.ok) throw new Error(r.error)
    const delays = readGif(r.value.data as Uint8Array).frames.map((f) => f.delayCs)
    expect(delays).toEqual([10, 25, 2]) // 5ms clamps up to the 2cs (20ms) floor
  })

  it('index 0 is the transparent index on every frame', () => {
    const r = encodeGif(make2x2())
    if (!r.ok) throw new Error(r.error)
    for (const f of readGif(r.value.data as Uint8Array).frames) expect(f.transparentIndex).toBe(0)
  })

  it('each frame decodes back to exactly flattenFrame\'s pixels', () => {
    const doc = make2x2()
    const r = encodeGif(doc)
    if (!r.ok) throw new Error(r.error)
    const parsed = readGif(r.value.data as Uint8Array)
    doc.frames.forEach((_, i) => {
      expect([...parsed.frames[i]!.indices]).toEqual([...flattenFrame(doc, i)])
    })
  })

  it('the colour table matches the palette, RGB only', () => {
    const doc = make2x2()
    const r = encodeGif(doc)
    if (!r.ok) throw new Error(r.error)
    const gct = readGif(r.value.data as Uint8Array).gct
    expect(gct[1]).toEqual([0xff, 0, 0])
    expect(gct[2]).toEqual([0, 0xff, 0])
    expect(gct[3]).toEqual([0, 0, 0xff])
  })

  it('calls onProgress once per frame, in order, ending at the frame count', () => {
    const doc = make2x2()
    const calls: Array<[number, number]> = []
    encodeGif(doc, (done, total) => calls.push([done, total]))
    expect(calls).toEqual([[1, 3], [2, 3], [3, 3]])
  })

  it('is deterministic', () => {
    const doc = make2x2()
    const a = encodeGif(doc)
    const b = encodeGif(doc)
    if (!a.ok || !b.ok) throw new Error('encode failed')
    expect(a.value.data).toEqual(b.value.data)
  })

  it('filename ends .gif', () => {
    const r = encodeGif(createDoc({ id: 't', name: 'walk' }))
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename).toBe('walk.gif')
  })

  it('round-trips a real multi-frame fixture, every frame', () => {
    // bird has more than one colour in real use, which is what actually
    // exercises the LZW code-size growth path end to end.
    const doc = loadStarter('bird')
    const r = encodeGif(doc)
    if (!r.ok) throw new Error(r.error)
    const parsed = readGif(r.value.data as Uint8Array)
    doc.frames.forEach((_, i) => {
      expect([...parsed.frames[i]!.indices]).toEqual([...flattenFrame(doc, i)])
    })
  })

  it('rejects a document with no frames', () => {
    const doc = { ...make2x2(), frames: [] }
    expect(encodeGif(doc).ok).toBe(false)
  })
})
