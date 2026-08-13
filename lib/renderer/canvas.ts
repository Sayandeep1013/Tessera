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
  /** artwork background — flat unless the transparency grid is on */
  artBg: string
  /** the darker square of the transparency checkerboard */
  checker: string
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
  /** 'auto' defers to GRID_MIN_SCALE, 'on' overrides it, 'off' never draws. */
  gridMode?: 'auto' | 'on' | 'off'
  /** A checkerboard behind transparent pixels. Spec 16 §2. */
  transparencyGrid?: boolean
  /** The mirror line(s) a symmetric stroke reflects across. Spec 16 §3.1. */
  symmetry?: 'off' | 'h' | 'v' | 'both'
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
    checker: v('--art-checker'),
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
  /**
   * A WHOLE number, capped at 2.
   *
   * Capped because the artwork is hard-edged rectangles and a 3x store buys
   * nothing. Floored because a fractional one is visibly wrong: Windows at 125%
   * and 150% display scaling reports devicePixelRatio 1.25 and 1.5, and this
   * value goes straight into setTransform. A cell boundary at an odd CSS pixel
   * then lands on a HALF device pixel, the browser antialiases it, and the
   * result is one faint line per row — which reads as a grid that will not
   * switch off. Reported as exactly that, and measured in tools/probe-crisp.ts:
   * a flat fill sampled down a column gives 1 colour at dpr 1 and 2, but 4 at
   * 1.25 and 2 at 1.5.
   *
   * Flooring costs nothing real. Crispness in pixel art comes from exact
   * alignment, not from extra resolution: at an integer scale and an integer
   * dpr every cell edge is a device pixel edge, which is the sharpest an edge
   * can possibly be.
   */
  const raw = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const dpr = Math.max(1, Math.min(Math.floor(raw), 2))
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
  const gridMode = opts.gridMode ?? 'auto'

  const cssW = ctx.canvas.width / (ctx.getTransform().a || 1)
  const cssH = ctx.canvas.height / (ctx.getTransform().d || 1)

  ctx.imageSmoothingEnabled = false

  // 1. clear to TRANSPARENT — the canvas paints no background of its own.
  ctx.clearRect(0, 0, cssW, cssH)

  const ax = Math.round(vp.offsetX)
  const ay = Math.round(vp.offsetY)
  const aw = doc.w * vp.scale
  const ah = doc.h * vp.scale

  /**
   * 2. artwork backdrop.
   *
   * Flat by default — never a checkerboard unless asked. The original note here
   * said "never a checkerboard" full stop, and that was a deliberate call: a
   * checkerboard under pixel art is noise competing with the artwork. What
   * argued it back to an option is that a flat ground cannot distinguish a
   * TRANSPARENT pixel from one painted the same colour as the ground, and in a
   * format whose first principle is that "." is transparent that ambiguity is
   * real. Off by default; see docs/specs/16-settings.md §2.
   */
  ctx.fillStyle = theme.artBg
  ctx.fillRect(ax, ay, aw, ah)

  if (opts.transparencyGrid) {
    drawTransparencyGrid(ctx, ax, ay, aw, ah, vp.scale, theme)
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

  // 4. grid — 1px at the cell pitch, no majors.
  //
  // 'auto' is the behaviour that was always here: below GRID_MIN_SCALE the grid
  // would have more lines than artwork, so it is suppressed. 'on' is a
  // deliberate override for someone who wants it anyway.
  if (gridMode !== 'off' && (gridMode === 'on' || vp.scale >= GRID_MIN_SCALE)) {
    drawGrid(ctx, ax, ay, doc.w, doc.h, vp.scale, theme)
  }

  // 4.5. symmetry axis — unlike the grid, drawn at every zoom: the whole point
  // is knowing where a stroke will land, which matters most zoomed OUT, doing
  // a broad stroke, not zoomed in on one cell. Spec 16 §3.1.
  if (opts.symmetry && opts.symmetry !== 'off') {
    drawSymmetryAxes(ctx, ax, ay, aw, ah, opts.symmetry, theme)
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

/**
 * The classic two-tone checkerboard, behind everything the artwork draws.
 *
 * Cell size is fixed in CSS pixels rather than tied to the document grid: at 46x
 * a per-pixel checker would be enormous squares that read as artwork, and at 2x
 * it would be a grey haze. 8px is small enough to read as "nothing here" and
 * large enough not to shimmer.
 *
 * Clipped to the artwork rectangle, because its whole job is to say where the
 * document is transparent — bleeding outside it would say the opposite.
 */
function drawTransparencyGrid(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  _scale: number,
  theme: ThemeColors,
): void {
  const CELL = 8
  ctx.save()
  ctx.beginPath()
  ctx.rect(ax, ay, aw, ah)
  ctx.clip()
  ctx.fillStyle = theme.checker
  for (let y = 0; y < ah; y += CELL) {
    for (let x = ((y / CELL) % 2) * CELL; x < aw; x += CELL * 2) {
      ctx.fillRect(ax + x, ay + y, Math.min(CELL, aw - x), Math.min(CELL, ah - y))
    }
  }
  ctx.restore()
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

/** One dashed segment's length, and the gap after it, in CSS px. Fixed rather
 *  than scaled with zoom — the guide is a UI affordance, not a pixel row. */
const AXIS_DASH = 6
const AXIS_GAP = 4
const AXIS_WIDTH = 2

/**
 * The line(s) a symmetric stroke mirrors across. Spec 16 §3.1.
 *
 * `H` mirrors left-right (`x → w-1-x`), so its axis is the VERTICAL line
 * through the middle; `V` mirrors top-bottom, so its axis is horizontal.
 * `Both` draws the pair, which is also the exact seam a `Both`-mirrored
 * stroke reflects across into all four quadrants.
 *
 * `difference` against `theme.accent`, the same technique the grid uses
 * against `theme.grid` and for the same reason — the artwork is arbitrary
 * user data, so a flat colour vanishes against whatever half of it happens to
 * match it. Using `accent` rather than `grid` gives the axis a colour cast
 * the plain grid does not have, which is the whole point: a user glancing at
 * the canvas should read "guide" and "grid" as two different things, not
 * notice one more grid line. Thicker (2px) and dashed for the same reason,
 * and — unlike the grid — drawn at every zoom: the axis matters most zoomed
 * OUT, mid-stroke, not zoomed in on one cell where the grid earns its keep.
 */
function drawSymmetryAxes(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  mode: 'h' | 'v' | 'both',
  theme: ThemeColors,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'difference'
  ctx.fillStyle = theme.accent

  if (mode === 'h' || mode === 'both') {
    const x = ax + Math.round(aw / 2) - AXIS_WIDTH / 2
    for (let y = 0; y < ah; y += AXIS_DASH + AXIS_GAP) {
      ctx.fillRect(x, ay + y, AXIS_WIDTH, Math.min(AXIS_DASH, ah - y))
    }
  }
  if (mode === 'v' || mode === 'both') {
    const y = ay + Math.round(ah / 2) - AXIS_WIDTH / 2
    for (let x = 0; x < aw; x += AXIS_DASH + AXIS_GAP) {
      ctx.fillRect(ax + x, y, Math.min(AXIS_DASH, aw - x), AXIS_WIDTH)
    }
  }

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

/**
 * Selection rectangle.
 *
 * Drawn as a two-tone dashed border — white under, dark dashes over — for the
 * same reason the grid is composited rather than coloured: the selection can
 * land on any artwork colour, and a single-tone outline disappears against one
 * of them. This is the classic "marching ants" treatment minus the marching;
 * looping motion in the periphery is a vestibular trigger and this is the one
 * overlay that would run continuously.
 */
export function renderSelection(
  ctx: CanvasRenderingContext2D,
  sel: { x: number; y: number; w: number; h: number },
  vp: Viewport,
): void {
  const ax = Math.round(vp.offsetX) + sel.x * vp.scale
  const ay = Math.round(vp.offsetY) + sel.y * vp.scale
  const w = sel.w * vp.scale
  const h = sel.h * vp.scale

  ctx.save()
  ctx.lineWidth = 1
  // Half-pixel offset so a 1px stroke lands on the pixel rather than straddling
  // two and rendering as a 2px blur.
  const r = [ax + 0.5, ay + 0.5, w - 1, h - 1] as const

  ctx.setLineDash([])
  ctx.strokeStyle = '#ffffff'
  ctx.strokeRect(...r)

  ctx.setLineDash([4, 4])
  ctx.strokeStyle = '#000000'
  ctx.strokeRect(...r)
  ctx.restore()
}
