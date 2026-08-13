/**
 * Drive the Export popover with real clicks and real downloads.
 * See docs/specs/08-exporters.md §10.
 *
 *   npx tsx tools/probe-export.ts
 *
 * The six exporters have 68 unit tests and every one of them runs in node,
 * against a `Doc` built by hand. None of that can tell you whether the popover
 * actually renders six rows, whether a click really produces a download, or
 * whether the one failure this file can produce — the CSS pixel cap — reaches
 * the screen instead of the browser's download manager. That is what this is
 * for.
 *
 * Reads the document through the development-only `window.__tessera` hook.
 * Read-only — commit() is still the only writer.
 */

import { chromium, type Page, type Download, type Locator } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exportRowDomId, exportScaleDomId, type ExportFormat } from '../lib/editor/export-menu'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'
const SOURCE = `window.__tessera.source()`

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

const source = (p: Page) => p.evaluate(SOURCE) as Promise<string>
const menu = (p: Page) => p.locator('#code-export-menu')
/** Built from the same function `ExportPopover.tsx` uses, so the two cannot drift. */
const row = (id: ExportFormat) => (p: Page) => {
  const sel = exportRowDomId(id)
  return p.locator('#' + sel)
}
const scale = (n: number) => (p: Page) => {
  const sel = exportScaleDomId(n)
  return p.locator('#' + sel)
}

async function loadFace(p: Page) {
  await p.getByRole('button', { name: 'File — new, open, export' }).click()
  await p.waitForTimeout(200)
  await p.locator('#file-examples').click()
  await p.waitForTimeout(150)
  await p.locator('#file-example-face').click()
  await p.waitForTimeout(500)
}

async function openCodePanel(p: Page) {
  if ((await p.locator('#code-panel').count()) === 0) {
    await p.getByRole('button', { name: 'Code' }).click()
    await p.waitForTimeout(400)
  }
}

async function openExport(p: Page) {
  if ((await menu(p).count()) === 0) {
    await p.locator('#code-export').click()
    await p.waitForTimeout(200)
  }
}

/** Click a row (or a scale/lang button inside it) and capture the download it produces. */
async function download(p: Page, locator: (p: Page) => Locator): Promise<Download> {
  const [d] = await Promise.all([p.waitForEvent('download'), locator(p).click()])
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
    (await p.locator('#code-export').count()) === 1)

  await openExport(p)
  check(`${theme}: opens a dialog labelled Export`,
    (await p.getByRole('dialog', { name: 'Export' }).count()) === 1)
  await p.screenshot({ path: join(OUT, `probe-export-${theme}.png`) })

  for (const id of ['png', 'svg', 'css', 'react', 'json', 'ascii'] as const) {
    check(`${theme}: the ${id} row is present`, (await row(id)(p).count()) === 1)
  }
  for (const n of [1, 2, 4, 8]) {
    check(`${theme}: the ${n}× PNG button is present`, (await scale(n)(p).count()) === 1)
  }
  check(`${theme}: React's language toggle starts on TS`,
    (await p.locator('#export-react-lang').innerText()) === 'TS')

  // ── JSON: byte-identical to the code panel's own text ─────────────────────
  const jsonDl = await download(p, row('json'))
  check(`${theme}: JSON filename ends .tessera.json`,
    /\.tessera\.json$/.test(jsonDl.suggestedFilename()))
  check(`${theme}: JSON content is exactly what the code panel shows (rule 3)`,
    (await content(jsonDl)) === await source(p))

  // ── SVG ─────────────────────────────────────────────────────────────────
  const svgDl = await download(p, row('svg'))
  check(`${theme}: SVG filename ends .svg`, svgDl.suggestedFilename().endsWith('.svg'))
  const svg = await content(svgDl)
  check(`${theme}: SVG is a real svg document with crisp edges`,
    svg.startsWith('<svg xmlns=') && svg.includes('shape-rendering="crispEdges"'))

  // ── ASCII: same shape as the document, one char per pixel ─────────────────
  const asciiDl = await download(p, row('ascii'))
  check(`${theme}: ASCII filename ends .txt`, asciiDl.suggestedFilename().endsWith('.txt'))
  const ascii = (await content(asciiDl)).replace(/\n$/, '').split('\n')
  const { w, h } = JSON.parse(await source(p)) as { w: number; h: number }
  check(`${theme}: ASCII has one row per document row, each the right width`,
    ascii.length === h && ascii.every((r) => r.length === w),
    `${ascii.length} rows of ${ascii[0]?.length}, expected ${h} of ${w}`)

  // ── CSS, the happy path (the pixel cap gets its own document below) ───────
  const cssDl = await download(p, row('css'))
  check(`${theme}: CSS filename ends .css`, cssDl.suggestedFilename().endsWith('.css'))
  check(`${theme}: CSS declares box-shadow`, (await content(cssDl)).includes('box-shadow'))

  // ── React: TS by default, JS after the toggle ─────────────────────────────
  const tsxDl = await download(p, row('react'))
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
  const jsxDl = await download(p, row('react'))
  check(`${theme}: …and the download switches to .jsx`, jsxDl.suggestedFilename().endsWith('.jsx'))
  check(`${theme}: …with no TS annotation`, !(await content(jsxDl)).includes('size?: number'))
  await p.locator('#export-react-lang').click() // back to TS for anyone running this again

  // ── PNG: real bytes, the right magic number, the scale in the filename ────
  const pngDl = await download(p, scale(4))
  check(`${theme}: PNG filename encodes the scale`, pngDl.suggestedFilename().endsWith('@4x.png'))
  const png = await bytes(pngDl)
  check(`${theme}: PNG starts with the PNG signature`,
    png.length > 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47)

  // ── dismissal ───────────────────────────────────────────────────────────
  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
  check(`${theme}: Escape closes the popover`, (await menu(p).count()) === 0)
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
  await openExport(p)

  let fired = false
  p.once('download', () => { fired = true })
  await row('css')(p).click()
  await p.waitForTimeout(500)

  check('CSS over the pixel cap does not download anything', !fired)
  const err = await p.locator('#code-export-menu [role="alert"]').innerText()
  check('…and says why, inline in the popover, not as a toast (§10)',
    /too many/i.test(err) && /SVG/.test(err), err)
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
    const errors: string[] = []
    p.on('pageerror', (e) => errors.push(String(e)))
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)

    await run(p, theme)
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

  // ── the code panel is a full-screen sheet below 640, and Export has to fit ─
  for (const [name, width, height] of [['mobile', 390, 844], ['narrow', 320, 568]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)

    await openCodePanel(p)
    await openExport(p)
    const box = await menu(p).boundingBox()
    check(`${name}: the export popover is fully on screen`,
      !!box && box.x >= 0 && box.x + box.width <= width, JSON.stringify(box))
    await p.screenshot({ path: join(OUT, `probe-export-${name}.png`) })

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
