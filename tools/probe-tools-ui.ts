/**
 * Exercise every tool through real pointer events and assert the document
 * actually changed. npx tsx tools/probe-tools-ui.ts
 */
import { chromium, type Browser, type Page } from 'playwright'

/**
 * app/page.tsx exposes this in development only, read-only. It replaces a stub
 * that referenced `window.__tesseraDoc`, a global nothing ever defined — so the
 * per-pixel half of this probe silently never ran.
 */
const APP = process.env.APP_URL ?? 'http://localhost:3000'
const LAYERS = `window.__tessera.layers()`

type ProbeLayer = { n: string; hidden: boolean; px: number[] }

const painted = (l: ProbeLayer) => l.px.filter((v) => v !== 0).length

async function drag(p: Page, x1: number, y1: number, x2: number, y2: number) {
  await p.mouse.move(x1, y1)
  await p.mouse.down()
  await p.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 })
  await p.mouse.move(x2, y2, { steps: 4 })
  await p.mouse.up()
  await p.waitForTimeout(120)
}

// ─────────────────────────────────────────────────────────────────────────────
// The selector tool — docs/specs/20-selector.md. Object select, multi-select,
// drag, nudge, Esc, Del, and a marquee-still-unchanged regression check.
// ─────────────────────────────────────────────────────────────────────────────

type ProbeSelection = { x: number; y: number; w: number; h: number; mask: number[] } | null

/** Two disjoint blobs (A: a 2x2 square, B: a 1x2 bar) with a transparent gap
 *  between and around them, and another gap between A and the canvas edge —
 *  deliberately laid out so a marquee spanning A's right edge into the gap
 *  can be moved onto B, to prove the marquee's "transparent gap punches a
 *  hole at the destination" behaviour is UNCHANGED (J-E8). */
const TEST_DOC = JSON.stringify({
  v: 1, id: 'probe-selector', name: 'selector probe', w: 8, h: 8,
  palette: [{ c: 'transparent' }, { c: '#2d1b00' }, { c: '#f4c430' }],
  frames: [{ ms: 100, layers: [{ n: 'base', px: [
    '........',
    '.11..2..',
    '.11..2..',
    '........',
    '........',
    '........',
    '........',
    '........',
  ] }] }],
  meta: { createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z' },
})

async function loadTestDoc(p: Page) {
  await p.evaluate(`window.__tessera.open(${JSON.stringify(TEST_DOC)})`)
  await p.waitForTimeout(150)
}

async function readSelection(p: Page): Promise<ProbeSelection> {
  return p.evaluate('window.__tessera.selection()') as Promise<ProbeSelection>
}

async function docToScreen(p: Page, x: number, y: number) {
  const vp = (await p.evaluate('window.__tessera.viewport()')) as
    { scale: number; offsetX: number; offsetY: number }
  const box = (await p.locator('canvas').boundingBox())!
  return { sx: box.x + vp.offsetX + x * vp.scale + vp.scale / 2, sy: box.y + vp.offsetY + y * vp.scale + vp.scale / 2 }
}

async function clickDoc(p: Page, x: number, y: number, opts?: { shift?: boolean }) {
  const { sx, sy } = await docToScreen(p, x, y)
  if (opts?.shift) await p.keyboard.down('Shift')
  await p.mouse.click(sx, sy)
  if (opts?.shift) await p.keyboard.up('Shift')
  await p.waitForTimeout(120)
}

async function dragDoc(p: Page, x1: number, y1: number, x2: number, y2: number) {
  const a = await docToScreen(p, x1, y1)
  const c = await docToScreen(p, x2, y2)
  await drag(p, a.sx, a.sy, c.sx, c.sy)
}

/** A held key's repeat, as the browser itself would dispatch it — `repeat:
 *  true` on the event, not a second real keydown. Playwright's own
 *  `keyboard.down()` does not simulate OS auto-repeat, so this is
 *  synthesised directly (a plain string per HANDOFF's `page.evaluate` trap —
 *  passing a function risks the `__name is not defined` esbuild issue). */
async function repeatKey(p: Page, key: string) {
  await p.evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${key}', repeat: true, bubbles: true }))`,
  )
  await p.waitForTimeout(80)
}

/**
 * Every sub-section reloads the fixture first — deliberately, rather than
 * chaining state across checks. Blob A (2x2, columns 1-2) and blob B (a bar
 * at column 5) sit close enough together that a chained drag/nudge sequence
 * would eventually collide the two (an early draft of this probe did exactly
 * that, and "moved blob A onto blob B" is a confusing thing to debug from a
 * failing assertion three checks later). Reloading is a few hundred extra
 * milliseconds; an isolated, hand-checkable expected result per check is
 * worth it.
 */
async function runSelectorChecks(browser: Browser, label: string, viewport: { width: number; height: number }, theme: 'dark' | 'light') {
  const results: Array<[string, boolean]> = []
  const ctx = await browser.newContext({ viewport, colorScheme: theme })
  const p = await ctx.newPage()
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await p.goto(APP, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  const at = (l: ProbeLayer, x: number, y: number) => l.px[y * 8 + x]
  const selectedCount = (s: ProbeSelection) => s?.mask.reduce((n, v) => n + v, 0) ?? 0

  // ── click / shift-click state machine — pure clicks, no pixel mutation ────
  await loadTestDoc(p)
  await p.getByRole('button', { name: 'Select / Move (V)' }).click()

  await clickDoc(p, 1, 1)
  let sel = await readSelection(p)
  results.push([`${label}: click selects blob A`, sel !== null && sel.x === 1 && sel.y === 1 && sel.w === 2 && sel.h === 2])
  results.push([`${label}: blob A's mask is fully filled (it's a solid square)`, sel !== null && sel.mask.every((v) => v === 1)])

  await clickDoc(p, 5, 1, { shift: true }) // add blob B
  sel = await readSelection(p)
  results.push([`${label}: shift-click adds blob B (6 cells selected total)`, selectedCount(sel) === 6])
  results.push([`${label}: the union's bbox spans both blobs`, sel !== null && sel.x === 1 && sel.w === 5])

  await clickDoc(p, 1, 1, { shift: true }) // remove blob A again — it is fully selected
  sel = await readSelection(p)
  results.push([`${label}: shift-click again removes blob A, leaving only B`, selectedCount(sel) === 2])

  await clickDoc(p, 2, 2) // plain click elsewhere on blob A
  sel = await readSelection(p)
  results.push([`${label}: a plain click replaces the selection with blob A`, selectedCount(sel) === 4 && sel!.x === 1])

  await clickDoc(p, 7, 7) // empty space
  sel = await readSelection(p)
  results.push([`${label}: clicking empty space deselects`, sel === null])

  // ── drag: moves the whole mask, transparency-aware — moved DOWN, away from
  // blob B, so this check's own math never collides with the fixture's other
  // blob ─────────────────────────────────────────────────────────────────────
  await loadTestDoc(p)
  await clickDoc(p, 1, 1)
  await dragDoc(p, 1, 1, 1, 4) // drag by +3 in y
  let layers = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push([
    `${label}: dragging blob A moves its pixels and clears the source`,
    at(layers[0]!, 1, 1) === 0 && at(layers[0]!, 1, 4) === 1 && at(layers[0]!, 2, 5) === 1,
  ])
  sel = await readSelection(p)
  results.push([`${label}: the selection outline follows the moved pixels`, sel !== null && sel.y === 4])

  // ── arrow-nudge, including a held repeat coalescing to one undo step —
  // nudged DOWN for the same collision-avoidance reason as the drag above ───
  await loadTestDoc(p)
  await clickDoc(p, 1, 1)
  const beforeNudge = (await p.evaluate(LAYERS)) as ProbeLayer[]
  await p.keyboard.press('ArrowDown') // first press: e.repeat is false
  await repeatKey(p, 'ArrowDown') // held repeat #1 — should merge into the first
  await repeatKey(p, 'ArrowDown') // held repeat #2 — should also merge
  layers = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push([`${label}: three nudges (1 press + 2 repeats) moved the blob down by 3`, at(layers[0]!, 1, 4) === 1])
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(200)
  layers = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push([
    `${label}: ONE undo reverts the whole held nudge, not just the last repeat (proves e.repeat coalescing)`,
    JSON.stringify(layers[0]!.px) === JSON.stringify(beforeNudge[0]!.px),
  ])
  sel = await readSelection(p)
  results.push([`${label}: the selection (a UI-only value) is not moved back by undo — the documented gap, spec §7`, sel !== null && sel.y === 4])

  // ── Esc deselects without touching the document ────────────────────────────
  await loadTestDoc(p)
  await clickDoc(p, 1, 1)
  const beforeEsc = (await p.evaluate(LAYERS)) as ProbeLayer[]
  await p.keyboard.press('Escape')
  await p.waitForTimeout(120)
  sel = await readSelection(p)
  const afterEsc = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push([`${label}: Esc deselects`, sel === null])
  results.push([`${label}: Esc does not mutate the document`, JSON.stringify(afterEsc[0]!.px) === JSON.stringify(beforeEsc[0]!.px)])

  // ── Del clears the masked pixels, selection stays over the emptied cells ──
  await loadTestDoc(p)
  await clickDoc(p, 1, 1)
  await p.keyboard.press('Delete')
  await p.waitForTimeout(150)
  layers = (await p.evaluate(LAYERS)) as ProbeLayer[]
  sel = await readSelection(p)
  results.push([
    `${label}: Del clears the masked pixels`,
    at(layers[0]!, 1, 1) === 0 && at(layers[0]!, 2, 1) === 0 && at(layers[0]!, 1, 2) === 0 && at(layers[0]!, 2, 2) === 0,
  ])
  results.push([`${label}: the selection outline remains after Del`, sel !== null && sel.x === 1 && sel.y === 1])
  results.push([`${label}: Del left blob B alone`, at(layers[0]!, 5, 1) === 2])

  // ── regression: marquee's rectangle move, transparent gaps included, is
  // UNCHANGED — the "hole" it can punch is correct, pre-existing behaviour,
  // not the bug this unit fixes (J-E8). ─────────────────────────────────────
  await loadTestDoc(p)
  await p.getByRole('button', { name: 'Select region (M)' }).click()
  await dragDoc(p, 3, 1, 5, 2) // rect over columns 3-5, rows 1-2: transparent, transparent, blob B
  await p.getByRole('button', { name: 'Select / Move (V)' }).click()
  await dragDoc(p, 4, 1, 2, 1) // drag the marquee left by 2 — its transparent left edge lands on blob A
  layers = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push([
    `${label}: marquee regression — moving a rect selection still carries its transparent gaps`,
    at(layers[0]!, 1, 1) === 0 && at(layers[0]!, 2, 1) === 0 && // blob A punched out
    at(layers[0]!, 3, 1) === 2 && // blob B's colour landed here
    at(layers[0]!, 5, 1) === 0, // blob B's original cell cleared (it moved)
  ])

  await p.screenshot({ path: `docs/shots/probe-selector-${label}.png` })
  results.push([`${label}: no console errors`, errors.length === 0])
  await ctx.close()
  return results
}

async function main() {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await p.goto(APP, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)

  const results: Array<[string, boolean]> = []

  for (const tool of ['Brush (B)', 'Eraser (E)', 'Shapes (U)', 'Gradient (H)', 'Fill (G)']) {
    await p.getByRole('button', { name: tool }).click()
    await p.waitForTimeout(80)
    const before = await p.evaluate(`document.querySelector('canvas').toDataURL().length`)
    await drag(p, 700, 350, 820, 470)
    const after = await p.evaluate(`document.querySelector('canvas').toDataURL().length`)
    results.push([tool, before !== after])
  }

  // marquee then move
  await p.getByRole('button', { name: 'Select region (M)' }).click()
  await drag(p, 700, 350, 820, 470)
  const selVisible = await p.evaluate(`document.querySelector('canvas').toDataURL().length`)
  await p.getByRole('button', { name: 'Select / Move (V)' }).click()
  const beforeMove = selVisible
  await drag(p, 740, 390, 900, 520)
  const afterMove = await p.evaluate(`document.querySelector('canvas').toDataURL().length`)
  results.push(['Select region + Move', beforeMove !== afterMove])

  // eyedropper: changes the swatch, not the document
  await p.getByRole('button', { name: 'Eyedropper (I)' }).click()
  await p.mouse.click(760, 400)
  await p.waitForTimeout(120)
  results.push(['Eyedropper (I)', true])

  // dither menu
  await p.getByRole('button', { name: 'Dither pattern' }).click()
  await p.waitForTimeout(200)
  const menu = await p.getByRole('menu', { name: 'Dither pattern' }).isVisible()
  results.push(['Dither menu opens', menu])
  if (menu) await p.getByRole('menuitemradio', { name: '50%' }).click()

  // ── second pass: every tool must write to the ACTIVE layer, and only it ────
  //
  // docs/specs/14-layers.md §8.9. Not observable from a screenshot: a stroke on
  // the wrong layer looks identical to a stroke on the right one.
  await p.getByRole('button', { name: 'Layers' }).click()
  await p.waitForTimeout(200)
  await p.getByRole('button', { name: 'Add', exact: true }).click()
  await p.waitForTimeout(200)

  // The eyedropper pass above may have left the colour on index 0 (transparent),
  // which would make every stroke below a no-op that looks like a layer bug.
  await p.getByLabel('Colour', { exact: true }).click()
  await p.waitForTimeout(150)
  await p.getByRole('dialog', { name: 'Palette' }).getByRole('button').nth(2).click()
  await p.waitForTimeout(150)

  const start = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push(['Add layer', start.length === 2 && painted(start[1]!) === 0])
  results.push(['New layer is active', (await p.evaluate(`window.__tessera.active()`)) === 1])

  const baseBefore = JSON.stringify(start[0]!.px)

  for (const tool of ['Brush (B)', 'Shapes (U)', 'Gradient (H)']) {
    await p.getByRole('button', { name: tool }).click()
    await p.waitForTimeout(80)
    const before = (await p.evaluate(LAYERS)) as ProbeLayer[]
    await drag(p, 640, 300, 780, 440)
    const after = (await p.evaluate(LAYERS)) as ProbeLayer[]
    const wroteActive = painted(after[1]!) !== painted(before[1]!)
    const leftBaseAlone = JSON.stringify(after[0]!.px) === baseBefore
    results.push([`${tool} writes layer 1 only`, wroteActive && leftBaseAlone])
  }

  // Fill is separate: it must be bounded by the active layer, not by what is
  // beneath it, so on an empty upper layer it floods the whole canvas.
  await p.getByRole('button', { name: 'Fill (G)' }).click()
  await p.waitForTimeout(80)
  await p.mouse.click(1100, 700)
  await p.waitForTimeout(200)
  const filled = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push(['Fill respects the active layer', JSON.stringify(filled[0]!.px) === baseBefore])

  // Undo must put the layer it was recorded against back, not the active one.
  await p.getByRole('button', { name: 'Layers' }).click()
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(300)
  const undone = (await p.evaluate(LAYERS)) as ProbeLayer[]
  results.push(['Undo leaves the base layer untouched', JSON.stringify(undone[0]!.px) === baseBefore])

  await p.close()

  // ── the selector — docs/specs/20-selector.md, unit J ──────────────────────
  // Its own contexts (theme, viewport) rather than reusing `p` above, which is
  // already mid-way through an unrelated layer/tool sequence.
  results.push(...await runSelectorChecks(b, 'dark-1440', { width: 1440, height: 900 }, 'dark'))
  results.push(...await runSelectorChecks(b, 'light-1440', { width: 1440, height: 900 }, 'light'))
  results.push(...await runSelectorChecks(b, 'dark-390', { width: 390, height: 844 }, 'dark'))

  await b.close()

  let bad = 0
  for (const [name, ok] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
  }
  console.log(bad ? `\n${bad} failing` : '\nall tools respond')
  process.exit(bad ? 1 : 0)
}
void main()
