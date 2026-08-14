/**
 * GIF exporter. See docs/specs/08-exporters.md §9 and §13.2.
 *
 * Builds a real GIF89a file: header, logical screen descriptor, one global
 * colour table (the document's own palette — GIF's 256 slots comfortably
 * hold the ≤36-colour cap, so no quantisation step exists here, unlike
 * `quantise.ts`), a Netscape loop extension, one graphic-control + image
 * block per frame, and the trailer. `flattenFrame` (`geometry.ts`) supplies
 * each frame's pixels — the same topmost-non-transparent-wins approximation
 * every other exporter already accepts (§12.1/§12.4): a semi-transparent or
 * blended layer stack can differ from the live canvas until merged or
 * flattened, and GIF adds one more limit of its own — only binary
 * transparency exists in the format at all, so an `#rrggbbaa` palette entry's
 * alpha is not carried into the colour table, only its RGB.
 *
 * Pure. No DOM, no Worker — `lib/exporters/gif-worker.ts` is the thin browser
 * wrapper that calls this off the main thread; this file is what makes that
 * callable and testable in node in the first place.
 */

import { colourToRgba, flattenFrame } from './geometry'
import { encodeLzw } from './gif/lzw'
import { ok, err, type Doc } from '../artwork-core/schema'
import type { ExportResult } from './types'

export type GifOptions = Record<string, never>

/** Per GIF89a: minimum LZW code size is 2, even for a 2-colour table. */
const MIN_CODE_SIZE = 2
/** GIF's colour table size is always a power of two, up to 256. */
const MAX_CODE_SIZE = 8

/** Bits needed for a table of `n` colours, clamped to GIF's [2, 8] range. */
function colorTableBits(n: number): number {
  let bits = MIN_CODE_SIZE
  while ((1 << bits) < n && bits < MAX_CODE_SIZE) bits++
  return bits
}

function pushUint16LE(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >> 8) & 0xff)
}

/** Length-prefixed sub-blocks of at most 255 bytes, GIF's own chunking for
 *  any data block whose length is not otherwise bounded, terminated by a
 *  zero-length block. */
function subBlocks(data: Uint8Array): number[] {
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    const len = Math.min(255, data.length - i)
    out.push(len)
    for (let j = 0; j < len; j++) out.push(data[i + j]!)
    i += len
  }
  out.push(0)
  return out
}

/**
 * `onProgress(framesDone, framesTotal)` fires after each frame's LZW pass —
 * still synchronous (this stays pure), but it is what `gif-worker.ts` calls
 * `postMessage` from, §9's "progress posts back to the main thread."
 */
export function encodeGif(
  doc: Doc,
  onProgress?: (done: number, total: number) => void,
): ExportResult {
  const frameCount = doc.frames.length
  if (frameCount === 0) return err('document has no frames')

  const bits = colorTableBits(doc.palette.length)
  const tableSize = 1 << bits

  const bytes: number[] = []
  bytes.push(...'GIF89a'.split('').map((c) => c.charCodeAt(0)))

  // Logical Screen Descriptor.
  pushUint16LE(bytes, doc.w)
  pushUint16LE(bytes, doc.h)
  const lsdPacked = 0b1000_0000 | ((bits - 1) << 4) | (bits - 1)
  bytes.push(lsdPacked, 0, 0) // background index 0, square pixels

  // Global Colour Table — the document's own palette, RGB only (§9's note on
  // alpha above); padded to a power of two with black.
  for (let i = 0; i < tableSize; i++) {
    const entry = doc.palette[i]
    const [r, g, b] = entry ? colourToRgba(entry.c === 'transparent' ? '#000000' : entry.c) : [0, 0, 0]
    bytes.push(r, g, b)
  }

  // Netscape2.0 application extension — loop forever.
  bytes.push(0x21, 0xff, 0x0b)
  bytes.push(...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)))
  bytes.push(0x03, 0x01, 0, 0, 0x00)

  for (let f = 0; f < frameCount; f++) {
    const frame = doc.frames[f]!
    // GIF delays are centiseconds and cannot express faster than 1cs;
    // §9 clamps to ≥ 2cs (20ms) because browsers silently retime anything
    // lower, which would make the export silently disagree with the doc.
    const delayCs = Math.max(2, Math.round(frame.ms / 10))

    // Graphic Control Extension — disposal 2 (restore to background) before
    // every frame, so a transparent cell shows the (transparent) background
    // rather than whatever the previous, independently-painted frame left
    // there. Each of this document's frames is a whole picture, never a
    // delta against the one before it, so nothing here should carry over.
    bytes.push(0x21, 0xf9, 0x04)
    const gcePacked = 0b0000_1000 | 0b0000_0001 // disposal=2, transparent flag=1
    bytes.push(gcePacked)
    pushUint16LE(bytes, delayCs)
    bytes.push(0, 0x00) // transparent colour index 0, block terminator

    // Image Descriptor — full-canvas, no local colour table, no interlace.
    bytes.push(0x2c)
    pushUint16LE(bytes, 0)
    pushUint16LE(bytes, 0)
    pushUint16LE(bytes, doc.w)
    pushUint16LE(bytes, doc.h)
    bytes.push(0x00)

    const indices = flattenFrame(doc, f)
    bytes.push(bits)
    bytes.push(...subBlocks(encodeLzw(indices, bits)))

    onProgress?.(f + 1, frameCount)
  }

  bytes.push(0x3b) // trailer

  return ok({
    filename: `${doc.name || 'artwork'}.gif`,
    mime: 'image/gif',
    data: new Uint8Array(bytes),
  })
}
