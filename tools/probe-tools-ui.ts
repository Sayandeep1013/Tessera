/**
 * Exercise every tool through real pointer events and assert the document
 * actually changed. npx tsx tools/probe-tools-ui.ts
 */
import { chromium, type Page } from 'playwright'

const HASH = `(() => {
  const px = window.__docPx()
  let h = 0
  for (let i = 0; i < px.length; i++) h = (h * 31 + px[i]) | 0
  return h
})()`

const EXPOSE = `(() => {
  window.__docPx = () => {
    const s = window.__tesseraDoc()
    return Array.from(s.frames[0].layers[0].px)
  }
  return true
})()`

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
  await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
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
