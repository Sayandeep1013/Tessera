/**
 * The agent panel's geometry and its outcome wording.
 *
 *   AI_PROVIDER=mock APP_URL=http://localhost:3100 npx tsx tools/probe-agent-ui.ts
 *
 * See docs/specs/15-feedback-and-input.md §7.2 and §7.4. Two reported faults
 * live here and neither is visible to a unit test:
 *
 *   - "while the ai was working the size of the ai box got bigger and it
 *     overlapping with the left toolbar". A rectangle intersection is the only
 *     honest check for that; a screenshot needs a human and a max-height needs
 *     the rail's real measured box to mean anything.
 *   - "told ai to draw a smily face .. no changes were made .. as if the ai
 *     didnt work". The panel must say so itself rather than repeating whatever
 *     the model claimed.
 *
 * Wants the mock provider, so it costs no quota and the outcomes are chosen
 * rather than hoped for.
 */

import { chromium, type Page } from 'playwright'

const APP = process.env.APP_URL ?? 'http://localhost:3000'

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

type Box = { x: number; y: number; width: number; height: number }

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * Driven through the real mock provider rather than by poking the store. The
 * dev hook in app/page.tsx is deliberately read-only — commit() stays the only
 * writer — and a probe is not a good enough reason to add a setter to it. The
 * mock's tokens make each outcome reproducible without spending quota:
 *
 *   __agent_runaway  20 steps, which fills the log
 *   __agent_prose    the model answers in prose and calls nothing — the
 *                    reported "it said it worked and nothing changed"
 *   (anything else)  the default script, which really does edit pixels
 */
async function run(p: Page, instruction: string) {
  await p.getByLabel('Tell the agent what to do').fill(instruction)
  await p.getByRole('button', { name: 'Send' }).click()
}

const panelOf = (p: Page) => p.locator('form').locator('xpath=..')

/**
 * Assert the guarantee, not a sample.
 *
 * The first version of this drove __agent_runaway and measured the panel
 * mid-run. The mock provider answers instantly, so twenty steps were over
 * before the first measurement and there was no log element to find. Racing a
 * live run also only ever tests the one height that run happened to reach.
 *
 * What the fix actually promises is a CSS cap: the panel is bottom-anchored, so
 * its highest possible top edge is (its bottom edge - max-height). If THAT
 * clears the rail then no log length can ever reach it, which is the real
 * property and is deterministic to check.
 */
async function geometry(p: Page, label: string) {
  const panel = panelOf(p)
  const box = await panel.boundingBox()
  const rail = await p.getByRole('toolbar', { name: 'Tools' }).boundingBox()
  if (!box || !rail) {
    check(`${label}: found the panel and the rail`, false, 'one of them has no box')
    return
  }

  /**
   * The USED max-height, in pixels.
   *
   * getComputedStyle returns `calc(50% - 206px)` verbatim for a percentage
   * max-height, so parseFloat gives NaN. Setting min-height to force the box
   * open does not work either — min-height beats max-height in the cascade.
   * Appending a very tall child and measuring what the parent settles at reads
   * the resolved cap directly, which is the number the guarantee depends on.
   *
   * A plain string IIFE at page level: tsx's keepNames injects a __name helper
   * the browser does not have, and a string given to evaluate is an expression
   * rather than a function. HANDOFF §5.
   */
  const capPx = (await p.evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Tell the agent what to do"]');
    const form = input && input.closest('form');
    const shell = form && form.parentElement;
    if (!shell) return NaN;
    const spacer = document.createElement('div');
    spacer.style.height = '10000px';
    spacer.style.flex = 'none';
    shell.appendChild(spacer);
    const h = shell.getBoundingClientRect().height;
    spacer.remove();
    return h;
  })()`)) as number
  check(`${label}: the panel has a height cap`, Number.isFinite(capPx), String(capPx))

  const bottomEdge = box.y + box.height
  const worstTop = bottomEdge - capPx
  const railBottom = rail.y + rail.height
  const railTop = rail.y

  // Vertical clearance is the whole question: they share the left column, so
  // horizontal overlap is a given by design.
  const clears = worstTop >= railBottom - 0.5 || bottomEdge <= railTop + 0.5
  check(
    `${label}: a full log can never reach the tool rail`,
    clears,
    `panel can grow to ${Math.round(worstTop)}, rail spans ${Math.round(railTop)}..${Math.round(railBottom)}`,
  )

  // And the composer stays reachable at the panel's tallest.
  const vp = p.viewportSize()!
  check(`${label}: the panel stays on screen at full height`, worstTop >= 0,
    `worst top ${Math.round(worstTop)} of ${vp.height}`)
}

async function main() {
  const browser = await chromium.launch()

  for (const size of [
    { w: 1440, h: 900, name: 'wide' },
    { w: 1024, h: 768, name: 'compact' },
    { w: 768, h: 1024, name: 'tablet' },
    { w: 320, h: 568, name: 'mobile' },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } })
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(1500)
    await geometry(p, `${size.name} ${size.w}x${size.h}`)
    await ctx.close()
  }

  // ── the outcome wording ────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(APP, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)

  await run(p, '__agent_prose')
  await p.getByText(/no changes were made/i).waitFor({ timeout: 15_000 }).catch(() => {})
  const noop = (await panelOf(p).innerText()).replace(/\s+/g, ' ')
  check('a run that changed nothing says so', /no changes were made/i.test(noop), noop.slice(0, 120))
  check("the model's claim is not the headline",
    !/^\s*that artwork already looks/i.test(noop), noop.slice(0, 80))
  check("the model's words are still shown", /already looks the way/i.test(noop))
  check('no Undo all when there is nothing to undo',
    (await p.getByRole('button', { name: 'Undo all' }).count()) === 0)

  // A fresh context: two free sessions per browser, and one is spent above.
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p2 = await ctx2.newPage()
  await p2.goto(APP, { waitUntil: 'networkidle' })
  await p2.waitForTimeout(1500)
  await run(p2, 'draw something')
  await p2.getByText(/pixels? changed/i).waitFor({ timeout: 20_000 }).catch(() => {})
  const real = (await panelOf(p2).innerText()).replace(/\s+/g, ' ')
  check('a real edit reports its pixel count', /\d+ pixels? changed/i.test(real), real.slice(0, 120))
  check('Undo all is offered after a real edit',
    (await p2.getByRole('button', { name: 'Undo all' }).count()) === 1)

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : '\nagent panel behaves')
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
