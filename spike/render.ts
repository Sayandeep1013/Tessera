/**
 * Spike-only rendering: clean sprite PNGs and a side-by-side comparison strip.
 * The real renderer (lib/renderer) is a Phase 1 deliverable; this exists so a
 * human can judge 9 probe results by eye.
 */

import { PNG } from 'pngjs'
import type { Doc } from '../lib/artwork-core/schema'
import type { PixelDiff } from '../lib/artwork-core/diff'

const BG: [number, number, number] = [0xf4, 0xf4, 0xf5]
const GAP_BG: [number, number, number] = [0xd4, 0xd4, 0xd8]
const ADD: [number, number, number] = [0x16, 0xa3, 0x4a]
const CHANGE: [number, number, number] = [0xd9, 0x77, 0x06]
const REMOVE: [number, number, number] = [0xdc, 0x26, 0x26]

function rgb(hex: string): [number, number, number, number] {
  if (hex === 'transparent') return [0, 0, 0, 0]
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) : 255,
  ]
}

/** Flat sprite render — no grid, no checkerboard. */
export function renderDoc(doc: Doc, frame: number, scale: number): PNG {
  const { w, h } = doc
  const png = new PNG({ width: w * scale, height: h * scale })
  const pal = doc.palette.map((p) => rgb(p.c))

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: readonly number[] = BG
      for (const layer of doc.frames[frame]!.layers) {
        if (layer.hidden) continue
        const idx = layer.px[y * w + x]!
        if (idx === 0) continue
        const p = pal[idx]!
        if (p[3] === 0) continue
        c = p
      }
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (png.width * (y * scale + dy) + x * scale + dx) << 2
          png.data[i] = c[0]!
          png.data[i + 1] = c[1]!
          png.data[i + 2] = c[2]!
          png.data[i + 3] = 255
        }
      }
    }
  }
  return png
}

/** The `after` sprite with changed cells tinted and outlined. */
export function renderDiff(after: Doc, frame: number, d: PixelDiff, scale: number): PNG {
  const png = renderDoc(after, frame, scale)
  const mark = (x: number, y: number, c: readonly number[]) => {
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const edge = dx === 0 || dy === 0 || dx === scale - 1 || dy === scale - 1
        const i = (png.width * (y * scale + dy) + x * scale + dx) << 2
        if (edge) {
          png.data[i] = c[0]!
          png.data[i + 1] = c[1]!
          png.data[i + 2] = c[2]!
        } else {
          // 45% tint so the underlying pixel stays readable
          png.data[i] = Math.round(png.data[i]! * 0.55 + c[0]! * 0.45)
          png.data[i + 1] = Math.round(png.data[i + 1]! * 0.55 + c[1]! * 0.45)
          png.data[i + 2] = Math.round(png.data[i + 2]! * 0.55 + c[2]! * 0.45)
        }
      }
    }
  }
  for (const [x, y] of d.added) mark(x, y, ADD)
  for (const [x, y] of d.changed) mark(x, y, CHANGE)
  for (const [x, y] of d.removed) mark(x, y, REMOVE)
  return png
}

/** Lay panels out left to right with a separator between them. */
export function strip(panels: PNG[], gap = 12): Buffer {
  const height = Math.max(...panels.map((p) => p.height))
  const width = panels.reduce((n, p) => n + p.width, 0) + gap * (panels.length - 1)
  const out = new PNG({ width, height })

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2
      out.data[i] = GAP_BG[0]
      out.data[i + 1] = GAP_BG[1]
      out.data[i + 2] = GAP_BG[2]
      out.data[i + 3] = 255
    }
  }

  let ox = 0
  for (const p of panels) {
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const si = (p.width * y + x) << 2
        const di = (width * y + (ox + x)) << 2
        out.data[di] = p.data[si]!
        out.data[di + 1] = p.data[si + 1]!
        out.data[di + 2] = p.data[si + 2]!
        out.data[di + 3] = 255
      }
    }
    ox += p.width + gap
  }
  return PNG.sync.write(out)
}
