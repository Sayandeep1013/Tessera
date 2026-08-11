/**
 * The renderer. See docs/specs/04-renderer.md.
 *
 * One full-viewport canvas; the artwork is drawn under a viewport transform.
 * Pure: a function of its arguments onto pixels on the passed context. No store
 * access, no window, no network, no document mutation. Theme colours are passed
 * in resolved — reading computed style per frame is both slow and untestable.
 */

import type { Doc } from '../artwork-core/schema'
import type { PixelDiff } from '../artwork-core/diff'

export type Viewport = {
  /** integer >= 1 */
  scale: number
  offsetX: number
  offsetY: number
}

export type ThemeColors = {
  /** artwork background — flat and opaque, never a checkerboard */
  artBg: string
  grid: string
  /** artwork border, top + left edges */
  edgeTL: string
  /** artwork border, bottom + right edges — measurably darker than TL */
  edgeBR: string
  diffAdd: string
  diffChange: string
  diffRemove: string
  accent: string
}

export type RenderOptions = {
  showGrid?: boolean
}

/**
 * Below this zoom the grid would dominate the artwork.
 *
 * Measured on the reference (§8.4): the grid is exactly 1 CSS px at the cell
 * pitch on BOTH axes, with **no heavier line at any interval** — verified
 * exhaustively over the whole backing store. Do not reintroduce major lines.
 */
export const GRID_MIN_SCALE = 4
/** Scale range over which the grid ramps from invisible to full. */
export const GRID_FADE_RANGE = 4

export function readTheme(el: HTMLElement): ThemeColors {
  const s = getComputedStyle(el)
  const v = (n: string) => s.getPropertyValue(n).trim()
  return {
    artBg: v('--art-bg'),
    // Not --art-grid: that one is a backdrop colour for the boot loader. This is
    // an inversion magnitude, composited with `difference`.
    grid: v('--grid-ink'),
    edgeTL: v('--art-edge-tl'),
    edgeBR: v('--art-edge-br'),
    diffAdd: v('--diff-add'),
    diffChange: v('--diff-change'),
    diffRemove: v('--diff-remove'),
    accent: v('--accent'),
  }
}

/** Size the backing store for the device, then work in CSS pixels forever after. */
export function resizeCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): void {
  // Capped at 2: the artwork is hard-edged rectangles, so a 3x store buys nothing.
  const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.round(cssW * dpr))
  const h = Math.max(1, Math.round(cssH * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  // alpha MUST stay on: the canvas paints nothing outside the artwork and lets
  // the app-shell --surface show through (measured: 57.5% of the backing store
  // is fully transparent).
  const ctx = canvas.getContext('2d', { alpha: true })
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
  }
}

export function renderDoc(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  frameIndex: number,
  vp: Viewport,
  theme: ThemeColors,
  opts: RenderOptions = {},
): void {
  const showGrid = opts.showGrid ?? true

  const cssW = ctx.canvas.width / (ctx.getTransform().a || 1)
  const cssH = ctx.canvas.height / (ctx.getTransform().d || 1)

  ctx.imageSmoothingEnabled = false

  // 1. clear to TRANSPARENT — the canvas paints no background of its own.
  ctx.clearRect(0, 0, cssW, cssH)

  const ax = Math.round(vp.offsetX)
  const ay = Math.round(vp.offsetY)
  const aw = doc.w * vp.scale
  const ah = doc.h * vp.scale

  // 2. artwork backdrop — flat and opaque, never a checkerboard
  ctx.fillStyle = theme.artBg
  ctx.fillRect(ax, ay, aw, ah)

  // 3. layers, bottom to top, with horizontal run merging
  const paletteCss = doc.palette.map((p) => p.c)
  const frame = doc.frames[frameIndex]
  if (frame) {
    for (const layer of frame.layers) {
      if (layer.hidden) continue
      drawLayer(ctx, layer.px, doc.w, doc.h, paletteCss, ax, ay, vp.scale)
    }
  }

  // 4. grid — 1px at the cell pitch, no majors
  if (showGrid && vp.scale >= GRID_MIN_SCALE) {
    drawGrid(ctx, ax, ay, doc.w, doc.h, vp.scale, theme)
  }

  // 5. artwork border. Two-tone: top/left is lighter than bottom/right — a
  // uniform strokeRect does not match the reference.
  ctx.fillStyle = theme.edgeTL
  ctx.fillRect(ax - 1, ay - 1, aw + 1, 1) // top
  ctx.fillRect(ax - 1, ay - 1, 1, ah + 1) // left
  ctx.fillStyle = theme.edgeBR
  ctx.fillRect(ax - 1, ay + ah, aw + 2, 1) // bottom
  ctx.fillRect(ax + aw, ay - 1, 1, ah + 2) // right
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  px: Uint8Array,
  w: number,
  h: number,
  paletteCss: string[],
  ax: number,
  ay: number,
  scale: number,
): void {
  for (let y = 0; y < h; y++) {
    let x = 0
    const rowTop = ay + y * scale
    while (x < w) {
      const idx = px[y * w + x]!
      if (idx === 0) {
        x++
        continue
      }
      // extend the run
      let len = 1
      while (x + len < w && px[y * w + x + len] === idx) len++
      ctx.fillStyle = paletteCss[idx]!
      ctx.fillRect(ax + x * scale, rowTop, len * scale, scale)
      x += len
    }
  }
}

/**
 * 1 CSS px lines at exactly the cell pitch, both axes. No heavier line at any
 * interval — that is measured, not assumed (§8.4).
 *
 * Drawn with fillRect rather than stroke: a stroked line straddles the
 * coordinate and needs a half-pixel fudge, which goes wrong at fractional DPR.
 * A 1px fill lands exactly where it is told.
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  w: number,
  h: number,
  scale: number,
  theme: ThemeColors,
): void {
  const width = w * scale
  const height = h * scale

  ctx.save()

  /**
   * `difference`, not a fixed colour.
   *
   * A grid drawn in a themed colour is only ever visible against half the
   * artwork: 8% black vanished completely on the starter's dark outline while
   * reading fine on its yellow. And the artwork is arbitrary user data, so no
   * single colour can work — whatever is picked, someone paints that colour.
   *
   * Difference blending inverts by a fixed magnitude instead, so the line is
   * always exactly as far from its backdrop as the magnitude, whatever the
   * backdrop is. White becomes light grey, black becomes dark grey, and a
   * saturated colour becomes a darker version of itself.
   */
  ctx.globalCompositeOperation = 'difference'
  ctx.fillStyle = theme.grid

  // Fade in rather than pop. Below GRID_MIN_SCALE the lines would be a larger
  // share of the cell than the cell itself, so the artwork reads as mesh; a hard
  // on/off at that boundary is jarring when zooming. Aseprite, Pixelorama and
  // Piskel all ramp rather than switch.
  ctx.globalAlpha = Math.min(1, Math.max(0, (scale - GRID_MIN_SCALE) / GRID_FADE_RANGE))

  // interior lines only — the outer edge is the border, drawn separately
  for (let cx = 1; cx < w; cx++) ctx.fillRect(ax + cx * scale, ay, 1, height)
  for (let cy = 1; cy < h; cy++) ctx.fillRect(ax, ay + cy * scale, width, 1)

  ctx.restore()
}

/** Diff overlay, drawn above a preview document during an AI proposal. */
export function renderDiffOverlay(
  ctx: CanvasRenderingContext2D,
  d: PixelDiff,
  vp: Viewport,
  theme: ThemeColors,
): void {
  const ax = Math.round(vp.offsetX)
  const ay = Math.round(vp.offsetY)
  ctx.save()
  ctx.globalAlpha = 0.6
  const paint = (cells: Array<readonly number[]>, color: string) => {
    ctx.fillStyle = color
    for (const c of cells) {
      ctx.fillRect(ax + c[0]! * vp.scale, ay + c[1]! * vp.scale, vp.scale, vp.scale)
    }
  }
  paint(d.added, theme.diffAdd)
  paint(d.changed, theme.diffChange)
  paint(d.removed, theme.diffRemove)
  ctx.restore()
}

/** Outline for the cell under the cursor. */
export function renderCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  vp: Viewport,
  theme: ThemeColors,
): void {
  const ax = Math.round(vp.offsetX) + x * vp.scale
  const ay = Math.round(vp.offsetY) + y * vp.scale
  ctx.save()
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 2
  ctx.strokeRect(ax - 1, ay - 1, size * vp.scale + 2, size * vp.scale + 2)
  ctx.restore()
}
