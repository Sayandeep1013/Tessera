/**
 * Are cell edges landing on whole device pixels?
 *
 *   APP_URL=http://localhost:3100 npx tsx tools/probe-crisp.ts
 *
 * Reported: "when i turn the grid off the horizontal lines are still visible ..
 * is it somekind of render issue". The grid pass is genuinely skipped when
 * showGrid is false, so if lines remain they are seams, not the grid.
 *
 * The suspect is a fractional device pixel ratio. Windows at 125% or 150%
 * display scaling reports devicePixelRatio 1.25 or 1.5, and resizeCanvas passes
 * that straight into setTransform. A cell boundary at an odd CSS pixel then
 * lands on a half device pixel and the browser antialiases it — one faint line
 * per row, at every row, looking exactly like a grid that will not turn off.
 *
 * This fills the artwork with a single colour, turns the grid off, and counts
 * the distinct colours down a column through the middle. One flat fill should
 * be ONE colour. Anything more is a seam.
 */

import { chromium, type Page } from 'playwright'

const APP = process.env.APP_URL ?? 'http://localhost:3000'

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

/** Distinct colours down a vertical line through the artwork, read off the
 *  canvas backing store rather than a screenshot so DPR is not resampled. */
const SAMPLE = `(() => {
  const c = document.querySelector('canvas');
  const ctx = c.getContext('2d');
  const x = Math.round(c.width / 2);
  const y0 = Math.round(c.height * 0.35);
  const y1 = Math.round(c.height * 0.65);
  const seen = new Map();
  for (let y = y0; y < y1; y++) {
    const d = ctx.getImageData(x, y, 1, 1).data;
    if (d[3] === 0) continue;
    const k = d[0] + ',' + d[1] + ',' + d[2];
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]);
})()`

async function measure(p: Page, label: string) {
  await p.goto(APP, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1800)

  // A single flat fill across the whole canvas: any variation after this is
  // the renderer's, not the artwork's.
  await p.getByRole('button', { name: 'Fill (G)' }).click()
  await p.waitForTimeout(120)
  const box = (await p.locator('canvas').boundingBox())!
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await p.waitForTimeout(300)

  // Grid off.
  await p.keyboard.press('g')
  await p.waitForTimeout(300)

  // The brush cursor is drawn in --accent wherever the pointer is, and it lands
  // in the sample column otherwise — two colours that are not a seam. Park the
  // pointer outside the artwork so what is left is only the renderer's doing.
  await p.mouse.move(4, 4)
  await p.waitForTimeout(300)

  const colours = (await p.evaluate(SAMPLE)) as Array<[string, number]>
  const total = colours.reduce((n, [, c]) => n + c, 0)
  const dominant = colours[0]?.[1] ?? 0
  const strays = total - dominant

  console.log(`\n── ${label} ──`)
  console.log(`  distinct colours down the column: ${colours.length}`)
  console.log(`  ${colours.slice(0, 4).map(([k, n]) => `${k} x${n}`).join('   ')}`)
  check(
    `${label}: a flat fill is one flat colour with the grid off`,
    colours.length === 1,
    `${colours.length} colours, ${strays} stray rows of ${total}`,
  )
}

async function main() {
  const browser = await chromium.launch()

  // 1.0 and 2.0 are the well-behaved cases. 1.25 and 1.5 are what Windows
  // reports at 125% and 150% display scaling, which is where the report came
  // from.
  for (const dsf of [1, 1.25, 1.5, 2]) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: dsf,
      colorScheme: 'dark',
    })
    const p = await ctx.newPage()
    await measure(p, `dpr ${dsf}`)
    await ctx.close()
  }

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : '\nevery cell edge is on a whole device pixel')
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
