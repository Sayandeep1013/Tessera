/**
 * End-to-end check of the AI proposal flow against the running dev server.
 * Types an instruction, submits, waits for the proposal bar, screenshots.
 *
 *   npx tsx tools/shoot-ai.ts
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.argv[2] ?? 'http://localhost:3000'
const OUT = join(process.cwd(), 'docs', 'shots')

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(2000)

  const input = page.getByPlaceholder('Ask AI…', { exact: false })
  await input.click()
  await input.fill('make it angrier')
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, 'ai-1-typed.png') })

  console.log('submitting…')
  await page.keyboard.press('Enter')

  // Wait for the proposal specifically. An empty role="alert" elsewhere on the
  // page will win a Promise.race and lie about the result.
  const proposal = page.getByRole('dialog', { name: 'AI proposal' })
  const alert = page.locator('[role="alert"]').filter({ hasText: /\S/ })
  const started = Date.now()
  try {
    await proposal.waitFor({ state: 'visible', timeout: 60_000 })
  } catch {
    console.log('no proposal within 60s')
  }
  console.log(`settled in ${Date.now() - started}ms`)

  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, 'ai-2-proposal.png') })

  if (await proposal.isVisible().catch(() => false)) {
    console.log('PROPOSAL SHOWN')
    console.log((await proposal.innerText()).split('\n').slice(0, 6).join(' | '))
    // Peek at the before/after toggle, then accept.
    await page.getByRole('radio', { name: 'before' }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'ai-3-before.png') })
    await page.getByRole('radio', { name: 'after' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Accept' }).click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: join(OUT, 'ai-4-accepted.png') })
    console.log('ACCEPTED')

    // One undo must reverse the whole edit.
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, 'ai-5-undone.png') })
    console.log('UNDONE (one keystroke)')
  } else if (await alert.isVisible().catch(() => false)) {
    console.log('ERROR BANNER:', await alert.innerText())
  }

  if (errors.length) {
    console.log(`\n${errors.length} console errors:`)
    for (const e of errors.slice(0, 5)) console.log(`  ! ${e.slice(0, 180)}`)
  } else {
    console.log('\nno console errors')
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
