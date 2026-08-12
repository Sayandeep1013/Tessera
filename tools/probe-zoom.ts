/**
 * Measure the zoom gesture before changing it.
 *
 *   APP_URL=http://localhost:3100 npx tsx tools/probe-zoom.ts
 *
 * The report says "zoom is janky, like it's stuttering". That is a perception,
 * and there are at least three different faults that produce it: a scale ladder
 * that dead-zones so several notches do nothing and then one lurches, offsets
 * that land on fractional pixels so the artwork shimmers as it grows, and a
 * redraw that runs more than once per frame. This tells them apart by recording
 * the viewport after every single wheel event of a real gesture.
 *
 * Read-only, through the development-only window.__tessera hook.
 */

import { chromium, type Page } from 'playwright'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const VP = `window.__tessera.viewport()`

type Viewport = { scale: number; offsetX: number; offsetY: number }

const frac = (n: number) => Math.abs(n - Math.round(n)) > 1e-9

async function gesture(p: Page, deltaY: number, notches: number, label: string) {
  const box = (await p.locator('canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await p.mouse.move(cx, cy)

  const seen: Viewport[] = [(await p.evaluate(VP)) as Viewport]
  for (let i = 0; i < notches; i++) {
    // ctrlKey is what the app uses to tell a pinch from a scroll.
    await p.keyboard.down('Control')
    await p.mouse.wheel(0, deltaY)
    await p.keyboard.up('Control')
    await p.waitForTimeout(30)
    seen.push((await p.evaluate(VP)) as Viewport)
  }

  const scales = seen.map((v) => v.scale)
  const fractional = seen.filter((v) => frac(v.offsetX) || frac(v.offsetY))

  // A "dead notch" is a wheel event that moved the scale not at all. A few are
  // expected with integer scales; a run of them is the lurch.
  let deadRun = 0
  let worstRun = 0
  for (let i = 1; i < scales.length; i++) {
    if (scales[i] === scales[i - 1]) worstRun = Math.max(worstRun, ++deadRun)
    else deadRun = 0
  }

  // Biggest single proportional jump — what actually reads as a lurch.
  let worstJump = 0
  for (let i = 1; i < scales.length; i++) {
    const a = scales[i - 1]!
    const b = scales[i]!
    if (b !== a) worstJump = Math.max(worstJump, Math.abs(b - a) / a)
  }

  console.log(`\n── ${label} ──`)
  console.log(`  scales          ${scales.join(' → ')}`)
  console.log(`  longest dead run ${worstRun} notch${worstRun === 1 ? '' : 'es'} with no change`)
  console.log(`  biggest jump     ${(worstJump * 100).toFixed(0)}%`)
  console.log(`  fractional offsets ${fractional.length} of ${seen.length}`)
  if (fractional.length) {
    const f = fractional[0]!
    console.log(`    e.g. scale ${f.scale} at offset ${f.offsetX}, ${f.offsetY}`)
  }
  return { worstRun, worstJump, fractional: fractional.length }
}

/**
 * The zoom bar's − and + are the obvious thing to click, and they do not use
 * the continuous path the wheel uses — they step the ZOOM_LADDER. fitViewport
 * hands out arbitrary integers (23, 46), so the interesting question is what a
 * click does when the current scale is not on the ladder at all.
 */
async function buttons(p: Page) {
  const minus = p.getByRole('button', { name: 'Zoom out' })
  const plus = p.getByRole('button', { name: 'Zoom in' })

  const walk = async (b: typeof minus, n: number, label: string) => {
    const seen: number[] = [((await p.evaluate(VP)) as Viewport).scale]
    for (let i = 0; i < n; i++) {
      await b.click()
      await p.waitForTimeout(80)
      seen.push(((await p.evaluate(VP)) as Viewport).scale)
    }
    let worst = 0
    for (let i = 1; i < seen.length; i++) {
      const a = seen[i - 1]!
      const c = seen[i]!
      if (c !== a) worst = Math.max(worst, Math.abs(c - a) / a)
    }
    console.log(`\n── ${label} ──`)
    console.log(`  scales       ${seen.join(' → ')}`)
    console.log(`  biggest jump ${(worst * 100).toFixed(0)}%`)
    return worst
  }

  await walk(minus, 6, 'clicking − from the fitted scale')
  await walk(plus, 6, 'clicking + back up')
}

/**
 * "Stutter" is a timing word, so measure time. Record every frame interval
 * across a fast gesture and count the ones that missed the 60fps budget.
 *
 * The strings passed to evaluate are plain string IIFEs on purpose — tsx's
 * keepNames injects a __name helper that does not exist in the browser, and a
 * bare arrow function serialises to undefined. See docs/HANDOFF.md §5.
 */
async function frameTiming(p: Page) {
  await p.evaluate(`(() => {
    const w = window;
    w.__frames = [];
    let last = performance.now();
    const tick = (now) => { w.__frames.push(now - last); last = now; w.__raf = requestAnimationFrame(tick); };
    w.__raf = requestAnimationFrame(tick);
  })()`)

  const box = (await p.locator('canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await p.mouse.move(cx, cy)

  // A fast continuous gesture, the way a trackpad actually delivers one.
  for (let i = 0; i < 60; i++) {
    await p.keyboard.down('Control')
    await p.mouse.wheel(0, i % 2 ? 14 : -14)
    await p.keyboard.up('Control')
  }
  await p.waitForTimeout(500)

  const frames = (await p.evaluate(`(() => {
    cancelAnimationFrame(window.__raf);
    return window.__frames;
  })()`)) as number[]

  const body = frames.slice(2)
  const long = body.filter((f) => f > 20)
  const worst = body.length ? Math.max(...body) : 0
  const median = body.length ? [...body].sort((a, b) => a - b)[Math.floor(body.length / 2)]! : 0

  console.log('\n── frame timing during a fast zoom gesture ──')
  console.log(`  frames            ${body.length}`)
  console.log(`  median interval   ${median.toFixed(1)}ms`)
  console.log(`  over 20ms         ${long.length} (${((long.length / body.length) * 100).toFixed(0)}%)`)
  console.log(`  worst interval    ${worst.toFixed(1)}ms`)
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.goto(APP, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)

  // A known starting point, and one with enough pixels that low scales matter.
  // Two clicks since B1 — the starters live in an Examples submenu.
  await p.getByRole('button', { name: 'File — new, open, export' }).click()
  await p.locator('#file-examples').click()
  await p.locator('#file-example-face').click()
  await p.waitForTimeout(600)

  const start = (await p.evaluate(VP)) as Viewport
  console.log(`start: scale ${start.scale}, offset ${start.offsetX}, ${start.offsetY}`)

  const out = await gesture(p, 120, 14, 'zoom OUT, trackpad-sized notches')
  const back = await gesture(p, -120, 14, 'zoom IN, trackpad-sized notches')
  const fine = await gesture(p, 8, 20, 'zoom out, fine trackpad deltas')

  await buttons(p)
  await frameTiming(p)

  console.log('\n── verdict ──')
  const worstDead = Math.max(out.worstRun, back.worstRun, fine.worstRun)
  const worstJump = Math.max(out.worstJump, back.worstJump, fine.worstJump)
  const anyFrac = out.fractional + back.fractional + fine.fractional
  console.log(`  worst dead run     ${worstDead}`)
  console.log(`  worst single jump  ${(worstJump * 100).toFixed(0)}%`)
  console.log(`  fractional offsets ${anyFrac}`)

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
