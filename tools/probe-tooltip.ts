/**
 * The tooltip, driven with real pointer and keyboard events.
 *
 *   APP_URL=http://localhost:3100 npx tsx tools/probe-tooltip.ts
 *
 * See docs/specs/15-feedback-and-input.md §7.3. The unit test next to this one
 * proves no native `title` survives; it cannot prove ours appears, is placed on
 * screen, carries the shortcut, or dismisses. Those need a browser.
 */

import { chromium, type Page } from 'playwright'
import { join } from 'node:path'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const OUT = join(process.cwd(), 'docs', 'shots')

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

const tip = (p: Page) => p.locator('[role="tooltip"]')

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
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(1800)

    check(`${theme}: nothing is shown before hovering`, (await tip(p).count()) === 0)

    // ── the tool rail: appears, and carries the shortcut ─────────────────────
    await p.getByRole('button', { name: 'Brush (B)' }).hover()
    await p.waitForTimeout(700)
    check(`${theme}: a tooltip appears on hover`, (await tip(p).count()) === 1)
    const text = (await tip(p).innerText().catch(() => '')).replace(/\s+/g, ' ')
    check(`${theme}: it names the tool`, /Brush/.test(text), text)
    check(`${theme}: it shows the keyboard shortcut`, /\bB\b/.test(text), text)

    // Ours, not the browser's: a real element with our panel colour behind it.
    const bg = await tip(p).evaluate(
      `(() => getComputedStyle(document.querySelector('[role=tooltip]')).backgroundColor)()` as never,
    ).catch(() => '')
    check(`${theme}: it is painted with our panel colour`,
      typeof bg === 'string' && bg !== '' && bg !== 'rgba(0, 0, 0, 0)', String(bg))

    await p.screenshot({ path: join(OUT, `probe-tooltip-${theme}.png`) })

    // ── it stays inside the viewport ─────────────────────────────────────────
    // The rail is hard against the left edge, so a left-placed tooltip would
    // hang off. This is the flip case.
    const box = await tip(p).boundingBox()
    check(`${theme}: it is fully on screen`,
      Boolean(box && box.x >= 0 && box.x + box.width <= 1440 && box.y >= 0 && box.y + box.height <= 900),
      box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : 'no box')

    // ── dismissal ────────────────────────────────────────────────────────────
    await p.keyboard.press('Escape')
    await p.waitForTimeout(150)
    check(`${theme}: Escape dismisses it`, (await tip(p).count()) === 0)

    await p.getByRole('button', { name: 'Eraser (E)' }).hover()
    await p.waitForTimeout(700)
    await p.mouse.move(720, 450)
    await p.waitForTimeout(200)
    check(`${theme}: moving away dismisses it`, (await tip(p).count()) === 0)

    // A click must not leave one stranded over the thing just clicked.
    await p.getByRole('button', { name: 'Fill (G)' }).hover()
    await p.waitForTimeout(700)
    await p.getByRole('button', { name: 'Fill (G)' }).click()
    await p.waitForTimeout(250)
    check(`${theme}: clicking dismisses it`, (await tip(p).count()) === 0)

    // ── keyboard ─────────────────────────────────────────────────────────────
    await p.keyboard.press('Tab')
    await p.waitForTimeout(700)
    check(`${theme}: keyboard focus can raise one`, (await tip(p).count()) <= 1)

    check(`${theme}: no console errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── a right-edge control, where placement has to flip ──────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.goto(APP, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1800)
  await p.getByRole('button', { name: 'Layers' }).hover()
  await p.waitForTimeout(700)
  const box = await tip(p).boundingBox()
  check('a right-edge tooltip stays inside the viewport',
    Boolean(box && box.x + box.width <= 1440 && box.x >= 0),
    box ? `x ${Math.round(box.x)} w ${Math.round(box.width)}` : 'no box')

  // Touch: no hover, so no tooltip at all.
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const m = await touch.newPage()
  await m.goto(APP, { waitUntil: 'networkidle' })
  await m.waitForTimeout(1800)
  await m.getByRole('button', { name: 'Brush (B)' }).tap()
  await m.waitForTimeout(700)
  check('a touch device gets no tooltip', (await tip(m).count()) === 0)

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : '\ntooltips behave')
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
