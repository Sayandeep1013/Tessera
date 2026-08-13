/**
 * Drive the Symmetry control and assert the axis line it draws.
 * See docs/specs/16-settings.md §3.1.
 *
 *   npx tsx tools/probe-symmetry.ts
 *
 * The mirror maths (`mirrored`) has its own exhaustive unit tests and never
 * touches a canvas. What it cannot tell you is whether the *guide* — the line
 * showing where that mirror actually is — is drawn at all, is drawn in the
 * right place, or quietly stops existing when the window resizes. There is no
 * golden-image harness for `lib/renderer/canvas.ts` (04-renderer.md §8 was
 * never built), so a real canvas is the only way to check this.
 *
 * Reads the document and viewport through the development-only
 * `window.__tessera` hook. Read-only — commit() is still the only writer.
 */

import { chromium, type Page } from 'playwright'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

type Vp = { scale: number; offsetX: number; offsetY: number }
const viewport = (p: Page) => p.evaluate('window.__tessera.viewport()') as Promise<Vp>
const size = (p: Page) => p.evaluate('window.__tessera.size()') as Promise<{ w: number; h: number }>

async function openEditorTab(p: Page) {
  if ((await p.getByRole('dialog', { name: 'Settings' }).count()) === 0) {
    await p.getByRole('button', { name: 'Settings' }).click()
    await p.waitForTimeout(200)
  }
  // Editor is the default tab — nothing to click to get there.
}

async function closeSettings(p: Page) {
  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
}

const setMode = (p: Page, name: string) =>
  p.getByRole('radiogroup', { name: 'Symmetry' }).getByRole('radio', { name, exact: true }).click()

/**
 * At the default 32×32 document, `w/2` and `h/2` are both 16 — an integer,
 * which is exactly where a regular interior grid line already sits regardless
 * of symmetry. Left on, the pixel grid confounds every pixel comparison below
 * with a line that would be there anyway. Off for this probe only; the two
 * features are independent and this isolates the one under test.
 */
const disableGrid = (p: Page) =>
  p.getByRole('radiogroup', { name: 'Pixel grid' }).getByRole('radio', { name: 'Off', exact: true }).click()

/** One [r, g, b] sample from the live canvas at a CSS-pixel position, read inside the page. */
async function sample(p: Page, cssX: number, cssY: number): Promise<[number, number, number]> {
  return p.evaluate(([cssX, cssY]) => {
    const canvas = document.querySelector('canvas')!
    const ctx = canvas.getContext('2d')!
    const dpr = canvas.width / canvas.getBoundingClientRect().width
    const [r, g, b] = ctx.getImageData(Math.round(cssX * dpr), Math.round(cssY * dpr), 1, 1).data
    return [r, g, b] as [number, number, number]
  }, [cssX, cssY] as const)
}

const dist = (a: [number, number, number], b: [number, number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

async function run(p: Page, theme: string) {
  await openEditorTab(p)
  await disableGrid(p)
  await p.waitForTimeout(150)

  const vp = await viewport(p)
  const { w, h } = await size(p)
  const midX = vp.offsetX + (w / 2) * vp.scale
  const midY = vp.offsetY + (h / 2) * vp.scale

  // A point off BOTH axes, in flat backdrop the whole way through this run —
  // nothing here ever paints a pixel, so one sample is the baseline for every
  // "is anything drawn here" comparison below. Mid-CELL (`+ 0.5`), not on a
  // cell boundary — w/4 and h/4 land exactly on a grid line for a 32×32 doc,
  // which would contaminate the baseline with the grid's own difference blend.
  const baseline = await sample(p, vp.offsetX + (w / 4 + 0.5) * vp.scale, vp.offsetY + (h / 4 + 0.5) * vp.scale)

  // Points ON an axis, but near the artwork's own top-left corner rather than
  // its middle: the line is dashed (renderer/canvas.ts's AXIS_DASH/AXIS_GAP),
  // and a dash always starts at the artwork's edge, so a sample a few CSS px
  // in from an edge is guaranteed to land on drawn pixels rather than risking
  // a gap at some arbitrary point along the line's length.
  const onVerticalAxis = () => sample(p, midX, vp.offsetY + 3)
  const onHorizontalAxis = () => sample(p, vp.offsetX + 3, midY)

  // ── off: nothing drawn on either line ──────────────────────────────────
  await setMode(p, 'Off')
  await p.waitForTimeout(150)
  await closeSettings(p)
  check(`${theme}: off — nothing at x = w/2`, dist(await onVerticalAxis(), baseline) < 24)
  check(`${theme}: off — nothing at y = h/2`, dist(await onHorizontalAxis(), baseline) < 24)

  // ── h: a vertical line through x = w/2, and only that one ─────────────
  await openEditorTab(p)
  await setMode(p, 'Mirror horizontally')
  await p.waitForTimeout(150)
  await closeSettings(p)
  await p.screenshot({ path: join(OUT, `probe-symmetry-h-${theme}.png`) })
  check(`${theme}: H — a line at x = w/2`, dist(await onVerticalAxis(), baseline) > 24)
  check(`${theme}: H — nothing at y = h/2`, dist(await onHorizontalAxis(), baseline) < 24)

  // ── v: a horizontal line through y = h/2, and only that one ───────────
  await openEditorTab(p)
  await setMode(p, 'Mirror vertically')
  await p.waitForTimeout(150)
  await closeSettings(p)
  await p.screenshot({ path: join(OUT, `probe-symmetry-v-${theme}.png`) })
  check(`${theme}: V — a line at y = h/2`, dist(await onHorizontalAxis(), baseline) > 24)
  check(`${theme}: V — nothing at x = w/2`, dist(await onVerticalAxis(), baseline) < 24)

  // ── both: the same two lines together ──────────────────────────────────
  await openEditorTab(p)
  await setMode(p, 'Mirror both ways')
  await p.waitForTimeout(150)
  await closeSettings(p)
  await p.screenshot({ path: join(OUT, `probe-symmetry-both-${theme}.png`) })
  check(`${theme}: Both — the horizontal-mirror line is there`, dist(await onVerticalAxis(), baseline) > 24)
  check(`${theme}: Both — the vertical-mirror line is there`, dist(await onHorizontalAxis(), baseline) > 24)

  // ── back to off leaves no trace ────────────────────────────────────────
  await openEditorTab(p)
  await setMode(p, 'Off')
  await p.waitForTimeout(150)
  await closeSettings(p)
  check(`${theme}: switching back to off removes both lines`,
    dist(await onVerticalAxis(), baseline) < 24 && dist(await onHorizontalAxis(), baseline) < 24)
}

async function main() {
  const browser = await chromium.launch()

  for (const theme of ['dark', 'light'] as const) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: theme,
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

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : `\n${results.length} checks, the symmetry axis behaves`)
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
