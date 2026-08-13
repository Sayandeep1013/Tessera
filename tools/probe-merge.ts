/**
 * Opacity, blend mode, merge down, flatten, and drag reorder — the layer panel
 * controls unit E added. See docs/specs/14-layers.md §12.9.
 *
 *   npx tsx tools/probe-merge.ts
 *
 * Kept separate from tools/probe-layers.ts (rather than extended) because its
 * one distinctive check — sampling the REAL rendered canvas pixel and
 * comparing it to `compositeStack`'s prediction — needs a fresh, precisely
 * two-layer document, not the heavily-mutated state probe-layers builds up
 * across its own add/rename/duplicate/reorder/delete sequence.
 */

import { chromium, type Page } from 'playwright'
import { join } from 'node:path'
import { compositeStack } from '../lib/artwork-core/blend'
import type { Doc, Layer } from '../lib/artwork-core/schema'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'

type ProbeLayer = Layer & { hidden: boolean }

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

async function readLayers(p: Page): Promise<ProbeLayer[]> {
  const raw = (await p.evaluate('window.__tessera.layers()')) as Array<
    { n: string; hidden: boolean; o: number; mode: string; px: number[] }
  >
  return raw.map((l) => ({ n: l.n, hidden: l.hidden, o: l.o, mode: l.mode as Layer['mode'], px: Uint8Array.from(l.px) }))
}

/** Sample the real rendered canvas at one document pixel, in the backing
 *  store (not a screenshot) so DPR is not resampled — same technique as
 *  tools/probe-crisp.ts. */
async function samplePixel(p: Page, x: number, y: number) {
  return p.evaluate(
    `(() => {
      const vp = window.__tessera.viewport();
      const dpr = window.devicePixelRatio || 1;
      const c = document.querySelector('canvas');
      const ctx = c.getContext('2d');
      const bx = Math.round((Math.round(vp.offsetX) + ${x} * vp.scale + vp.scale / 2) * dpr);
      const by = Math.round((Math.round(vp.offsetY) + ${y} * vp.scale + vp.scale / 2) * dpr);
      const d = ctx.getImageData(bx, by, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    })()`,
  ) as Promise<{ r: number; g: number; b: number; a: number }>
}

async function pickColor(p: Page, name: string) {
  await p.getByRole('button', { name: 'Colour' }).click()
  await p.waitForTimeout(120)
  await p.getByRole('button', { name, exact: true }).click()
  await p.waitForTimeout(120)
}

async function clickDocPixel(p: Page, x: number, y: number) {
  const vp = (await p.evaluate('window.__tessera.viewport()')) as { scale: number; offsetX: number; offsetY: number }
  const box = (await p.locator('canvas').boundingBox())!
  await p.mouse.click(box.x + vp.offsetX + x * vp.scale + vp.scale / 2, box.y + vp.offsetY + y * vp.scale + vp.scale / 2)
  await p.waitForTimeout(150)
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
    await p.waitForTimeout(1500)

    await p.getByRole('button', { name: 'Layers' }).click()
    await p.waitForTimeout(300)

    // ── two overlapping layers, distinct colours, same pixel ─────────────────
    const AT = { x: 5, y: 5 }
    await pickColor(p, 'ink')
    await clickDocPixel(p, AT.x, AT.y)

    await p.getByRole('button', { name: 'Add', exact: true }).click()
    await p.waitForTimeout(200)
    await pickColor(p, 'plum')
    await clickDocPixel(p, AT.x, AT.y)

    let layers = await readLayers(p)
    check('two layers painted the same pixel with different colours', layers[0]!.px[5 * 32 + 5] !== 0 && layers[1]!.px[5 * 32 + 5] !== 0)

    // ── opacity: drag-shaped input commits once, not per input event ─────────
    await p.evaluate(
      `(() => {
        // React shadows the native 'value' setter to track controlled-input
        // changes, so a plain 'el.value = x' is invisible to it — the native
        // prototype's setter is required for the dispatched 'input' event to
        // register as a real change. Standard workaround for driving a React
        // range input from outside React.
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const el = document.querySelector('[aria-label="Layer opacity"]');
        el.focus();
        for (const v of [90, 80, 70, 60, 50]) {
          setter.call(el, String(v));
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.blur();
      })()`,
    )
    await p.waitForTimeout(200)
    layers = await readLayers(p)
    check(`${theme}: opacity commits to the final value`, layers[1]!.o === 50, `got ${layers[1]!.o}`)

    await p.keyboard.press('Control+z')
    await p.waitForTimeout(250)
    layers = await readLayers(p)
    check(
      `${theme}: one undo fully reverts a multi-event drag (proves it was ONE commit, not five)`,
      layers[1]!.o === 100,
      `got ${layers[1]!.o}`,
    )
    // Redo it for the rest of the run.
    await p.keyboard.press('Control+y')
    await p.waitForTimeout(200)
    if ((await readLayers(p))[1]!.o !== 50) {
      // Some platforms bind redo to Shift+Ctrl+Z instead.
      await p.keyboard.press('Control+Shift+z')
      await p.waitForTimeout(200)
    }

    // ── blend mode ─────────────────────────────────────────────────────────
    await p.locator('[aria-label="Layer blend mode"]').selectOption('multiply')
    await p.waitForTimeout(200)
    layers = await readLayers(p)
    check(`${theme}: blend mode commits on change`, layers[1]!.mode === 'multiply')

    await p.screenshot({ path: join(OUT, `probe-merge-${theme}-controls.png`) })

    // ── cross-check: the real rendered pixel matches compositeStack's math ───
    const rendered = await samplePixel(p, AT.x, AT.y)
    const paletteColors = (await p.evaluate('window.__tessera.palette()')) as string[]
    const fullDoc = { w: 32, h: 32, palette: paletteColors.map((c) => ({ c })) } as Doc
    const predicted = compositeStack(fullDoc, layers)
    const idx = (AT.y * 32 + AT.x) * 4
    const p_ = { r: predicted.data[idx], g: predicted.data[idx + 1], b: predicted.data[idx + 2], a: predicted.data[idx + 3] }
    const close = (a: number, b: number) => Math.abs(a - b) <= 2 // rounding slack between the two implementations
    check(
      `${theme}: the rendered canvas pixel matches compositeStack's prediction`,
      close(rendered.r, p_.r!) && close(rendered.g, p_.g!) && close(rendered.b, p_.b!),
      `rendered ${JSON.stringify(rendered)} vs predicted ${JSON.stringify(p_)}`,
    )

    // ── drag reorder: one layer_move, both display and array order correct ───
    // Add a third layer so a middle-position drag is unambiguous.
    await p.getByRole('button', { name: 'Add', exact: true }).click()
    await p.waitForTimeout(200)
    const beforeDrag = await readLayers(p)
    const names0 = beforeDrag.map((l) => l.n)

    // Drag the TOP row (display index 0, the new top layer) down past the
    // next row — the grip is the first button in a row.
    const rowList = p.locator('[role="dialog"][aria-label="Layers"] > div').nth(1)
    const firstGrip = rowList.locator('> div').nth(0).getByRole('button', { name: /^Reorder/ })
    const secondRow = rowList.locator('> div').nth(1)
    const gripBox = (await firstGrip.boundingBox())!
    const targetBox = (await secondRow.boundingBox())!
    await p.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
    await p.mouse.down()
    // Just above the second row's midpoint — lands the drop target at display
    // index 1 unambiguously (a landing past its midpoint would target index 2).
    await p.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 4, { steps: 6 })
    await p.mouse.up()
    await p.waitForTimeout(250)
    const afterDrag = await readLayers(p)
    check(
      `${theme}: dragging the top row past the next one swaps them`,
      afterDrag.map((l) => l.n).join() !== names0.join() && afterDrag.length === beforeDrag.length,
      `${names0.join()} -> ${afterDrag.map((l) => l.n).join()}`,
    )
    await p.keyboard.press('Control+z')
    await p.waitForTimeout(250)
    check(
      `${theme}: one undo reverts the whole drag`,
      (await readLayers(p)).map((l) => l.n).join() === names0.join(),
    )

    // ── merge down ────────────────────────────────────────────────────────
    // Undo restores the document but not the active-layer selection (it is
    // UI state, not history) — select a layer that is not the bottom one so
    // Merge down is enabled, deterministically, rather than assuming.
    await rowList.locator('> div').nth(0).getByRole('button').nth(2).click()
    await p.waitForTimeout(150)
    const beforeMerge = await readLayers(p)
    const n = beforeMerge.length
    await p.getByRole('button', { name: 'Merge down' }).click()
    await p.waitForTimeout(300)
    const afterMerge = await readLayers(p)
    check(`${theme}: merge down removes exactly one layer`, afterMerge.length === n - 1)
    check(`${theme}: merge down reports a notice`, await p.getByRole('status').isVisible().catch(() => false))
    await p.screenshot({ path: join(OUT, `probe-merge-${theme}-merged.png`) })

    await p.keyboard.press('Control+z')
    await p.waitForTimeout(300)
    check(`${theme}: undoing a merge restores the layer count`, (await readLayers(p)).length === n)

    // ── flatten ───────────────────────────────────────────────────────────
    await p.getByRole('button', { name: 'Flatten' }).click()
    await p.waitForTimeout(300)
    check(`${theme}: flatten collapses to one layer`, (await readLayers(p)).length === 1)
    await p.keyboard.press('Control+z')
    await p.waitForTimeout(300)
    check(`${theme}: undoing a flatten restores every layer`, (await readLayers(p)).length === n)

    check(`${theme}: no console errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : '\nopacity, blend, merge, flatten and drag all behave')
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
