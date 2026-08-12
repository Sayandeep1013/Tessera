/**
 * Drive the File menu with real clicks and assert the document.
 * See docs/specs/17-file-menu.md §5 and §7.
 *
 *   npx tsx tools/probe-file-menu.ts
 *
 * `check-responsive.ts` never opens a popover (HANDOFF §5), so it will report
 * six clean viewports while this menu hangs off a 320px screen. The last block
 * of this file opens the menu at 390 and 320 — with the submenu expanded, and
 * again with the confirm open, because both make it taller — and measures the
 * box.
 *
 * The rest is wiring, which is where A2 found both of its defects and where the
 * 49 unit tests behind this unit cannot reach: a Duplicate button wired to the
 * new-document handler passes every one of them.
 *
 * Reads the document through the development-only `window.__tessera` hook, and
 * reads IndexedDB directly. Read-only — commit() is still the only writer.
 */

import { chromium, type Page } from 'playwright'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'shots')
const APP = process.env.APP_URL ?? 'http://localhost:3000'

const SIZE = `window.__tessera.size()`
const LAYERS = `window.__tessera.layers()`
const IDENTITY = `window.__tessera.identity()`
const VIEWPORT = `window.__tessera.viewport()`
const ACTIVE_ID = `document.activeElement ? document.activeElement.id : ''`

/** Every draft record in IndexedDB. Duplicate's promise is that two survive. */
const DRAFTS = `(() => new Promise((res, rej) => {
  const r = indexedDB.open('tessera')
  r.onerror = () => rej(r.error)
  r.onsuccess = () => {
    const tx = r.result.transaction('drafts', 'readonly')
    const g = tx.objectStore('drafts').getAll()
    g.onsuccess = () => res(g.result.map((x) => ({ id: x.id, name: x.name })))
    g.onerror = () => rej(g.error)
  }
}))()`

/** The resolved value of --diff-remove, so "is Clear red" is not a hex guess. */
const RED = `(() => {
  const el = document.createElement('span')
  el.style.color = 'var(--diff-remove)'
  document.body.appendChild(el)
  const c = getComputedStyle(el).color
  el.remove()
  return c
})()`

const CLEAR_COLOUR = `(() => {
  const el = document.getElementById('file-clear')
  return el ? getComputedStyle(el).color : null
})()`

type ProbeLayer = { n: string; hidden: boolean; px: number[] }
type Identity = { id: string; name: string }

const results: Array<[string, boolean, string?]> = []
const check = (name: string, ok: boolean, detail?: string) => results.push([name, ok, detail])

const layers = (p: Page) => p.evaluate(LAYERS) as Promise<ProbeLayer[]>
const identity = (p: Page) => p.evaluate(IDENTITY) as Promise<Identity>
const size = (p: Page) => p.evaluate(SIZE) as Promise<{ w: number; h: number }>

const menu = (p: Page) => p.getByRole('menu', { name: 'File' })
const fileButton = (p: Page) => p.getByRole('button', { name: 'File — new, open, export' })

async function openMenu(p: Page) {
  if ((await menu(p).count()) === 0) {
    await fileButton(p).click()
    await p.waitForTimeout(200)
  }
}

async function closeMenu(p: Page) {
  for (let i = 0; i < 4 && (await menu(p).count()) > 0; i++) {
    await p.keyboard.press('Escape')
    await p.waitForTimeout(120)
  }
}

/** Painted cells across every layer of frame 0, counted once per cell. */
async function paintedCount(p: Page): Promise<number> {
  const ls = await layers(p)
  const set = new Set<number>()
  for (const l of ls) l.px.forEach((v, i) => v !== 0 && set.add(i))
  return set.size
}

/** One brush click at the centre of the artwork. See HANDOFF §5 on coordinates. */
async function dotAtCentre(p: Page) {
  const box = await p.locator('canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await p.waitForTimeout(300)
}

const EXPECTED_ITEMS = [
  'New…', 'Open…', 'Duplicate', 'Examples',
  'Download .tessera.json', 'Export PNG', 'Clear…',
]

async function run(p: Page, theme: string) {
  const t = (s: string) => `${theme}: ${s}`

  // ── the shape of it ───────────────────────────────────────────────────────
  await openMenu(p)
  await p.screenshot({ path: join(OUT, `probe-file-menu-${theme}.png`) })

  check(t('the menu opens'), (await menu(p).count()) === 1)

  const labels = (await menu(p).getByRole('menuitem').allInnerTexts())
    .map((l) => l.replace(/\s+/g, ' ').trim())
  check(t('the items are the specced set, in order'),
    labels.length === EXPECTED_ITEMS.length &&
    EXPECTED_ITEMS.every((want, i) => labels[i]!.startsWith(want)),
    JSON.stringify(labels))

  const text = (await menu(p).innerText()).toLowerCase()
  check(t('no account items'),
    !['dashboard', 'explore', 'publish', 'community'].some((w) => text.includes(w)), text)
  check(t('Ctrl S is the only shortcut promised (§7.2)'),
    (text.match(/ctrl/g) ?? []).length === 1, text)

  // ── a blank document: Clear has nothing to do, New has nothing to ask ─────
  check(t('Clear is disabled with nothing painted (§7.4)'),
    await p.locator('#file-clear').isDisabled())

  await p.locator('#file-new').click()
  await p.waitForTimeout(250)
  check(t('New on a blank document does not confirm (spec §5)'),
    (await p.getByRole('alertdialog').count()) === 0 && (await menu(p).count()) === 0)

  // ── the submenu, and Escape one level at a time ───────────────────────────
  await dotAtCentre(p)
  check(t('painted one cell to work with'), (await paintedCount(p)) === 1)

  await openMenu(p)
  const red = await p.evaluate(RED)
  const clearColour = await p.evaluate(CLEAR_COLOUR)
  check(t('Clear is red once it is live'), clearColour === red, `${clearColour} vs ${red}`)

  check(t('Examples starts collapsed'),
    (await p.locator('#file-examples').getAttribute('aria-expanded')) === 'false')
  check(t('…and its starters are not on screen'),
    (await p.locator('#file-example-face').count()) === 0)

  await p.locator('#file-examples').click()
  await p.waitForTimeout(150)
  check(t('Examples expands in place (§7.1)'),
    (await p.locator('#file-examples').getAttribute('aria-expanded')) === 'true')
  check(t('…showing every starter listStarters() knows'),
    (await p.locator('#file-example-face').count()) === 1 &&
    (await p.locator('#file-example-bird').count()) === 1)
  check(t('…and the menu stays open'), (await menu(p).count()) === 1)
  await p.screenshot({ path: join(OUT, `probe-file-menu-${theme}-examples.png`) })

  // Every item reachable by keyboard, submenu included — spec §5.
  await p.locator('#file-new').focus()
  const reached = new Set<string>()
  for (let i = 0; i < 12; i++) {
    const id = await p.evaluate(ACTIVE_ID)
    if (typeof id === 'string' && id) reached.add(id)
    await p.keyboard.press('Tab')
  }
  const want = ['file-new', 'file-open', 'file-duplicate', 'file-examples',
    'file-example-face', 'file-example-bird', 'file-download', 'file-png', 'file-clear']
  check(t('every item is reachable by keyboard, submenu included'),
    want.every((id) => reached.has(id)),
    `missing ${want.filter((id) => !reached.has(id)).join(', ')}`)

  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
  check(t('Escape collapses the submenu first (spec §5)'),
    (await menu(p).count()) === 1 &&
    (await p.locator('#file-examples').getAttribute('aria-expanded')) === 'false')
  await p.keyboard.press('Escape')
  await p.waitForTimeout(150)
  check(t('…and the second Escape closes the menu'), (await menu(p).count()) === 0)

  // ── New confirms once there is work at stake, and Cancel means cancel ─────
  await openMenu(p)
  await p.locator('#file-new').click()
  await p.waitForTimeout(200)
  const newMsg = (await p.getByRole('alertdialog').innerText()).replace(/\s+/g, ' ')
  check(t('New confirms on a painted document (F-M1)'), newMsg.includes('blank 32×32'), newMsg)
  check(t('…and is honest that undo lasts until a reload'),
    newMsg.includes('Undo brings it back') && newMsg.includes('reload'), newMsg)
  check(t('…the menu body is replaced while it asks (§7.5)'),
    (await menu(p).getByRole('menuitem').count()) === 0)
  await p.screenshot({ path: join(OUT, `probe-file-menu-${theme}-confirm-new.png`) })

  await p.getByRole('button', { name: 'Cancel' }).click()
  await p.waitForTimeout(150)
  check(t('Cancel returns to the menu rather than closing it'),
    (await menu(p).count()) === 1 && (await menu(p).getByRole('menuitem').count()) > 0)
  check(t('…and nothing was destroyed'), (await paintedCount(p)) === 1)

  // ── Clear: the cost first, then one undoable command ──────────────────────
  await p.locator('#file-clear').click()
  await p.waitForTimeout(200)
  const clearMsg = (await p.getByRole('alertdialog').innerText()).replace(/\s+/g, ' ')
  check(t('Clear says the cost before the action (§7.4)'),
    clearMsg.includes('1 painted pixel'), clearMsg)
  check(t('…across every layer, and undoable'),
    clearMsg.includes('every layer') && clearMsg.includes('Undo brings it back'), clearMsg)
  await p.screenshot({ path: join(OUT, `probe-file-menu-${theme}-confirm-clear.png`) })

  await p.locator('#file-confirm-clear').click()
  await p.waitForTimeout(300)
  check(t('Clear empties the frame'), (await paintedCount(p)) === 0)
  check(t('…and closes the menu'), (await menu(p).count()) === 0)
  const afterClear = await size(p)
  check(t('…keeping the document and its size'), afterClear.w === 32 && afterClear.h === 32)

  await p.keyboard.press('Control+z')
  await p.waitForTimeout(300)
  check(t('one Ctrl+Z brings the artwork back (spec §5)'), (await paintedCount(p)) === 1)

  // ── Duplicate: a fresh id, a copy name, and the original still saved ──────
  const before = await identity(p)
  await openMenu(p)
  await p.locator('#file-duplicate').click()
  // flushSave, then setDoc, then the copy's own debounced save.
  await p.waitForTimeout(1200)

  const after = await identity(p)
  check(t('Duplicate takes a fresh id'), after.id !== before.id, `${before.id} → ${after.id}`)
  // The default document has no name; the header shows "untitled" as a
  // placeholder, so the copy is named from that rather than from "".
  check(t('…and a copy name'), after.name === 'untitled copy', after.name)
  check(t('…carrying the artwork with it'), (await paintedCount(p)) === 1)
  check(t('…and the header shows the new name'),
    (await p.getByLabel('Artwork name').inputValue()) === 'untitled copy')

  const drafts = (await p.evaluate(DRAFTS)) as Identity[]
  check(t('…while the original is still saved (§2, §7.7)'),
    drafts.some((d) => d.id === before.id) && drafts.some((d) => d.id === after.id),
    JSON.stringify(drafts))

  // ── an example replaces the document and re-fits the view ─────────────────
  await openMenu(p)
  await p.locator('#file-examples').click()
  await p.waitForTimeout(150)
  await p.locator('#file-example-face').click()
  await p.waitForTimeout(400)
  check(t('an example loads and closes the menu'), (await menu(p).count()) === 0)
  const face = await size(p)
  check(t('…changing the document to the starter size'), face.w === 16 && face.h === 16,
    JSON.stringify(face))
  const vp = (await p.evaluate(VIEWPORT)) as { scale: number }
  const canvasBox = await p.locator('canvas').boundingBox()
  check(t('…and re-fitting the view so the artwork is on screen'),
    !!canvasBox && vp.scale * 16 <= canvasBox.height, JSON.stringify(vp))

  await closeMenu(p)
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

  // ── the phones check-responsive cannot see ────────────────────────────────
  for (const [name, width, height] of [['mobile', 390, 844], ['narrow', 320, 568]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)

    const onScreen = async (label: string) => {
      const box = await menu(p).boundingBox()
      check(`${name}: ${label} is fully on screen`,
        !!box && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height,
        JSON.stringify(box))
    }

    await openMenu(p)
    await onScreen('the menu')
    await p.locator('#file-examples').click()
    await p.waitForTimeout(150)
    await onScreen('the menu with Examples expanded')
    await p.screenshot({ path: join(OUT, `probe-file-menu-${name}.png`) })

    const row = await p.locator('#file-new').boundingBox()
    check(`${name}: the rows are still a usable target`, !!row && row.height >= 24,
      JSON.stringify(row))

    // The confirm is the tallest thing the menu can show — two lines of copy
    // plus a button row.
    await closeMenu(p)
    await dotAtCentre(p)
    await openMenu(p)
    await p.locator('#file-clear').click()
    await p.waitForTimeout(200)
    await onScreen('the Clear confirm')
    await p.screenshot({ path: join(OUT, `probe-file-menu-${name}-confirm.png`) })

    await ctx.close()
  }

  await browser.close()

  let bad = 0
  for (const [name, ok, detail] of results) {
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`)
  }
  console.log(bad ? `\n${bad} failing` : `\n${results.length} checks, the File menu behaves`)
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
