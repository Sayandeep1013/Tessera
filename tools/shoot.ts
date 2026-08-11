/**
 * Screenshot the running dev server so a change can be verified visually.
 *   npx tsx tools/shoot.ts [url]
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.argv[2] ?? 'http://localhost:3000'
const OUT = join(process.cwd(), 'docs', 'shots')

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()

  for (const theme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: theme,
    })
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: join(OUT, `editor-${theme}.png`) })
    console.log(`${theme}: written${errors.length ? `  (${errors.length} console errors)` : ''}`)
    for (const e of errors.slice(0, 6)) console.log(`   ! ${e.slice(0, 200)}`)
    await ctx.close()
  }

  // A quick interaction pass: draw a stroke, confirm it lands.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(2000)
  const box = await page.locator('canvas').boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx - 60, cy - 60)
    await page.mouse.down()
    for (let i = 0; i <= 24; i++) await page.mouse.move(cx - 60 + i * 5, cy - 60 + i * 5)
    await page.mouse.up()
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, 'editor-drawn.png') })
    console.log('drawn: written')
  }
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
