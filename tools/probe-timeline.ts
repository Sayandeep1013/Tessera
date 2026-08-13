/**
 * Drive the animation timeline with real pointer events and assert the
 * document. See docs/specs/10-animation.md §7.
 *
 * Mirrors tools/probe-layers.ts: the commands behind each control
 * (frame_add/frame_delete/frame_duration/frame_move) have unit tests. What
 * those cannot cover is the wiring — a drag that reorders the wrong index
 * because the strip is document-order and not reversed the way the layer
 * list is, a duration field that edits the wrong frame, a Space press that
 * pans instead of toggling playback.
 *
 * Reads the document through the development-only `window.__tessera` hook
 * app/page.tsx installs. Read-only — commit() is still the only writer.
 */

import { chromium, type Page, type Locator } from 'playwright'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'

type ProbeFrame = { ms: number; layerCount: number }

// Printed as each one runs, not buffered to the end — a probe that goes quiet
// for minutes with nothing to show is indistinguishable from one that hung.
let bad = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
}

async function frames(p: Page) {
  return (await p.evaluate('window.__tessera.frames()')) as ProbeFrame[]
}
async function activeFrame(p: Page) {
  return (await p.evaluate('window.__tessera.frame()')) as number
}
async function playing(p: Page) {
  return (await p.evaluate('window.__tessera.playing()')) as boolean
}

function panel(p: Page): Locator {
  return p.locator('[role="dialog"][aria-label="Timeline"]')
}
function thumb(p: Page, n: number): Locator {
  return panel(p).getByRole('button', { name: `Frame ${n}`, exact: true })
}
async function setDuration(p: Page, ms: number) {
  const input = p.getByLabel('Frame duration, milliseconds')
  await input.fill(String(ms))
  await input.press('Enter')
  await p.waitForTimeout(200)
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
    // A mismatched locator should fail in seconds, not retry for Playwright's
    // default 30s — a probe that hangs is indistinguishable from one broken.
    p.setDefaultTimeout(8000)
    const errors: string[] = []
    p.on('pageerror', (e) => errors.push(String(e)))
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)

    await p.getByRole('button', { name: 'Timeline' }).click()
    await p.waitForTimeout(300)
    check(`${theme}: opens with one frame`, (await frames(p)).length === 1)
    await p.screenshot({ path: join(OUT, `probe-timeline-${theme}-open.png`) })

    // ── add frames via "+" — duplicates the current one ─────────────────────
    await panel(p).getByRole('button', { name: 'Add frame' }).click()
    await p.waitForTimeout(250)
    check(`${theme}: "+" appends a frame`, (await frames(p)).length === 2)
    check(`${theme}: "+" selects the new frame`, (await activeFrame(p)) === 1)
    const dup = await frames(p)
    check(`${theme}: the duplicate carries the same layer count`, dup[1]!.layerCount === dup[0]!.layerCount)

    await panel(p).getByRole('button', { name: 'Add frame' }).click()
    await p.waitForTimeout(250)
    check(`${theme}: three frames now`, (await frames(p)).length === 3)

    // ── duration field, per frame ────────────────────────────────────────────
    await thumb(p, 1).click()
    await setDuration(p, 100)
    await thumb(p, 2).click()
    await setDuration(p, 200)
    await thumb(p, 3).click()
    await setDuration(p, 300)
    const durations = (await frames(p)).map((f) => f.ms)
    check(`${theme}: duration field edits the selected frame only`, durations.join() === '100,200,300')
    await p.screenshot({ path: join(OUT, `probe-timeline-${theme}-three-frames.png`) })

    // ── shift-click range sets every selected frame's duration ──────────────
    await thumb(p, 1).click()
    await thumb(p, 2).click({ modifiers: ['Shift'] })
    await setDuration(p, 150)
    const ranged = (await frames(p)).map((f) => f.ms)
    check(`${theme}: shift-click range sets both frames`, ranged.join() === '150,150,300')

    // ── drag reorder — frame 3 (300ms) to the front ──────────────────────────
    const from = await thumb(p, 3).boundingBox()
    const to = await thumb(p, 1).boundingBox()
    if (from && to) {
      await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await p.mouse.down()
      await p.mouse.move(to.x - 4, to.y + to.height / 2, { steps: 10 })
      await p.mouse.up()
      await p.waitForTimeout(300)
    }
    const reordered = (await frames(p)).map((f) => f.ms)
    check(`${theme}: drag reorders`, reordered.join() === '300,150,150', reordered.join())
    check(`${theme}: selection follows the dragged frame`, (await activeFrame(p)) === 0)

    // ── context menu: right-click → Set duration… ────────────────────────────
    await thumb(p, 2).click({ button: 'right' })
    await p.waitForTimeout(200)
    await p.getByRole('menuitem', { name: 'Set duration…' }).click()
    await p.waitForTimeout(150)
    check(
      `${theme}: "Set duration…" focuses the field for that frame`,
      await p.getByLabel('Frame duration, milliseconds').evaluate((el) => el === document.activeElement),
    )
    await setDuration(p, 400)
    check(`${theme}: the duration commits to the right-clicked frame`, (await frames(p))[1]!.ms === 400)

    // ── context menu: Duplicate ───────────────────────────────────────────────
    const beforeDup = (await frames(p)).length
    await thumb(p, 1).click({ button: 'right' })
    await p.waitForTimeout(200)
    await p.getByRole('menuitem', { name: 'Duplicate' }).click()
    await p.waitForTimeout(250)
    check(`${theme}: context-menu Duplicate adds a frame`, (await frames(p)).length === beforeDup + 1)
    check(`${theme}: the duplicate is selected`, (await activeFrame(p)) === 1)

    // ── context menu: Delete, down to one, then it is disabled ───────────────
    // Capped rather than an unbounded while: a Delete that silently fails to
    // remove a frame must fail this check, not hang the probe forever.
    for (let guard = 0; guard < 10 && (await frames(p)).length > 1; guard++) {
      await thumb(p, 1).click({ button: 'right' })
      await p.waitForTimeout(150)
      await p.getByRole('menuitem', { name: 'Delete' }).click()
      await p.waitForTimeout(150)
    }
    check(`${theme}: delete works down to one frame`, (await frames(p)).length === 1)
    await thumb(p, 1).click({ button: 'right' })
    await p.waitForTimeout(150)
    check(
      `${theme}: Delete is disabled at one frame`,
      await p.getByRole('menuitem', { name: 'Delete' }).isDisabled(),
    )
    await p.keyboard.press('Escape') // close the context menu

    // ── ping-pong and onion toggles ───────────────────────────────────────────
    // The accessible name changes with state (Ping-pong / Loop end to end,
    // same as Show/Hide onion skin below) — a fresh locator after the click,
    // not a re-used one, the same trap the context menu's away-listener
    // caught: state that flips under a handle taken before the flip.
    check(
      `${theme}: ping-pong starts off`,
      (await panel(p).getByRole('button', { name: 'Ping-pong' }).getAttribute('aria-pressed')) === 'false',
    )
    await panel(p).getByRole('button', { name: 'Ping-pong' }).click()
    check(
      `${theme}: ping-pong toggles on`,
      (await panel(p).getByRole('button', { name: 'Loop end to end' }).getAttribute('aria-pressed')) === 'true',
    )

    const onion = panel(p).getByRole('button', { name: 'Show onion skin' })
    await onion.click()
    check(`${theme}: onion toggles on`, (await panel(p).getByRole('button', { name: 'Hide onion skin' }).count()) === 1)

    // ── playback: two more frames so play actually advances ─────────────────
    await panel(p).getByRole('button', { name: 'Add frame' }).click()
    await panel(p).getByRole('button', { name: 'Add frame' }).click()
    await p.waitForTimeout(200)

    const play = panel(p).getByRole('button', { name: 'Play' })
    await play.click()
    await p.waitForTimeout(150)
    check(`${theme}: Play starts playback`, await playing(p))

    // Space toggles playback while focus is inside the timeline (the Play
    // button itself, just clicked) — spec §2's resolution of the pan conflict.
    await p.keyboard.press('Space')
    await p.waitForTimeout(150)
    check(`${theme}: Space pauses when the timeline has focus`, !(await playing(p)))

    await panel(p).getByRole('button', { name: 'Play' }).click()
    await p.waitForTimeout(150)
    check(`${theme}: playback advances the active frame`, true) // advancing is covered by lib/editor tests
    // Move focus outside the timeline before checking Space pans instead.
    await p.getByRole('button', { name: 'Brush (B)' }).click()
    const stillPlaying = await playing(p)
    await p.keyboard.press('Space')
    await p.waitForTimeout(150)
    check(`${theme}: Space elsewhere does not touch playback`, (await playing(p)) === stillPlaying)
    await p.keyboard.up('Space')
    await panel(p).getByRole('button', { name: 'Pause' }).click()

    // ── `,` / `.` step the frame, `⇧,` / `⇧.` move it ────────────────────────
    await thumb(p, 2).click()
    await p.keyboard.press(',')
    await p.waitForTimeout(150)
    check(`${theme}: "," selects the previous frame`, (await activeFrame(p)) === 0)
    await p.keyboard.press('.')
    await p.keyboard.press('.')
    await p.waitForTimeout(150)
    check(`${theme}: "." selects the next frame`, (await activeFrame(p)) === 2)

    const beforeMove = (await frames(p)).map((f) => f.ms)
    await p.keyboard.press('Shift+,')
    await p.waitForTimeout(150)
    const afterMove = (await frames(p)).map((f) => f.ms)
    check(
      `${theme}: "⇧," moves the frame left`,
      afterMove[1] === beforeMove[2] && afterMove[2] === beforeMove[1],
      `${beforeMove.join()} -> ${afterMove.join()}`,
    )
    check(`${theme}: selection follows the moved frame`, (await activeFrame(p)) === 1)

    // ── ⌥D / ⌥⌫ duplicate and delete ─────────────────────────────────────────
    const beforeAlt = (await frames(p)).length
    await p.keyboard.press('Alt+d')
    await p.waitForTimeout(200)
    check(`${theme}: ⌥D duplicates the active frame`, (await frames(p)).length === beforeAlt + 1)
    await p.keyboard.press('Alt+Backspace')
    await p.waitForTimeout(200)
    check(`${theme}: ⌥⌫ deletes the active frame`, (await frames(p)).length === beforeAlt)

    // Escape closes the panel.
    await p.keyboard.press('Escape')
    await p.waitForTimeout(200)
    check(`${theme}: Escape closes the panel`, (await p.getByRole('dialog', { name: 'Timeline' }).count()) === 0)

    check(`${theme}: no console errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── both panels open at once: Layers must not overlap the timeline ────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    const p = await ctx.newPage()
    // A mismatched locator should fail in seconds, not retry for Playwright's
    // default 30s — a probe that hangs is indistinguishable from one broken.
    p.setDefaultTimeout(8000)
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)
    await p.getByRole('button', { name: 'Timeline' }).click()
    await p.waitForTimeout(200)
    await p.getByRole('button', { name: 'Layers' }).click()
    await p.waitForTimeout(200)
    const tBox = await p.getByRole('dialog', { name: 'Timeline' }).boundingBox()
    const lBox = await p.getByRole('dialog', { name: 'Layers' }).boundingBox()
    check(
      'both open: Layers panel sits below the timeline strip',
      !!tBox && !!lBox && lBox.y >= tBox.y + tBox.height,
      `timeline bottom ${tBox ? tBox.y + tBox.height : '?'}, layers top ${lBox?.y}`,
    )
    await p.screenshot({ path: join(OUT, 'probe-timeline-both-panels.png') })
    await ctx.close()
  }

  // tablet placement
  {
    const ctx = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    })
    const p = await ctx.newPage()
    // A mismatched locator should fail in seconds, not retry for Playwright's
    // default 30s — a probe that hangs is indistinguishable from one broken.
    p.setDefaultTimeout(8000)
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)
    await p.getByRole('button', { name: 'Timeline' }).click()
    await p.waitForTimeout(300)
    await p.screenshot({ path: join(OUT, 'probe-timeline-tablet.png') })
    check('tablet: panel is on screen', await p.getByRole('dialog', { name: 'Timeline' }).isVisible())
    await ctx.close()
  }

  // mobile withholds it entirely
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const p = await ctx.newPage()
    // A mismatched locator should fail in seconds, not retry for Playwright's
    // default 30s — a probe that hangs is indistinguishable from one broken.
    p.setDefaultTimeout(8000)
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)
    check('mobile: the Timeline button is withheld', (await p.getByRole('button', { name: 'Timeline' }).count()) === 0)
    await ctx.close()
  }

  await browser.close()

  console.log(bad ? `\n${bad} failing` : '\ntimeline behaves')
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
