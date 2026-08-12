/**
 * Drive the layer panel with real pointer events and assert the document.
 * See docs/specs/14-layers.md §8.9.
 *
 *   npx tsx tools/probe-layers.ts
 *
 * The commands behind each control have unit tests. What those cannot cover is
 * the wiring: a Duplicate button that calls the add handler, a rename that
 * commits the old name, a reorder that moves the wrong row because the panel
 * lists layers top-first and the array is bottom-first. That mapping is exactly
 * the kind of thing that is right in a unit test and wrong on screen.
 *
 * Reads the document through the development-only `window.__tessera` hook that
 * app/page.tsx installs. Read-only — commit() is still the only writer.
 */

import { chromium, type Page } from 'playwright'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'
const LAYERS = `window.__tessera.layers()`
const ACTIVE = `window.__tessera.active()`

type ProbeLayer = { n: string; hidden: boolean; px: number[] }

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

const names = (ls: ProbeLayer[]) => ls.map((l) => l.n)
const painted = (l: ProbeLayer) => l.px.filter((v) => v !== 0).length

async function read(p: Page) {
  return (await p.evaluate(LAYERS)) as ProbeLayer[]
}

/** Rows are listed top-first, so row 0 is the LAST array entry. */
function row(p: Page, index: number) {
  return p.locator('[role="dialog"][aria-label="Layers"] > div').nth(1).locator('> div').nth(index)
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

    await p.getByRole('button', { name: 'File — new, open, export' }).click()
    await p.getByRole('menuitem', { name: 'Example — face' }).click()
    await p.waitForTimeout(500)

    await p.getByRole('button', { name: 'Layers' }).click()
    await p.waitForTimeout(300)
    await p.screenshot({ path: join(OUT, `probe-layers-${theme}-open.png`) })

    // ── add, then draw on the new layer ──────────────────────────────────────
    await p.getByRole('button', { name: 'Add', exact: true }).click()
    await p.waitForTimeout(250)
    check(`${theme}: add`, names(await read(p)).join() === 'base,Layer 2')
    check(`${theme}: new layer is active`, (await p.evaluate(ACTIVE)) === 1)

    const box = await p.locator('canvas').boundingBox()
    if (box) {
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      await p.mouse.move(cx - 120, cy - 120)
      await p.mouse.down()
      for (let i = 0; i <= 30; i++) await p.mouse.move(cx - 120 + i * 8, cy - 120 + i * 8)
      await p.mouse.up()
      await p.waitForTimeout(400)
    }
    const drawn = await read(p)
    check(`${theme}: stroke landed on the new layer`, painted(drawn[1]!) > 0)
    const faceBefore = JSON.stringify(drawn[0]!.px)
    await p.screenshot({ path: join(OUT, `probe-layers-${theme}-drawn.png`) })

    // ── rename, by double-clicking the name ──────────────────────────────────
    await row(p, 0).getByRole('button', { name: 'Layer 2', exact: true }).dblclick()
    await p.waitForTimeout(200)
    await p.getByLabel('Layer name').fill('  shadow  pass  ')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(250)
    check(`${theme}: rename trims and collapses whitespace`, names(await read(p))[1] === 'shadow pass')

    // Escape must revert rather than commit.
    await row(p, 0).getByRole('button', { name: 'shadow pass', exact: true }).dblclick()
    await p.waitForTimeout(200)
    await p.getByLabel('Layer name').fill('discard me')
    await p.keyboard.press('Escape')
    await p.waitForTimeout(250)
    check(`${theme}: Escape cancels a rename`, names(await read(p))[1] === 'shadow pass')

    // ── duplicate ────────────────────────────────────────────────────────────
    await p.getByRole('button', { name: 'Copy', exact: true }).click()
    await p.waitForTimeout(250)
    const dup = await read(p)
    check(`${theme}: duplicate names and places the copy`, names(dup).join() === 'base,shadow pass,shadow pass copy')
    check(`${theme}: the copy carries the pixels`, painted(dup[2]!) === painted(dup[1]!) && painted(dup[2]!) > 0)

    // ── reorder ──────────────────────────────────────────────────────────────
    // The copy is active and on top; moving it down must swap it with "shadow pass".
    await p.getByRole('button', { name: 'Move down' }).click()
    await p.waitForTimeout(250)
    check(`${theme}: move down reorders`, names(await read(p)).join() === 'base,shadow pass copy,shadow pass')
    check(`${theme}: selection follows the moved layer`, (await p.evaluate(ACTIVE)) === 1)

    await p.getByRole('button', { name: 'Move up' }).click()
    await p.waitForTimeout(250)
    check(`${theme}: move up puts it back`, names(await read(p)).join() === 'base,shadow pass,shadow pass copy')

    // ── hide ─────────────────────────────────────────────────────────────────
    await row(p, 0).getByRole('button', { name: /^Hide / }).click()
    await p.waitForTimeout(250)
    const hidden = await read(p)
    check(`${theme}: hide flags the layer without erasing it`, hidden[2]!.hidden && painted(hidden[2]!) > 0)
    check(`${theme}: hiding leaves the base layer alone`, JSON.stringify(hidden[0]!.px) === faceBefore)
    await p.screenshot({ path: join(OUT, `probe-layers-${theme}-hidden.png`) })

    // Drawing on a hidden layer reveals it first (L-E8).
    //
    // These have to be artwork-relative, not element-relative: the canvas fills
    // the whole area below the header and the artwork is centred inside it, so
    // a drag near the element's corner lands outside the document and
    // onPointerDown returns at its isInside guard before reaching the reveal.
    if (box) {
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      await p.mouse.move(cx - 40, cy - 40)
      await p.mouse.down()
      await p.mouse.move(cx + 40, cy + 40, { steps: 6 })
      await p.mouse.up()
      await p.waitForTimeout(400)
    }
    check(`${theme}: drawing on a hidden layer reveals it (L-E8)`, !(await read(p))[2]!.hidden)

    // ── delete, and undo it ──────────────────────────────────────────────────
    const beforeDelete = await read(p)
    await p.getByRole('button', { name: 'Delete', exact: true }).click()
    await p.waitForTimeout(250)
    check(`${theme}: delete removes the active layer`, (await read(p)).length === beforeDelete.length - 1)

    await p.keyboard.press('Control+z')
    await p.waitForTimeout(350)
    const restored = await read(p)
    check(
      `${theme}: undo restores it with its pixels`,
      restored.length === beforeDelete.length &&
        painted(restored[2]!) === painted(beforeDelete[2]!),
    )
    check(`${theme}: the base layer never moved`, JSON.stringify(restored[0]!.px) === faceBefore)

    // ── delete down to one, then the control must be disabled ────────────────
    await p.getByRole('button', { name: 'Delete', exact: true }).click()
    await p.waitForTimeout(200)
    await p.getByRole('button', { name: 'Delete', exact: true }).click()
    await p.waitForTimeout(200)
    check(`${theme}: cannot delete the last layer`, (await read(p)).length === 1)
    check(
      `${theme}: Delete is disabled at one layer`,
      await p.getByRole('button', { name: 'Delete', exact: true }).isDisabled(),
    )

    // Escape closes the panel.
    await p.keyboard.press('Escape')
    await p.waitForTimeout(200)
    check(`${theme}: Escape closes the panel`, (await p.getByRole('dialog', { name: 'Layers' }).count()) === 0)

    check(`${theme}: no console errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // tablet placement
  const ctx = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  })
  const p = await ctx.newPage()
  await p.goto(APP, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  await p.getByRole('button', { name: 'Layers' }).click()
  await p.waitForTimeout(300)
  await p.screenshot({ path: join(OUT, 'probe-layers-tablet.png') })
  check('tablet: panel is on screen', await p.getByRole('dialog', { name: 'Layers' }).isVisible())

  // mobile withholds it entirely
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const m = await mob.newPage()
  await m.goto(APP, { waitUntil: 'networkidle' })
  await m.waitForTimeout(2000)
  check('mobile: the Layers button is withheld', (await m.getByRole('button', { name: 'Layers' }).count()) === 0)

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : '\nlayer panel behaves')
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
