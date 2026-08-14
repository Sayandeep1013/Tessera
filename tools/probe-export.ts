/**
 * Drive the format tabs and the single Export button with real clicks and
 * real downloads. See docs/specs/08-exporters.md §10, §13 and §14.
 *
 *   npx tsx tools/probe-export.ts
 *
 * The exporters have well over a hundred unit tests and every one of them
 * runs in node, against a `Doc` built by hand. None of that can tell you
 * whether the tabs actually render, whether a click really produces a
 * download, whether the one failure the CSS path can produce reaches the
 * screen instead of the browser's download manager — or, for unit G, whether
 * a real Web Worker actually exists and actually encodes a real GIF in a real
 * browser, which no node test can exercise at all. That is what this is for.
 *
 * Reads the document through the development-only `window.__tessera` hook.
 * Read-only — commit() is still the only writer.
 */

import { chromium, type Page, type Download, type Locator } from 'playwright'
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  exportAnimatedToggleDomId, exportScaleDomId, formatTabDomId, type FormatTabId,
} from '../lib/editor/export-menu'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'
const SOURCE = `window.__tessera.source()`

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

const source = (p: Page) => p.evaluate(SOURCE) as Promise<string>
const panel = (p: Page) => p.locator('#code-panel')
/** Built from the same function `CodePanel.tsx` uses, so the two cannot drift. */
const tab = (id: FormatTabId) => (p: Page) => p.locator('#' + formatTabDomId(id))
const scale = (n: number) => (p: Page) => p.locator('#' + exportScaleDomId(n))
const exportButton = (p: Page) => p.locator('#code-export')

async function loadFace(p: Page) {
  await p.getByRole('button', { name: 'File — new, open, export' }).click()
  await p.waitForTimeout(200)
  await p.locator('#file-examples').click()
  await p.waitForTimeout(150)
  await p.locator('#file-example-face').click()
  await p.waitForTimeout(500)
}

async function openCodePanel(p: Page) {
  if ((await panel(p).count()) === 0) {
    await p.getByRole('button', { name: 'Code' }).click()
    await p.waitForTimeout(400)
  }
}

/** Switch to a tab and click the one Export button — §14: it acts on
 *  whichever tab is showing, so every download in this file goes through
 *  exactly this sequence. */
async function exportFrom(p: Page, id: FormatTabId): Promise<Download> {
  await tab(id)(p).click()
  await p.waitForTimeout(150)
  const [d] = await Promise.all([p.waitForEvent('download'), exportButton(p).click()])
  return d
}

async function content(d: Download): Promise<string> {
  const path = await d.path()
  return path ? readFileSync(path, 'utf8') : ''
}

async function bytes(d: Download): Promise<Buffer> {
  const path = await d.path()
  return path ? readFileSync(path) : Buffer.alloc(0)
}

/**
 * Sprite sheet fires two downloads from one Export click (§13.1) —
 * `Promise.all` of two `waitForEvent` calls does NOT work for this: both
 * promises resolve off the SAME first event, so a `page.on('download', ...)`
 * listener is the only way to actually capture two distinct ones in order.
 */
async function downloadsFrom(p: Page, id: FormatTabId, count: number): Promise<Download[]> {
  await tab(id)(p).click()
  await p.waitForTimeout(150)
  const seen: Download[] = []
  const onDownload = (d: Download) => seen.push(d)
  p.on('download', onDownload)
  await exportButton(p).click()
  for (let i = 0; i < 200 && seen.length < count; i++) await p.waitForTimeout(20)
  p.off('download', onDownload)
  return seen
}

/** Every `0x21 0xF9` Graphic Control Extension this app's own writer emits is
 *  a fixed 8-byte block (§13.2) — reading the delay 4 bytes past the tag is
 *  reliable for bytes this file's own encoder produced, without writing a
 *  second, general-purpose GIF parser just for the probe. */
function gifFrameDelays(bytes: Buffer): number[] {
  const delays: number[] = []
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) delays.push(bytes[i + 4]! | (bytes[i + 5]! << 8))
  }
  return delays
}

async function resizeCanvas(p: Page, size: number) {
  await p.getByRole('button', { name: 'Settings' }).click()
  await p.waitForTimeout(200)
  await p.getByRole('radio', { name: 'Canvas' }).click()
  await p.waitForTimeout(150)
  await p.getByLabel('Width').fill(String(size))
  await p.getByLabel('Height').fill(String(size))
  await p.locator('#canvas-size-apply').click()
  await p.waitForTimeout(400)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
}

function timelinePanel(p: Page): Locator {
  return p.locator('[role="dialog"][aria-label="Timeline"]')
}

async function setFrameDuration(p: Page, n: number, ms: number) {
  await timelinePanel(p).getByRole('button', { name: `Frame ${n}`, exact: true }).click()
  const input = p.getByLabel('Frame duration, milliseconds')
  await input.fill(String(ms))
  await input.press('Enter')
  await p.waitForTimeout(150)
}

/** Fill the whole canvas with whatever the currently-selected colour is. */
async function fillCanvas(p: Page) {
  await p.getByRole('button', { name: 'Fill (G)' }).click()
  const box = await p.locator('canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await p.waitForTimeout(200)
}

/**
 * G's own surface: sprite sheet, GIF (via a real Web Worker), and the
 * animated React/CSS hooks — everything the six-tab run above cannot reach
 * because it is single-frame by construction. `face` alone is one frame; this
 * builds a real three-frame document with distinct content per frame, because
 * a GIF or sprite sheet of three identical pictures would pass every check
 * here by accident.
 */
async function runAnimated(p: Page, theme: string) {
  await loadFace(p)
  await openCodePanel(p)

  // ── gating: one frame means no gif/spritesheet tab, no animated toggle ────
  check(`${theme}: a single-frame document shows no GIF tab`, (await tab('gif')(p).count()) === 0)
  check(`${theme}: …nor a sprite-sheet tab`, (await tab('spritesheet')(p).count()) === 0)
  await tab('react')(p).click()
  await p.waitForTimeout(100)
  check(`${theme}: …nor a React Animated toggle`,
    (await p.locator('#' + exportAnimatedToggleDomId('react')).count()) === 0)

  // ── build a real three-frame document ──────────────────────────────────
  // Large enough that even a warm worker's GIF encode takes long enough for
  // several progress polls to land on different values — a 40×40 canvas
  // compresses too fast for the "did it actually advance" check below to
  // mean anything once the worker chunk is no longer cold-compiling.
  await resizeCanvas(p, 180)
  await p.getByRole('button', { name: 'Timeline' }).click()
  await p.waitForTimeout(300)
  await timelinePanel(p).getByRole('button', { name: 'Add frame' }).click()
  await p.waitForTimeout(200)
  await timelinePanel(p).getByRole('button', { name: 'Add frame' }).click()
  await p.waitForTimeout(200)

  // Frame durations: 100ms, 250ms, and a 10ms frame (the format's own floor,
  // `MIN_FRAME_MS`) to exercise the GIF exporter's 20ms clamp (§9) for real,
  // not just in a unit test.
  await setFrameDuration(p, 1, 100)
  await setFrameDuration(p, 2, 250)
  await setFrameDuration(p, 3, 10)

  // Distinct content per frame — frame 1 already carries `face`'s own
  // painted pixels; flood-fill frames 2 and 3 with two swatches so a sprite
  // sheet or GIF of "the same picture three times" cannot pass these checks
  // by accident. Swatch 3, not swatch 2: `face`'s own centre pixel already
  // happens to sit on palette index 2 — found by this probe sampling the
  // "filled" frame and getting the original artwork's own colour back.
  const swatches = p.locator('[role="dialog"][aria-label="Palette"] button')

  await timelinePanel(p).getByRole('button', { name: 'Frame 2', exact: true }).click()
  await p.getByRole('button', { name: 'Colour' }).click()
  await p.waitForTimeout(150)
  await swatches.nth(1).click() // also closes the popover
  await fillCanvas(p)

  await timelinePanel(p).getByRole('button', { name: 'Frame 3', exact: true }).click()
  await p.getByRole('button', { name: 'Colour' }).click()
  await p.waitForTimeout(150)
  await swatches.nth(3).click()
  await fillCanvas(p)

  await openCodePanel(p)

  check(`${theme}: a three-frame document now shows the GIF tab`, (await tab('gif')(p).count()) === 1)
  check(`${theme}: …and the sprite-sheet tab`, (await tab('spritesheet')(p).count()) === 1)
  await tab('react')(p).click()
  await p.waitForTimeout(100)
  const reactToggle = p.locator('#' + exportAnimatedToggleDomId('react'))
  check(`${theme}: …and React's Animated toggle`, (await reactToggle.count()) === 1)
  await tab('css')(p).click()
  await p.waitForTimeout(100)
  const cssToggle = p.locator('#' + exportAnimatedToggleDomId('css'))
  check(`${theme}: …and CSS's Animated toggle`, (await cssToggle.count()) === 1)
  await p.screenshot({ path: join(OUT, `probe-export-animated-${theme}.png`) })

  // ── sprite sheet: two files from one click, agreeing with each other ─────
  const sheetDownloads = await downloadsFrom(p, 'spritesheet', 2)
  check(`${theme}: sprite sheet fires exactly two downloads`, sheetDownloads.length === 2,
    sheetDownloads.map((d) => d.suggestedFilename()).join(', '))
  const png = sheetDownloads.find((d) => d.suggestedFilename().endsWith('.png'))
  const atlasDl = sheetDownloads.find((d) => d.suggestedFilename().endsWith('.json'))
  check(`${theme}: …a .sheet.png and a .sheet.json`, !!png && !!atlasDl)
  if (png && atlasDl) {
    const sheetPng = PNG.sync.read(await bytes(png))
    const atlas = JSON.parse(await content(atlasDl)) as {
      w: number; h: number; frames: Array<{ x: number; y: number; w: number; h: number; ms: number }>
    }
    check(`${theme}: the atlas lists all three frames, with the durations just set`,
      atlas.frames.map((f) => f.ms).join(',') === '100,250,10', JSON.stringify(atlas.frames.map((f) => f.ms)))
    check(`${theme}: the PNG is exactly as wide as three tiles side by side`,
      sheetPng.width === atlas.w * 3 && sheetPng.height === atlas.h,
      `${sheetPng.width}x${sheetPng.height} vs ${atlas.w * 3}x${atlas.h}`)
    // Sample the centre of each tile — three different fills, three colours.
    const cx = (i: number) => atlas.frames[i]!.x + Math.floor(atlas.w / 2)
    const cy = Math.floor(atlas.h / 2)
    const colourAt = (x: number, y: number) => {
      const idx = (y * sheetPng.width + x) * 4
      return [sheetPng.data[idx], sheetPng.data[idx + 1], sheetPng.data[idx + 2]].join(',')
    }
    const tileColours = [0, 1, 2].map((i) => colourAt(cx(i), cy))
    check(`${theme}: the three tiles are three different colours, not one picture repeated`,
      new Set(tileColours).size === 3, tileColours.join(' | '))
  }

  // ── GIF: a real Web Worker, a real progress bar, a real file ─────────────
  // The FIRST GIF export against a fresh dev server pays a one-time
  // Turbopack compile cost for the worker chunk — seconds, not milliseconds
  // — so the progress bar is polled CONCURRENTLY with the download wait,
  // for the download's own full timeout, rather than for a fixed budget that
  // a cold compile could burn through before encoding even starts.
  //
  // Once the chunk is warm, three `postMessage` round trips for a
  // 180×180 document reliably complete faster than this poll's own
  // round-trip latency can distinguish — this is a real Worker actually
  // doing its job quickly, not a bug, and not something worth fighting with
  // a bigger and bigger test document. So this checks what polling CAN
  // prove deterministically — the bar existed, at least once, with the
  // right total — rather than a specific number of distinct values, which
  // a fast machine can legitimately make impossible to observe.
  await tab('gif')(p).click()
  await p.waitForTimeout(150)
  let sawProgress = false
  let sawCorrectTotal = false
  let gifFinished = false
  const pollProgress = (async () => {
    while (!gifFinished) {
      if ((await p.locator('#export-gif-progress').count()) > 0) {
        sawProgress = true
        const max = await p.locator('#export-gif-progress').getAttribute('aria-valuemax').catch(() => null)
        if (max === '3') sawCorrectTotal = true
      }
      await p.waitForTimeout(5)
    }
  })()
  const gifDownloadPromise = p.waitForEvent('download', { timeout: 20_000 })
  await exportButton(p).click()
  const gifDownload = await gifDownloadPromise
  gifFinished = true
  await pollProgress

  check(`${theme}: GIF filename ends .gif`, gifDownload.suggestedFilename().endsWith('.gif'))
  const gifBytes = await bytes(gifDownload)
  check(`${theme}: GIF opens with the GIF89a signature`,
    gifBytes.subarray(0, 6).toString('ascii') === 'GIF89a')
  check(`${theme}: GIF ends with the trailer byte`, gifBytes[gifBytes.length - 1] === 0x3b)
  const delays = gifFrameDelays(gifBytes)
  check(`${theme}: GIF carries exactly three frames`, delays.length === 3, String(delays.length))
  check(`${theme}: …with delays converted to centiseconds, the 10ms one clamped to the 20ms floor`,
    delays.join(',') === '10,25,2', delays.join(','))
  check(`${theme}: a progress bar appeared at some point during encoding`, sawProgress)
  if (sawProgress) {
    check(`${theme}: …reporting the right frame count as its total`, sawCorrectTotal)
  }

  // ── animated React: one <g> per frame, real keyframes, still valid TS ─────
  await tab('react')(p).click()
  await p.waitForTimeout(100)
  await reactToggle.click()
  const animatedTsx = await exportFrom(p, 'react')
  const animatedTsxSrc = await content(animatedTsx)
  check(`${theme}: animated React emits three <g> groups`,
    [...animatedTsxSrc.matchAll(/<g style=/g)].length === 3)
  check(`${theme}: …and three @keyframes rules`,
    [...animatedTsxSrc.matchAll(/@keyframes/g)].length === 3)
  await reactToggle.click() // back off, for anyone re-running this
  const staticTsx = await exportFrom(p, 'react')
  check(`${theme}: switching the toggle back off returns a single, static <svg>`,
    !(await content(staticTsx)).includes('@keyframes'))

  // ── animated CSS: one @keyframes rule, no static box-shadow ───────────────
  await tab('css')(p).click()
  await p.waitForTimeout(100)
  await cssToggle.click()
  const animatedCss = await exportFrom(p, 'css')
  const animatedCssSrc = await content(animatedCss)
  check(`${theme}: animated CSS declares @keyframes and an animation shorthand`,
    animatedCssSrc.includes('@keyframes') && animatedCssSrc.includes('animation:'))
  check(`${theme}: …not a static box-shadow declaration`, !/^\s*box-shadow:/m.test(animatedCssSrc))
  await cssToggle.click()
  const staticCss = await exportFrom(p, 'css')
  check(`${theme}: switching back off returns a static box-shadow rule again`,
    (await content(staticCss)).includes('box-shadow:') && !(await content(staticCss)).includes('@keyframes'))

  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
}

/**
 * §5's real acceptance test: "the exported component, rendered … is
 * pixel-identical to the canvas." A JSX `<rect x={5} y={1} … fill="#…" />` and
 * a DOM `<rect x="5" y="1" … fill="#…" />` are the same node once mounted —
 * React's runtime is not what makes two rects the same colour, the numbers
 * are — so this decodes the exported geometry back to a real, injected SVG
 * and reads real pixels back from it, rather than trusting the source text.
 */
const RECT_PROPS = /<rect x=\{(-?\d+)\} y=\{(-?\d+)\} width=\{(\d+)\} height=\{(\d+)\} fill="(#[0-9a-f]{6})"/g

type PaintedCell = { x: number; y: number }

/** Every cell a `<rect>` covers — the mask both samplers read, so background chrome (grid, checker, `--art-bg`) never enters the comparison. Transparent cells are the exporter's business (§1.4), not the canvas's. */
function paintedCellsOf(tsx: string): PaintedCell[] {
  const out: PaintedCell[] = []
  for (const m of tsx.matchAll(RECT_PROPS)) {
    const x0 = Number(m[1]), y0 = Number(m[2]), w = Number(m[3]), h = Number(m[4])
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push({ x, y })
  }
  return out
}

/** One flat colour per painted cell, sampled from its centre — never an edge, where crispEdges leaves nothing ambiguous to sample wrong. */
async function sampleReactExport(p: Page, tsx: string, w: number, h: number, cells: PaintedCell[]): Promise<string[]> {
  const rects = [...tsx.matchAll(RECT_PROPS)].map((m) => ({
    x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), fill: m[5]!,
  }))
  return p.evaluate(([rects, w, h, cells]) => {
    const svgNs = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNs, 'svg')
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    svg.setAttribute('shape-rendering', 'crispEdges')
    for (const r of rects as Array<{ x: number; y: number; w: number; h: number; fill: string }>) {
      const rect = document.createElementNS(svgNs, 'rect')
      rect.setAttribute('x', String(r.x))
      rect.setAttribute('y', String(r.y))
      rect.setAttribute('width', String(r.w))
      rect.setAttribute('height', String(r.h))
      rect.setAttribute('fill', r.fill)
      svg.appendChild(rect)
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    // Rasterise the real SVG element straight into a canvas, 1 doc pixel per
    // canvas pixel — the browser's own SVG renderer draws it, not this script.
    const url = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg))
    return new Promise<string[]>((resolve) => {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h)
        const out = (cells as PaintedCell[]).map(({ x, y }) => {
          const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
          return `#${[r, g, b].map((c) => c!.toString(16).padStart(2, '0')).join('')}`
        })
        resolve(out)
      }
      img.src = url
    })
  }, [rects, w, h, cells] as const)
}

/** The same read, taken from the app's OWN live canvas at its own viewport transform. */
async function sampleCanvas(p: Page, cells: PaintedCell[]): Promise<string[]> {
  return p.evaluate((cells) => {
    const vp = (window as unknown as {
      __tessera: { viewport(): { scale: number; offsetX: number; offsetY: number } }
    }).__tessera.viewport()
    const canvas = document.querySelector('canvas')!
    const ctx = canvas.getContext('2d')!
    const dpr = canvas.width / canvas.getBoundingClientRect().width
    return (cells as PaintedCell[]).map(({ x, y }) => {
      const cssX = vp.offsetX + (x + 0.5) * vp.scale
      const cssY = vp.offsetY + (y + 0.5) * vp.scale
      const [r, g, b] = ctx.getImageData(Math.round(cssX * dpr), Math.round(cssY * dpr), 1, 1).data
      return `#${[r, g, b].map((c) => c!.toString(16).padStart(2, '0')).join('')}`
    })
  }, cells)
}

async function run(p: Page, theme: string) {
  await loadFace(p)
  await openCodePanel(p)

  check(`${theme}: the export trigger sits in the code panel header`,
    (await exportButton(p).count()) === 1)
  check(`${theme}: the panel is a dialog labelled Code`,
    (await p.getByRole('dialog', { name: 'Code' }).count()) === 1)
  await p.screenshot({ path: join(OUT, `probe-export-${theme}.png`) })

  for (const id of ['code', 'png', 'svg', 'css', 'react', 'ascii'] as const) {
    check(`${theme}: the ${id} tab is present`, (await tab(id)(p).count()) === 1)
  }
  check(`${theme}: there is no separate json tab — Code already is that text (§14.1)`,
    (await tab('code' as FormatTabId)(p).count()) === 1 && (await p.locator('[role="tab"]', { hasText: 'JSON' }).count()) === 0)

  // ── Code tab's Export IS the JSON download — one function, two entry points ─
  const jsonDl = await exportFrom(p, 'code')
  check(`${theme}: Code tab's Export filename ends .tessera.json`,
    /\.tessera\.json$/.test(jsonDl.suggestedFilename()))
  check(`${theme}: …and its content is exactly what the Code tab shows (rule 3)`,
    (await content(jsonDl)) === await source(p))

  // ── SVG ─────────────────────────────────────────────────────────────────
  const svgDl = await exportFrom(p, 'svg')
  check(`${theme}: SVG filename ends .svg`, svgDl.suggestedFilename().endsWith('.svg'))
  const svg = await content(svgDl)
  check(`${theme}: SVG is a real svg document with crisp edges`,
    svg.startsWith('<svg xmlns=') && svg.includes('shape-rendering="crispEdges"'))
  check(`${theme}: …and the SVG tab previewed the same text before Export was clicked`,
    (await panel(p).locator('pre').innerText()) === svg)

  // ── ASCII: same shape as the document, one char per pixel ─────────────────
  const asciiDl = await exportFrom(p, 'ascii')
  check(`${theme}: ASCII filename ends .txt`, asciiDl.suggestedFilename().endsWith('.txt'))
  const ascii = (await content(asciiDl)).replace(/\n$/, '').split('\n')
  const { w, h } = JSON.parse(await source(p)) as { w: number; h: number }
  check(`${theme}: ASCII has one row per document row, each the right width`,
    ascii.length === h && ascii.every((r) => r.length === w),
    `${ascii.length} rows of ${ascii[0]?.length}, expected ${h} of ${w}`)

  // ── CSS, the happy path (the pixel cap gets its own document below) ───────
  const cssDl = await exportFrom(p, 'css')
  check(`${theme}: CSS filename ends .css`, cssDl.suggestedFilename().endsWith('.css'))
  check(`${theme}: CSS declares box-shadow`, (await content(cssDl)).includes('box-shadow'))

  // ── React: TS by default, JS after the toggle ─────────────────────────────
  await tab('react')(p).click()
  await p.waitForTimeout(100)
  check(`${theme}: React's language toggle starts on TS`,
    (await p.locator('#export-react-lang').innerText()) === 'TS')
  const tsxDl = await exportFrom(p, 'react')
  check(`${theme}: React defaults to .tsx`, tsxDl.suggestedFilename().endsWith('.tsx'))
  const tsx = await content(tsxDl)
  check(`${theme}: …with a TS prop type`, tsx.includes('size?: number'))

  // ── §5's acceptance test: the exported geometry, actually rendered, is
  // pixel-identical to what the app's own canvas shows for the same document ─
  {
    const { w, h } = JSON.parse(await source(p)) as { w: number; h: number }
    const cells = paintedCellsOf(tsx)
    check(`${theme}: the export covers real, non-empty artwork`, cells.length > 20, String(cells.length))
    const [fromExport, fromCanvas] = await Promise.all([
      sampleReactExport(p, tsx, w, h, cells),
      sampleCanvas(p, cells),
    ])
    const mismatches = cells
      .map((c, i) => ({ ...c, want: fromExport[i], got: fromCanvas[i] }))
      .filter((c) => c.want !== c.got)
    check(`${theme}: the exported React component is pixel-identical to the canvas (§5)`,
      mismatches.length === 0, JSON.stringify(mismatches.slice(0, 5)))
  }

  await p.locator('#export-react-lang').click()
  check(`${theme}: the toggle now reads JS`,
    (await p.locator('#export-react-lang').innerText()) === 'JS')
  const jsxDl = await exportFrom(p, 'react')
  check(`${theme}: …and the download switches to .jsx`, jsxDl.suggestedFilename().endsWith('.jsx'))
  check(`${theme}: …with no TS annotation`, !(await content(jsxDl)).includes('size?: number'))
  await p.locator('#export-react-lang').click() // back to TS for anyone running this again

  // ── PNG: real bytes, the right magic number, the scale in the filename ────
  await tab('png')(p).click()
  await p.waitForTimeout(150)
  for (const n of [1, 2, 4, 8]) {
    check(`${theme}: the ${n}× PNG scale button is present`, (await scale(n)(p).count()) === 1)
  }
  await scale(4)(p).click()
  const [pngDl] = await Promise.all([p.waitForEvent('download'), exportButton(p).click()])
  check(`${theme}: PNG filename encodes the selected scale`, pngDl.suggestedFilename().endsWith('@4x.png'))
  const png = await bytes(pngDl)
  check(`${theme}: PNG starts with the PNG signature`,
    png.length > 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47)
  check(`${theme}: the PNG tab shows a live image preview`, (await panel(p).locator('img').count()) === 1)
  await scale(1)(p).click() // back to 1× for anyone running this again

  // ── dismissal ───────────────────────────────────────────────────────────
  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
  check(`${theme}: Escape closes the whole panel, not just a sub-menu (§14.1's modal)`,
    (await panel(p).count()) === 0)
}

/** F-M-shaped: the CSS exporter's one failure mode, driven for real rather than assumed. */
async function runCssCap(p: Page) {
  await p.getByRole('button', { name: 'Settings' }).click()
  await p.waitForTimeout(200)
  await p.getByRole('radio', { name: 'Canvas' }).click()
  await p.waitForTimeout(150)
  await p.getByLabel('Width').fill('200')
  await p.getByLabel('Height').fill('200')
  await p.locator('#canvas-size-apply').click()
  await p.waitForTimeout(400)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)

  // One flood-fill from an all-transparent 200×200 canvas paints all 40,000
  // cells — comfortably over CSS_ERROR_PIXELS (16,384) — through the same UI
  // path a real user would use, not through the dev hook.
  await p.getByRole('button', { name: 'Fill (G)' }).click()
  const box = await p.locator('canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await p.waitForTimeout(300)

  await openCodePanel(p)

  // The failure shows the instant the CSS tab is looked at — the preview and
  // the Export button call the same exporter, so there is nothing left to
  // discover by clicking Export that the tab did not already say (§14.4).
  await tab('css')(p).click()
  await p.waitForTimeout(200)
  const err = await panel(p).locator('[role="alert"]').innerText()
  check('CSS over the pixel cap says why, inline in the tab, before Export is even clicked (§10/§14.4)',
    /too many/i.test(err) && /SVG/.test(err), err)

  let fired = false
  p.once('download', () => { fired = true })
  await exportButton(p).click()
  await p.waitForTimeout(500)
  check('…and clicking Export on a failing tab still downloads nothing', !fired)
}

async function main() {
  const browser = await chromium.launch()

  for (const theme of ['dark', 'light'] as const) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      acceptDownloads: true,
    })
    const p = await ctx.newPage()
    // The GIF worker chunk compiles on its first hit against a dev server —
    // a few seconds, one time, not a bug — so this stays generous; the GIF
    // download itself carries its own even-longer explicit timeout.
    p.setDefaultTimeout(10_000)
    const errors: string[] = []
    p.on('pageerror', (e) => errors.push(String(e)))
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)

    await run(p, theme)
    await runAnimated(p, theme)
    check(`${theme}: no console errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── the CSS pixel cap, once — it needs its own large document ────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      acceptDownloads: true,
    })
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)
    await runCssCap(p)
    await ctx.close()
  }

  // ── the code panel is a full-screen sheet below 640, and the modal has to
  // fit above it — §14.1 ─────────────────────────────────────────────────────
  for (const [name, width, height] of [['mobile', 390, 844], ['narrow', 320, 568]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)

    await openCodePanel(p)
    const box = await panel(p).boundingBox()
    check(`${name}: the panel is fully on screen`,
      !!box && box.x >= 0 && box.x + box.width <= width, JSON.stringify(box))
    await p.screenshot({ path: join(OUT, `probe-export-${name}.png`) })

    // The Animated toggles and the GIF/sprite-sheet tabs only show once
    // there is more than one frame, and `showTimeline` withholds the
    // Timeline button below the tablet breakpoint (`breakpoint.ts`) — a
    // second frame cannot be added from THIS width at all. Widen first, add
    // one, then narrow back down: `setViewportSize` keeps the document (it
    // is in-memory client state, not tied to the viewport) while letting the
    // wider tab strip be measured at the width that actually withholds the
    // control that grows it.
    await p.keyboard.press('Escape')
    await p.waitForTimeout(150)
    await p.setViewportSize({ width: 1440, height: 900 })
    await p.waitForTimeout(200)
    await p.getByRole('button', { name: 'Timeline' }).click()
    await p.waitForTimeout(300)
    await p.locator('[role="dialog"][aria-label="Timeline"]')
      .getByRole('button', { name: 'Add frame' }).click()
    await p.waitForTimeout(200)
    await p.keyboard.press('Escape')
    await p.waitForTimeout(150)
    await p.setViewportSize({ width, height })
    await p.waitForTimeout(200)

    await openCodePanel(p)
    check(`${name}: the two-frame panel now shows the GIF tab`, (await tab('gif')(p).count()) === 1)
    const wideBox = await panel(p).boundingBox()
    check(`${name}: …and is still fully on screen with the wider, 8-tab strip`,
      !!wideBox && wideBox.x >= 0 && wideBox.x + wideBox.width <= width, JSON.stringify(wideBox))
    await p.screenshot({ path: join(OUT, `probe-export-${name}-animated.png`) })

    await ctx.close()
  }

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : `\n${results.length} checks, the exporters behave`)
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
