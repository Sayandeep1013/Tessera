/**
 * Drive the code panel with real typing and assert the document.
 * See docs/specs/07-code-panel.md §8, and §9 for what unit C corrected.
 *
 *   npx tsx tools/probe-code-panel.ts
 *
 * The algorithm — path resolution, the coalescing window, the caret mapping —
 * is covered exhaustively in node by `json-locate.test.ts` and
 * `code-panel.test.ts`. None of that can tell you whether the two sync
 * directions actually fight each other, whether the overlay's mark lands on the
 * character it is marking, or whether one Ctrl+Z really takes a paragraph of
 * typing back out. That is what this is for.
 *
 * Reads the document through the development-only `window.__tessera` hook.
 * Read-only — commit() is still the only writer.
 */

import { chromium, type Page } from 'playwright'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'

const SOURCE = `window.__tessera.source()`
const LAYERS = `window.__tessera.layers()`
const SIZE = `window.__tessera.size()`
const VIEWPORT = `window.__tessera.viewport()`

/** The overlay's marks, as [text, kind] — the only way to see what is marked. */
const MARKS = `(() => Array.from(document.querySelectorAll('#code-panel mark')).map((m) => ({
  text: m.textContent,
  outline: getComputedStyle(m).outlineColor,
})))()`

const RED = `(() => {
  const el = document.createElement('span')
  el.style.color = 'var(--diff-remove)'
  document.body.appendChild(el)
  const c = getComputedStyle(el).color
  el.remove()
  return c
})()`

/** Replace the whole buffer through the real input path, not through .value. */
const setText = (t: string) => `(() => {
  const el = document.getElementById('code-text')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(t)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

/** Put the caret at an absolute offset and tell React about it. */
const putCaret = (at: number) => `(() => {
  const el = document.getElementById('code-text')
  el.focus()
  el.setSelectionRange(${at}, ${at})
  el.dispatchEvent(new Event('select', { bubbles: true }))
  return true
})()`

type ProbeLayer = { n: string; hidden: boolean; px: number[] }

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

const source = (p: Page) => p.evaluate(SOURCE) as Promise<string>
const layers = (p: Page) => p.evaluate(LAYERS) as Promise<ProbeLayer[]>
const panel = (p: Page) => p.locator('#code-panel')
const area = (p: Page) => p.locator('#code-text')
const status = (p: Page) => p.locator('#code-status')

const text = async (p: Page) => (await area(p).inputValue())
const statusText = async (p: Page) => (await status(p).innerText()).replace(/\s+/g, ' ').trim()

/**
 * Every index at which two serializations differ, ignoring `updatedAt`.
 *
 * Every command stamps `meta.updatedAt`, so two serializations of the same
 * document taken a second apart always differ in the timestamp. §8's "only that
 * character" is a claim about the pixel grid, and blanking the stamp is what
 * makes it the thing actually being asserted.
 */
const STAMP = /"updatedAt": "[^"]*"/
const unstamped = (s: string) => s.replace(STAMP, '"updatedAt": ""')

function diffAt(a: string, b: string): number[] {
  const x = unstamped(a)
  const y = unstamped(b)
  if (x.length !== y.length) return [-1]
  const out: number[] = []
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) out.push(i)
  return out
}

async function openPanel(p: Page) {
  if ((await panel(p).count()) === 0) {
    await p.getByRole('button', { name: 'Code' }).click()
    await p.waitForTimeout(400)
  }
}

/** A starter, so there is real artwork rather than an empty grid. */
async function loadFace(p: Page) {
  await p.getByRole('button', { name: 'File — new, open, export' }).click()
  await p.waitForTimeout(200)
  await p.locator('#file-examples').click()
  await p.waitForTimeout(150)
  await p.locator('#file-example-face').click()
  await p.waitForTimeout(500)
}

async function run(p: Page, theme: string) {
  const t = (s: string) => `${theme}: ${s}`

  await loadFace(p)

  // ── opening it, and what it does to the view — §1 and §9.3 ────────────────
  const beforeOpen = (await p.evaluate(VIEWPORT)) as { scale: number; offsetX: number }
  const canvasBefore = await p.locator('canvas').boundingBox()
  await openPanel(p)

  check(t('the Code button opens the panel'), (await panel(p).count()) === 1)
  await p.screenshot({ path: join(OUT, `probe-code-panel-${theme}.png`) })

  const canvasAfter = await p.locator('canvas').boundingBox()
  check(t('it is a split — the canvas gives up width rather than being covered'),
    !!canvasBefore && !!canvasAfter && canvasAfter.width < canvasBefore.width - 200,
    `${canvasBefore?.width} → ${canvasAfter?.width}`)

  const afterOpen = (await p.evaluate(VIEWPORT)) as { scale: number; offsetX: number }
  check(t('…keeping the zoom, because a resize is not a zoom (§9.3)'),
    afterOpen.scale === beforeOpen.scale, `${beforeOpen.scale} → ${afterOpen.scale}`)
  const doc16 = (await p.evaluate(SIZE)) as { w: number; h: number }
  check(t('…and re-centring, so the artwork is still on screen'),
    afterOpen.offsetX > 0 && afterOpen.offsetX + doc16.w * afterOpen.scale <= canvasAfter!.width,
    JSON.stringify(afterOpen))

  // ── the text IS the document — §1, the whole thesis ──────────────────────
  check(t('the panel is byte-identical to what Download writes'),
    (await text(p)) === (await source(p)))
  check(t('…and says it is valid'), (await statusText(p)).startsWith('Valid'))

  // ── canvas → panel: paint one pixel, one character changes — §8 ──────────
  const beforePaint = await text(p)
  const box = await p.locator('canvas').boundingBox()
  // Artwork coordinates, not element coordinates — HANDOFF §5.
  await p.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await p.waitForTimeout(600)

  const afterPaint = await text(p)
  const changed = diffAt(beforePaint, afterPaint)
  check(t('painting changes exactly one character in the text (§8)'),
    changed.length === 1, `${changed.length} characters differ`)
  check(t('…and the panel still matches the document exactly'),
    afterPaint === (await source(p)))

  // ── panel → canvas: edit a character, the pixel changes — §8 ─────────────
  const at = changed[0]!
  const before = afterPaint[at]
  const edited = afterPaint.slice(0, at) + '.' + afterPaint.slice(at + 1)
  await p.evaluate(setText(edited))
  await p.waitForTimeout(800)

  const px = (await layers(p))[0]!.px
  check(t('editing a character changes the pixel it stands for (§8)'),
    px.filter((v) => v !== 0).length > 0 && (await text(p)) === (await source(p)),
    `was ${before}`)
  check(t('…and the panel was not rewritten under the caret'),
    (await text(p)) === edited || (await text(p)) === (await source(p)))

  // ── the caret readout — §9.2 ─────────────────────────────────────────────
  const src = await text(p)
  // First pixel row: the character after `"px": [` and the following quote.
  const rowStart = src.indexOf('"px": [')
  const firstQuote = src.indexOf('"', src.indexOf('[', rowStart) + 1)
  await p.evaluate(putCaret(firstQuote + 4))
  await p.waitForTimeout(300)
  check(t('the status line says where the caret is, as a pixel'),
    /row \d+ · char \d+ → pixel \(\d+, \d+\)/.test(await statusText(p)), await statusText(p))
  await p.screenshot({ path: join(OUT, `probe-code-panel-${theme}-caret.png`) })

  // ── an invalid buffer keeps the artwork — §3 ─────────────────────────────
  const goodDoc = JSON.stringify(await layers(p))
  const goodText = await text(p)
  // A character no pixel row may contain, inside a pixel row: the path resolves
  // to exactly one character, which is the case §3's table exists for.
  const badAt = firstQuote + 3
  await p.evaluate(setText(goodText.slice(0, badAt) + '@' + goodText.slice(badAt + 1)))
  await p.waitForTimeout(800)

  const errText = await statusText(p)
  check(t('an unparseable buffer says so rather than going silent (§3)'),
    errText.toLowerCase().includes('unrecognised character'), errText)
  check(t('…and the document is untouched'), JSON.stringify(await layers(p)) === goodDoc)
  check(t('…and the field is marked invalid for assistive tech'),
    (await area(p).getAttribute('aria-invalid')) === 'true')

  const marks = (await p.evaluate(MARKS)) as Array<{ text: string; outline: string }>
  const red = await p.evaluate(RED)
  check(t('…marking exactly the one character that is wrong (§3)'),
    marks.length === 1 && marks[0]!.text === '@', JSON.stringify(marks))
  check(t('…in the colour that means error'), marks[0]?.outline === red,
    `${marks[0]?.outline} vs ${red}`)
  await p.screenshot({ path: join(OUT, `probe-code-panel-${theme}-error.png`) })

  check(t('…and offers a way to it'),
    (await p.getByRole('button', { name: 'Go to error' }).count()) === 1)
  await p.getByRole('button', { name: 'Go to error' }).click()
  await p.waitForTimeout(300)
  const sel = await area(p).evaluate((el) => {
    const a = el as HTMLTextAreaElement
    return a.value.slice(a.selectionStart, a.selectionEnd)
  })
  check(t('…which selects the offending character'), sel === '@', JSON.stringify(sel))

  // Put it back, and the error clears.
  await p.evaluate(setText(goodText))
  await p.waitForTimeout(800)
  check(t('fixing it clears the error'), (await statusText(p)).startsWith('Valid'))

  // ── coalescing — §5 and §8 ───────────────────────────────────────────────
  const startDoc = JSON.stringify(await layers(p))
  const startText = await text(p)
  // Four edits in quick succession, each a real parse and commit.
  for (let i = 0; i < 4; i++) {
    const s = await text(p)
    await p.evaluate(setText(s.slice(0, firstQuote + 1 + i) + '2' + s.slice(firstQuote + 2 + i)))
    await p.waitForTimeout(400)
  }
  const burst = JSON.stringify(await layers(p))
  check(t('four quick edits all landed'), burst !== startDoc)

  await p.keyboard.press('Control+z')
  await p.waitForTimeout(600)
  check(t('…and one Ctrl+Z takes the whole burst back out (§5)'),
    JSON.stringify(await layers(p)) === startDoc)
  check(t('…rewriting the panel from the restored document'),
    (await text(p)) === (await source(p)) && (await text(p)) === startText)

  // ── the overlay and the textarea must agree, scrolled to the end ─────────
  // The overlay is what you actually SEE — the textarea's own text is
  // transparent — so any disagreement about layout or scroll is a mark sitting
  // off the character it marks, or text that is simply not painted. Translating
  // the overlay instead of scrolling it clipped the last three pixel rows of a
  // 16×16 document while the gutter numbered them; every check above still
  // passed, and only looking at a screenshot found it.
  const geometry = await p.evaluate(`(() => {
    const a = document.getElementById('code-text')
    const pre = document.querySelector('#code-panel pre')
    a.scrollTop = a.scrollHeight
    a.dispatchEvent(new Event('scroll', { bubbles: true }))
    const ab = a.getBoundingClientRect()
    const pb = pre.getBoundingClientRect()
    return {
      heights: [a.scrollHeight, pre.scrollHeight],
      tops: [Math.round(a.scrollTop), Math.round(pre.scrollTop)],
      boxes: [Math.round(ab.top), Math.round(pb.top), Math.round(ab.bottom), Math.round(pb.bottom)],
    }
  })()`) as { heights: number[]; tops: number[]; boxes: number[] }

  check(t('the overlay and the textarea lay the text out identically'),
    geometry.heights[0] === geometry.heights[1], JSON.stringify(geometry.heights))
  check(t('…and scroll together to the last line'),
    Math.abs(geometry.tops[0]! - geometry.tops[1]!) <= 1, JSON.stringify(geometry.tops))
  check(t('…with the overlay still covering the whole field, not riding up it'),
    geometry.boxes[0] === geometry.boxes[1] && geometry.boxes[2] === geometry.boxes[3],
    JSON.stringify(geometry.boxes))
  await p.screenshot({ path: join(OUT, `probe-code-panel-${theme}-end.png`) })

  await p.evaluate(`(() => {
    const a = document.getElementById('code-text')
    a.scrollTop = 0
    a.dispatchEvent(new Event('scroll', { bubbles: true }))
    return true
  })()`)

  // ── canvas → panel highlight — §4 ────────────────────────────────────────
  await p.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await p.waitForTimeout(300)
  const hoverMarks = (await p.evaluate(MARKS)) as Array<{ text: string }>
  check(t('hovering a pixel marks its character (§4)'),
    hoverMarks.length === 1 && hoverMarks[0]!.text.length === 1, JSON.stringify(hoverMarks))

  // ── Ctrl+/ — §1, and §9.7 on why it is not behind isTyping ───────────────
  // Pressed with focus INSIDE the panel's own textarea, which is where the
  // isTyping guard used to make it the one place the shortcut did not work.
  await area(p).focus()
  await p.keyboard.press('Control+/')
  await p.waitForTimeout(300)
  check(t('Ctrl+/ closes the panel from inside the panel (§9.7)'),
    (await panel(p).count()) === 0)
  await p.keyboard.press('Control+/')
  await p.waitForTimeout(300)
  check(t('…and opens it again'), (await panel(p).count()) === 1)

  const nameField = p.getByLabel('Artwork name')
  if ((await nameField.count()) > 0) {
    await nameField.click()
    await p.keyboard.press('Control+/')
    await p.waitForTimeout(250)
    check(t('…and from the filename field, where a slash chord means nothing'),
      (await panel(p).count()) === 0)
    await p.keyboard.press('Control+/')
    await p.waitForTimeout(250)
  }

  // ── the divider — §1 ─────────────────────────────────────────────────────
  const wide = await panel(p).boundingBox()
  await p.mouse.move(wide!.x + 1, wide!.y + 300)
  await p.mouse.down()
  await p.mouse.move(wide!.x - 120, wide!.y + 300, { steps: 8 })
  await p.mouse.up()
  await p.waitForTimeout(300)
  const wider = await panel(p).boundingBox()
  check(t('the divider resizes the panel (§1)'), wider!.width > wide!.width + 80,
    `${wide!.width} → ${wider!.width}`)
  check(t('…within the specced range'), wider!.width >= 320 && wider!.width <= 800,
    String(wider!.width))

  await p.keyboard.press('Control+/')
  await p.waitForTimeout(300)
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

  // ── the phone sheet — §7 ──────────────────────────────────────────────────
  for (const [name, width, height] of [['mobile', 390, 844], ['narrow', 320, 568]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)

    await p.getByRole('button', { name: 'Code' }).click()
    await p.waitForTimeout(500)

    const box = await panel(p).boundingBox()
    check(`${name}: the panel is a full-screen sheet, not a split (§7)`,
      !!box && box.width >= width - 1 && box.x <= 1, JSON.stringify(box))
    check(`${name}: …fully on screen`,
      !!box && box.y >= 0 && box.x >= 0 && box.x + box.width <= width, JSON.stringify(box))
    check(`${name}: …and dismisses with Done rather than a hidden gesture`,
      (await p.getByRole('button', { name: 'Done' }).count()) === 1)
    check(`${name}: the text is still the document`,
      (await text(p)) === (await source(p)))
    await p.screenshot({ path: join(OUT, `probe-code-panel-${name}.png`) })

    await p.getByRole('button', { name: 'Done' }).click()
    await p.waitForTimeout(300)
    check(`${name}: Done closes it`, (await panel(p).count()) === 0)

    await ctx.close()
  }

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : `\n${results.length} checks, the code panel behaves`)
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
