/**
 * Drive the Canvas tab's size control with real clicks and assert the document.
 * See docs/specs/16-settings.md §4 and docs/UNITS.md A2 "Done when".
 *
 *   npx tsx tools/probe-canvas-size.ts
 *
 * The maths behind this unit has 19 tests and the panel's decisions have 26 more,
 * and neither can catch the thing most likely to be wrong: the wiring. A preset
 * that writes the wrong field, an apply button reading the current size while
 * committing the pending one, a resize that never refits the view. Those are all
 * correct in a unit test and wrong on screen.
 *
 * Reads the document through the development-only `window.__tessera` hook.
 * Read-only — commit() is still the only writer.
 */

import { chromium, type Page } from 'playwright'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'
const SIZE = `window.__tessera.size()`
const LAYERS = `window.__tessera.layers()`

type ProbeLayer = { n: string; hidden: boolean; px: number[] }

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

const size = (p: Page) => p.evaluate(SIZE) as Promise<{ w: number; h: number }>
const layers = (p: Page) => p.evaluate(LAYERS) as Promise<ProbeLayer[]>

/** Every painted cell of layer 0, as document coordinates. */
async function painted(p: Page): Promise<Array<[number, number]>> {
  const { w } = await size(p)
  const px = (await layers(p))[0]!.px
  const out: Array<[number, number]> = []
  px.forEach((v, i) => v !== 0 && out.push([i % w, Math.floor(i / w)]))
  return out
}

const apply = (p: Page) => p.locator('#canvas-size-apply')
const note = (p: Page) => p.locator('#canvas-size-note')
const preset = (p: Page, label: string) =>
  p.getByRole('group', { name: 'Size presets' }).getByRole('button', { name: label, exact: true })

async function openCanvasTab(p: Page) {
  if ((await p.getByRole('dialog', { name: 'Settings' }).count()) === 0) {
    await p.getByRole('button', { name: 'Settings' }).click()
    await p.waitForTimeout(200)
  }
  await p.getByRole('radio', { name: 'Canvas' }).click()
  await p.waitForTimeout(150)
}

/** One brush click at the centre of the artwork. See HANDOFF §5 on coordinates. */
async function dotAtCentre(p: Page) {
  const box = await p.locator('canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await p.waitForTimeout(300)
}

async function run(p: Page, theme: string) {
  // ── the control's own states, before anything is committed ────────────────
  await openCanvasTab(p)
  await p.screenshot({ path: join(OUT, `probe-canvas-size-${theme}.png`) })

  check(`${theme}: opens at the document's size`, (await apply(p).textContent()) === '32×32')
  check(`${theme}: apply is disabled at the current size`, await apply(p).isDisabled())
  check(`${theme}: the matching preset is selected`,
    (await preset(p, '32').getAttribute('aria-pressed')) === 'true')

  await preset(p, '64').click()
  check(`${theme}: a preset fills both fields`,
    (await p.getByLabel('Width').inputValue()) === '64' &&
    (await p.getByLabel('Height').inputValue()) === '64')
  check(`${theme}: apply now offers the pending size`, (await apply(p).textContent()) === '64×64')
  check(`${theme}: and is enabled`, await apply(p).isEnabled())
  check(`${theme}: the old preset is deselected`,
    (await preset(p, '32').getAttribute('aria-pressed')) === 'false')
  check(`${theme}: nothing has resized yet`, (await size(p)).w === 32)

  await preset(p, '16:9').click()
  check(`${theme}: an aspect preset is not square`, (await apply(p).textContent()) === '64×36')

  await p.getByLabel('Width').fill('20')
  check(`${theme}: typing selects Custom`,
    (await preset(p, 'Custom').getAttribute('aria-pressed')) === 'true')
  check(`${theme}: and only the field typed in changed`, (await apply(p).textContent()) === '20×36')

  // S-E1 — out of range is refused, with the reason on screen.
  await p.getByLabel('Width').fill('512')
  check(`${theme}: out of range disables apply`, await apply(p).isDisabled())
  check(`${theme}: and says why (S-E1)`,
    ((await note(p).textContent()) ?? '').includes('1 to 256'))

  // A blank field is not an error, so it must not be shouted at.
  await p.getByLabel('Width').fill('')
  check(`${theme}: a blank field disables apply`, await apply(p).isDisabled())
  check(`${theme}: without accusing anyone`,
    ((await note(p).textContent()) ?? '').includes('Keeps the art centred'))

  // ── centring: a dot in the middle of 16x16 is in the middle of 32x32 ──────
  await preset(p, '16').click()
  await apply(p).click()
  await p.waitForTimeout(400)
  check(`${theme}: apply resizes the document`, JSON.stringify(await size(p)) === '{"w":16,"h":16}')
  check(`${theme}: apply disables itself once applied`, await apply(p).isDisabled())
  check(`${theme}: and re-reads the new current size`, (await apply(p).textContent()) === '16×16')

  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
  await dotAtCentre(p)
  const before = await painted(p)
  check(`${theme}: painted one cell to track`, before.length === 1, JSON.stringify(before))

  await openCanvasTab(p)
  await preset(p, '32').click()
  check(`${theme}: growing costs nothing, so no warning`,
    ((await note(p).textContent()) ?? '').includes('Keeps the art centred'))
  await apply(p).click()
  await p.waitForTimeout(400)

  const after = await painted(p)
  const [bx, by] = before[0] ?? [-1, -1]
  const [ax, ay] = after[0] ?? [-9, -9]
  check(`${theme}: 16→32 keeps the dot centred`, ax === bx + 8 && ay === by + 8,
    `was ${bx},${by} now ${ax},${ay}`)
  check(`${theme}: and does not duplicate or lose it`, after.length === 1)
  await p.screenshot({ path: join(OUT, `probe-canvas-size-${theme}-grown.png`) })

  // ── cropping: the count is promised before it happens, and it is right ────
  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
  const box = await p.locator('canvas').boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await p.mouse.move(cx - 200, cy - 200)
    await p.mouse.down()
    await p.mouse.move(cx + 200, cy + 200, { steps: 24 })
    await p.mouse.up()
    await p.waitForTimeout(400)
  }
  const full = await painted(p)
  check(`${theme}: drew a stroke that reaches the edges`, full.length > 8, String(full.length))

  await openCanvasTab(p)
  await p.getByLabel('Width').fill('8')
  await p.getByLabel('Height').fill('8')
  const warning = (await note(p).textContent()) ?? ''
  const promised = Number(/(\d+) painted pixels/.exec(warning)?.[1] ?? -1)
  check(`${theme}: a crop says how many pixels it costs (S-E2)`, promised > 0, warning)
  check(`${theme}: and says undo brings them back`, warning.includes('Undo'))
  check(`${theme}: a crop is still allowed`, await apply(p).isEnabled())
  await p.screenshot({ path: join(OUT, `probe-canvas-size-${theme}-crop.png`) })

  await apply(p).click()
  await p.waitForTimeout(400)
  const kept = await painted(p)
  check(`${theme}: the promised count is the real count`, full.length - kept.length === promised,
    `${full.length} - ${kept.length} != ${promised}`)

  // ── undo restores the cropped artwork exactly ─────────────────────────────
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(400)
  const undone = await painted(p)
  check(`${theme}: undo restores the size`, JSON.stringify(await size(p)) === '{"w":32,"h":32}')
  check(`${theme}: undo restores every cropped pixel`,
    JSON.stringify(undone) === JSON.stringify(full),
    `${undone.length} of ${full.length}`)
  check(`${theme}: the panel follows the document back`, (await apply(p).textContent()) === '32×32')
  check(`${theme}: so apply has nothing to do again`, await apply(p).isDisabled())

  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
  check(`${theme}: Escape closes the panel`,
    (await p.getByRole('dialog', { name: 'Settings' }).count()) === 0)
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

  // The Settings button is not withheld on a phone, so the tab has to fit one.
  for (const [name, width, height] of [['mobile', 390, 844], ['narrow', 320, 568]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)
    await openCanvasTab(p)
    await p.screenshot({ path: join(OUT, `probe-canvas-size-${name}.png`) })

    const panel = await p.getByRole('dialog', { name: 'Settings' }).boundingBox()
    check(`${name}: the panel is fully on screen`,
      !!panel && panel.x >= 0 && panel.x + panel.width <= width && panel.y + panel.height <= height,
      JSON.stringify(panel))
    const btn = await preset(p, 'Portrait').boundingBox()
    check(`${name}: the preset grid is usable`, !!btn && btn.width >= 44 && btn.height >= 24,
      JSON.stringify(btn))
    await ctx.close()
  }

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : `\n${results.length} checks, canvas size behaves`)
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
