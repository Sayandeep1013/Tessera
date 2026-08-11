/**
 * Builds the three views the model receives. See docs/specs/06-ai-protocol.md §3.
 *
 *   1. A ruled PNG   — semantics ("this is a face")
 *   2. A text grid    — exact coordinates
 *   3. A palette legend
 *
 * Both views describe identical pixels and fail in different ways, which is the
 * point. The ruler is drawn with a bundled 3x5 bitmap font: no font dependency,
 * deterministic across platforms, so the PNG is byte-reproducible in tests.
 */

import { PNG } from 'pngjs'
import { encodeRows } from '../artwork-core/codec'
import type { Doc } from '../artwork-core/schema'

export type AiContext = {
  /** base64 PNG, no data: prefix */
  png: string
  grid: string
  legend: string
  scale: number
}

/** 3x5 bitmap digits, one string per row, MSB left. */
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
}

const COL = {
  paper: [0xf4, 0xf4, 0xf5],
  gutter: [0xe8, 0xe8, 0xea],
  ink: [0x3f, 0x3f, 0x46],
  gridMinor: [0xc4, 0xc4, 0xc8],
  gridMajor: [0x71, 0x71, 0x7a],
  /** flat neutral for transparent cells — never a checkerboard, which the model
   *  would otherwise read as artwork */
  empty: [0xff, 0xff, 0xff],
} as const

/** Long edge lands in 384-768px. */
export function pickScale(w: number, h: number): number {
  return Math.max(4, Math.min(32, Math.round(512 / Math.max(w, h))))
}

/** Label every this many cells. */
const LABEL_EVERY = 4
/** Heavier grid line every this many cells. */
const MAJOR_EVERY = 4

function hexToRgb(hex: string): [number, number, number, number] {
  if (hex === 'transparent') return [0, 0, 0, 0]
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const a = hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) : 255
  return [r, g, b, a]
}

export function renderRuledPng(doc: Doc, frame: number, scale: number): Buffer {
  const { w, h } = doc
  const gutter = scale * 2
  const png = new PNG({ width: w * scale + gutter, height: h * scale + gutter })

  const put = (x: number, y: number, c: readonly number[], a = 255) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
    const i = (png.width * y + x) << 2
    png.data[i] = c[0]!
    png.data[i + 1] = c[1]!
    png.data[i + 2] = c[2]!
    png.data[i + 3] = a
  }

  // paper + gutter
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      put(x, y, x < gutter || y < gutter ? COL.gutter : COL.paper)

  // artwork, bottom layer to top
  const px = doc.frames[frame]!.layers
  const paletteRgb = doc.palette.map((p) => hexToRgb(p.c))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rgb: readonly number[] = COL.empty
      for (const layer of px) {
        if (layer.hidden) continue
        const idx = layer.px[y * w + x]!
        if (idx === 0) continue
        const c = paletteRgb[idx]!
        if (c[3] === 0) continue
        rgb = c
      }
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          put(gutter + x * scale + dx, gutter + y * scale + dy, rgb)
    }
  }

  // grid
  for (let cx = 0; cx <= w; cx++) {
    const c = cx % MAJOR_EVERY === 0 ? COL.gridMajor : COL.gridMinor
    for (let y = gutter; y < png.height; y++) put(gutter + cx * scale, y, c)
  }
  for (let cy = 0; cy <= h; cy++) {
    const c = cy % MAJOR_EVERY === 0 ? COL.gridMajor : COL.gridMinor
    for (let x = gutter; x < png.width; x++) put(x, gutter + cy * scale, c)
  }

  // ruler labels
  const digitScale = Math.max(1, Math.floor(scale / 8) + 1)
  const drawNumber = (n: number, left: number, top: number) => {
    let cursor = left
    for (const ch of String(n)) {
      const glyph = DIGITS[ch]
      if (!glyph) continue
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 3; gx++)
          if (glyph[gy]![gx] === '1')
            for (let dy = 0; dy < digitScale; dy++)
              for (let dx = 0; dx < digitScale; dx++)
                put(cursor + gx * digitScale + dx, top + gy * digitScale + dy, COL.ink)
      cursor += (3 + 1) * digitScale
    }
  }

  for (let cx = 0; cx < w; cx += LABEL_EVERY) {
    const digits = String(cx).length
    const width = digits * 4 * digitScale - digitScale
    drawNumber(cx, gutter + cx * scale + Math.max(0, (scale - width) >> 1), gutter - 6 * digitScale - 2)
  }
  for (let cy = 0; cy < h; cy += LABEL_EVERY) {
    const digits = String(cy).length
    const width = digits * 4 * digitScale - digitScale
    drawNumber(cy, gutter - width - 4, gutter + cy * scale + Math.max(0, (scale - 5 * digitScale) >> 1))
  }

  return PNG.sync.write(png)
}

/** Byte-identical to the document's px rows, with a column ruler. */
export function buildGrid(doc: Doc, frame: number): string {
  const rows = encodeRows(doc.frames[frame]!.layers[0]!.px, doc.w, doc.h)
  const pad = String(doc.h - 1).length
  const ruler = Array.from({ length: doc.w }, (_, i) => String(i % 10)).join('')
  return [
    `CANVAS ${doc.w} wide x ${doc.h} tall. Rows are listed top to bottom.`,
    '',
    `${' '.repeat(pad)}   ${ruler}`,
    ...rows.map((r, i) => `${String(i).padStart(pad)} | ${r}`),
  ].join('\n')
}

export function buildLegend(doc: Doc): string {
  const lines = ['PALETTE (character = colour):']
  doc.palette.forEach((entry, i) => {
    const ch = i === 0 ? '.' : i <= 9 ? String(i) : String.fromCharCode(87 + i)
    const name = entry.n ? `  (${entry.n})` : ''
    lines.push(`  ${ch} = ${entry.c}${name}`)
  })
  lines.push('')
  lines.push(
    doc.palette.length >= 36
      ? 'The palette is full (36 colours). You cannot add another.'
      : `Next available index if you add a colour: ${doc.palette.length}`,
  )
  return lines.join('\n')
}

export function buildContext(doc: Doc, frame = 0): AiContext {
  const scale = pickScale(doc.w, doc.h)
  return {
    png: renderRuledPng(doc, frame, scale).toString('base64'),
    grid: buildGrid(doc, frame),
    legend: buildLegend(doc),
    scale,
  }
}

export function buildUserText(doc: Doc, frame: number, instruction: string): string {
  const ctx = buildContext(doc, frame)
  return [
    ctx.grid,
    '',
    ctx.legend,
    '',
    `INSTRUCTION: ${instruction}`,
    '',
    'Emit operations that carry out this instruction. Change as little as possible.',
  ].join('\n')
}
