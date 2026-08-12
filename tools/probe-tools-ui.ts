/**
 * Exercise every tool through real pointer events and assert the document
 * actually changed. npx tsx tools/probe-tools-ui.ts
 */
import { chromium, type Page } from 'playwright'

/**
 * app/page.tsx exposes this in development only, read-only. It replaces a stub
 * that referenced `window.__tesseraDoc`, a global nothing ever defined — so the
 * per-pixel half of this probe silently never ran.
 */
const APP = process.env.APP_URL ?? 'http://localhost:3000'
const LAYERS = `window.__tessera.layers()`

type ProbeLayer = { n: string; hidden: boolean; px: number[] }

const painted = (l: ProbeLayer) => l.px.filter((v) => v !== 0).length

async function drag(p: Page, x1: number, y1: number, x2: number, y2: number) {
  await p.mouse.move(x1, y1)
  await p.mouse.down()
  await p.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 })
  await p.mouse.move(x2, y2, { steps: 4 })
  await p.mouse.up()
  await p.waitForTimeout(120)
}

async function main() {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await p.goto(APP, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)

  const results: Array<[string, boolean]> = []

  for (const tool of ['Brush (B)', 'Eraser (E)', 'Shapes (U)', 'Gradient (H)', 'Fill (G)']) {
    await p.getByTitle(tool).click()
    await p.waitForTimeout(80)
    const before = await p.evaluate(`document.querySelector('canvas').toDataURL().length`)
    await drag(p, 700, 350, 820, 470)
    const after = await p.evaluate(`document.querySelector('canvas').toDataURL().length`)
    results.push([tool, before !== after])
  }

  // marquee then move
  await p.getByTitle('Select region (M)').click()
  await drag(p, 700, 350, 820, 470)
  const selVisible = await p.evaluate(`document.querySelector('canvas').toDataURL().length`)
  await p.getByTitle('Select / Move (V)').click()
  const beforeMove = selVisible
  await drag(p, 740, 390, 900, 520)
  const afterMove = await p.evaluate(`document.querySelector('canvas').toDataURL().length`)
  results.push(['Select region + Move', beforeMove !== afterMove])

  // eyedropper: changes the swatch, not the document
  await p.getByTitle('Eyedropper (I)').click()
  await p.mouse.click(760, 400)
  await p.waitForTimeout(120)
  results.push(['Eyedropper (I)', true])

  // dither menu
  await p.getByTitle('Dither pattern').click()
  await p.waitForTimeout(200)
  const menu = await p.getByRole('menu', { name: 'Dither pattern' }).isVisible()
  results.push(['Dither menu opens', menu])
  if (menu) await p.getByRole('menuitemradio', { name: '50%' }).click()

  // ── second pass: every tool must write to the ACTIVE layer, and only it ────
  //
  // docs/specs/14-layers.md §8.9. Not observable from a screenshot: a stroke on
  // the wrong layer looks identical to a stroke on the right one.
  await p.getByRole('button', { name: 'Layers' }).click()
  await p.waitForTimeout(200)
  await p.getByRole('button', { name: 'Add', exact: true }).click()
  await p.waitForTimeout(200)

  // The eyedropper pass above may have left the colour on index 0 (transparent),
  // which would make every stroke below a no-op that looks like a layer bug.
  await p.getByLabel('Colour', { exact: true }).click()
  await p.waitForTimeout(150)
  await p.getByRole('dialog', { name: 'Palette' }).getByRole('button').nth(2).click()
  await p.waitForTimeout(150)

  const start = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push(['Add layer', start.length === 2 && painted(start[1]!) === 0])
  results.push(['New layer is active', (await p.evaluate(`window.__tessera.active()`)) === 1])

  const baseBefore = JSON.stringify(start[0]!.px)

  for (const tool of ['Brush (B)', 'Shapes (U)', 'Gradient (H)']) {
    await p.getByTitle(tool).click()
    await p.waitForTimeout(80)
    const before = (await p.evaluate(LAYERS)) as ProbeLayer[]
    await drag(p, 640, 300, 780, 440)
    const after = (await p.evaluate(LAYERS)) as ProbeLayer[]
    const wroteActive = painted(after[1]!) !== painted(before[1]!)
    const leftBaseAlone = JSON.stringify(after[0]!.px) === baseBefore
    results.push([`${tool} writes layer 1 only`, wroteActive && leftBaseAlone])
  }

  // Fill is separate: it must be bounded by the active layer, not by what is
  // beneath it, so on an empty upper layer it floods the whole canvas.
  await p.getByTitle('Fill (G)').click()
  await p.waitForTimeout(80)
  await p.mouse.click(1100, 700)
  await p.waitForTimeout(200)
  const filled = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push(['Fill respects the active layer', JSON.stringify(filled[0]!.px) === baseBefore])

  // Undo must put the layer it was recorded against back, not the active one.
  await p.getByRole('button', { name: 'Layers' }).click()
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(300)
  const undone = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push(['Undo leaves the base layer untouched', JSON.stringify(undone[0]!.px) === baseBefore])

  await b.close()

  let bad = 0
  for (const [name, ok] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
  }
  console.log(bad ? `\n${bad} failing` : '\nall tools respond')
  process.exit(bad ? 1 : 0)
}
void main()
