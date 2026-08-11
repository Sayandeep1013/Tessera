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
  bg: string
  canvasBg: string
  grid: string
  gridMajor: string
  checkerA: string
  checkerB: string
  canvasEdge: string
  diffAdd: string
  diffChange: string
  diffRemove: string
  accent: string
}

export type RenderOptions = {
  showGrid?: boolean
  showChecker?: boolean
}

/** Below this zoom, grid lines would dominate the artwork. */
export const GRID_MIN_SCALE = 8
const GRID_MAJOR_EVERY = 8
/** Fixed in CSS px so it does not zoom with the artwork. */
const CHECKER_PX = 8

export function readTheme(el: HTMLElement): ThemeColors {
  const s = getComputedStyle(el)
  const v = (n: string) => s.getPropertyValue(n).trim()
  return {
    bg: v('--bg'),
    canvasBg: v('--canvas-bg'),
    grid: v('--grid'),
    gridMajor: v('--grid-major'),
    checkerA: v('--checker-a'),
    checkerB: v('--checker-b'),
    canvasEdge: v('--canvas-edge'),
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
  const ctx = canvas.getContext('2d', { alpha: false })
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
  const showChecker = opts.showChecker ?? true

  const cssW = ctx.canvas.width / (ctx.getTransform().a || 1)
  const cssH = ctx.canvas.height / (ctx.getTransform().d || 1)

  ctx.imageSmoothingEnabled = false

  // 1. clear
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, cssW, cssH)

  const ax = Math.round(vp.offsetX)
  const ay = Math.round(vp.offsetY)
  const aw = doc.w * vp.scale
  const ah = doc.h * vp.scale

  // 2. artwork backdrop
  if (showChecker) {
    drawChecker(ctx, ax, ay, aw, ah, theme)
  } else {
    ctx.fillStyle = theme.canvasBg
    ctx.fillRect(ax, ay, aw, ah)
  }

  // 3. layers, bottom to top, with horizontal run merging
  const paletteCss = doc.palette.map((p) => p.c)
  const frame = doc.frames[frameIndex]
  if (frame) {
    for (const layer of frame.layers) {
      if (layer.hidden) continue
      drawLayer(ctx, layer.px, doc.w, doc.h, paletteCss, ax, ay, vp.scale)
    }
  }

  // 4. grid
  if (showGrid && vp.scale >= GRID_MIN_SCALE) {
    drawGrid(ctx, ax, ay, doc.w, doc.h, vp.scale, theme)
  }

  // 5. artwork border, drawn outside so it never covers a pixel
  ctx.strokeStyle = theme.canvasEdge
  ctx.lineWidth = 1
  ctx.strokeRect(ax - 0.5, ay - 0.5, aw + 1, ah + 1)
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

function drawChecker(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  theme: ThemeColors,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(ax, ay, aw, ah)
  ctx.clip()
  ctx.fillStyle = theme.checkerA
  ctx.fillRect(ax, ay, aw, ah)
  ctx.fillStyle = theme.checkerB
  for (let y = 0; y < ah; y += CHECKER_PX) {
    for (let x = ((y / CHECKER_PX) % 2) * CHECKER_PX; x < aw; x += CHECKER_PX * 2) {
      ctx.fillRect(ax + x, ay + y, CHECKER_PX, CHECKER_PX)
    }
  }
  ctx.restore()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  w: number,
  h: number,
  scale: number,
  theme: ThemeColors,
): void {
  ctx.lineWidth = 1
  for (const major of [false, true]) {
    ctx.strokeStyle = major ? theme.gridMajor : theme.grid
    ctx.beginPath()
    for (let cx = 0; cx <= w; cx++) {
      if ((cx % GRID_MAJOR_EVERY === 0) !== major) continue
      // half-pixel offset keeps a 1px line crisp rather than a 2px blur
      const x = ax + cx * scale + 0.5
      ctx.moveTo(x, ay)
      ctx.lineTo(x, ay + h * scale)
    }
    for (let cy = 0; cy <= h; cy++) {
      if ((cy % GRID_MAJOR_EVERY === 0) !== major) continue
      const y = ay + cy * scale + 0.5
      ctx.moveTo(ax, y)
      ctx.lineTo(ax + w * scale, y)
    }
    ctx.stroke()
  }
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
