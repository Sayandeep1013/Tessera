/**
 * A hand-written GIF LZW encoder. See docs/specs/08-exporters.md §9 and §13.2.
 *
 * No dependency in this repo does GIF encoding, and pulling one in for this
 * alone was already weighed and declined — `10-animation.md §0.5`. This
 * follows the variable-code-length LZW algorithm the GIF89a spec itself
 * describes (Appendix F / the Blackstock reference every GIF encoder traces
 * back to), not a private variant: `decodeLzw` below decodes by the same
 * rules, and the round-trip tests in `__tests__/lzw.test.ts` are what stand
 * in for "a real GIF viewer accepts this," since this sandbox has no GIF
 * decoding library to check against directly.
 *
 * Pure. No DOM, no `pngjs`, nothing but bytes in and bytes out.
 */

/** Bits packed LSB-first into bytes, exactly as GIF's image data requires. */
class BitWriter {
  private bytes: number[] = []
  private buffer = 0
  private count = 0

  writeCode(code: number, size: number): void {
    this.buffer |= code << this.count
    this.count += size
    while (this.count >= 8) {
      this.bytes.push(this.buffer & 0xff)
      this.buffer >>= 8
      this.count -= 8
    }
  }

  finish(): Uint8Array {
    if (this.count > 0) this.bytes.push(this.buffer & 0xff)
    return new Uint8Array(this.bytes)
  }
}

class BitReader {
  private buffer = 0
  private count = 0
  private pos = 0

  constructor(private data: Uint8Array) {}

  readCode(size: number): number {
    while (this.count < size) {
      this.buffer |= (this.data[this.pos] ?? 0) << this.count
      this.pos++
      this.count += 8
    }
    const code = this.buffer & ((1 << size) - 1)
    this.buffer >>= size
    this.count -= size
    return code
  }
}

const MAX_CODE_SIZE = 12
const MAX_CODES = 1 << MAX_CODE_SIZE // 4096

/**
 * `minCodeSize` is the GIF colour-table bit depth (≥ 2 — GIF89a §20 requires
 * at least 2 even for a 2-colour table). Clear code is `1 << minCodeSize`,
 * end code is one past it, and single-index strings 0..clearCode-1 seed the
 * table — exactly the table every GIF decoder assumes going in.
 */
export function encodeLzw(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const endCode = clearCode + 1
  const writer = new BitWriter()

  let dict = new Map<string, number>()
  let codeSize = minCodeSize + 1
  let nextCode = endCode + 1

  /**
   * A decoder cannot form dictionary entry N until it has read the code
   * *after* the one that made entry N possible — it needs that next code's
   * first character. So a width crossing the decoder discovers while
   * decoding entry N only takes effect two codes later than the encoder
   * naively discovers the same crossing (which knows it immediately,
   * mid-symbol). `growPending`/`growArmed` reproduce that same two-step lag
   * on the encoder side — skip it and the two sides read a shared bitstream
   * at different widths from the third code onward. `__tests__/lzw.test.ts`
   * is what caught this the first time it was missing.
   */
  let growPending = false
  let growArmed = false

  const reset = () => {
    dict = new Map()
    for (let i = 0; i < clearCode; i++) dict.set(String.fromCharCode(i), i)
    codeSize = minCodeSize + 1
    nextCode = endCode + 1
    growPending = false
    growArmed = false
  }

  reset()
  writer.writeCode(clearCode, codeSize)

  const beginStep = () => {
    if (growArmed) {
      if (codeSize < MAX_CODE_SIZE) codeSize++
      growArmed = false
    }
    if (growPending) {
      growArmed = true
      growPending = false
    }
  }

  let w = ''
  for (let p = 0; p < indices.length; p++) {
    const k = String.fromCharCode(indices[p]!)
    const wk = w + k
    if (w !== '' && dict.has(wk)) {
      w = wk
      continue
    }
    if (w !== '') {
      // Only advance the delay on an actual emit — a run absorbed into `w`
      // above (the `continue` just up there) is not one.
      beginStep()
      writer.writeCode(dict.get(w)!, codeSize)
      if (nextCode < MAX_CODES) {
        dict.set(wk, nextCode)
        nextCode++
        if (nextCode === 1 << codeSize) growPending = true
      } else {
        writer.writeCode(clearCode, codeSize)
        reset()
      }
    }
    w = k
  }
  beginStep()
  if (w !== '') writer.writeCode(dict.get(w)!, codeSize)
  writer.writeCode(endCode, codeSize)

  return writer.finish()
}

/**
 * Decodes what `encodeLzw` produced. Not shipped in any export — it exists so
 * the encoder's own tests can prove round-trip correctness against the actual
 * bitstream rules, the same "serialise and reparse" discipline `14-layers.md
 * §0.2` and B3's paste-undo test already use elsewhere in this codebase.
 */
export function decodeLzw(data: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const endCode = clearCode + 1
  const reader = new BitReader(data)

  let dict: string[] = []
  let codeSize = minCodeSize + 1
  let nextCode = endCode + 1

  const reset = () => {
    dict = []
    for (let i = 0; i < clearCode; i++) dict[i] = String.fromCharCode(i)
    codeSize = minCodeSize + 1
    nextCode = endCode + 1
  }

  reset()
  const first = reader.readCode(codeSize)
  if (first !== clearCode) throw new Error('LZW stream must open with the clear code')

  const out: number[] = []
  let prev: string | null = null

  for (;;) {
    const code = reader.readCode(codeSize)
    if (code === clearCode) {
      reset()
      prev = null
      continue
    }
    if (code === endCode) break

    let entry: string
    if (dict[code] !== undefined) {
      entry = dict[code]!
    } else if (code === nextCode && prev !== null) {
      entry = prev + prev[0] // the classic KwKwK case
    } else {
      throw new Error(`invalid LZW code ${code}`)
    }

    for (let i = 0; i < entry.length; i++) out.push(entry.charCodeAt(i))

    if (prev !== null && nextCode < MAX_CODES) {
      dict[nextCode] = prev + entry[0]
      nextCode++
      if (nextCode === 1 << codeSize && codeSize < MAX_CODE_SIZE) codeSize++
    }
    prev = entry
  }

  return new Uint8Array(out)
}
