/**
 * The bring-your-own-key dialog. See docs/specs/18-provider-byok.md §7, §9.
 *
 *   npx next dev --turbopack -p 3100
 *   APP_URL=http://localhost:3100 npx tsx tools/probe-byok.ts
 *
 * Structure checks run against every provider preset in both themes and at 320px,
 * with NO network and NO key — they are free and they are what `npm run probes`
 * runs.
 *
 * The LIVE check is opt-in and costs money:
 *
 *   PROBE_LIVE=1 APP_URL=http://localhost:3100 npx tsx tools/probe-byok.ts
 *
 * It drives the exact path a member of the public takes — cold browser, open the
 * dialog, pick "Claude · AgentRouter", paste a key, save, type an instruction,
 * watch a real edit land. The eval harness seeds localStorage directly, which
 * skips the dialog entirely; this is the only check that proves the thing a user
 * actually touches works.
 */

import { chromium, type Page } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const OUT = join(process.cwd(), 'docs', 'shots')
const LIVE = process.env.PROBE_LIVE === '1'

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const line = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`))
    return line?.slice(name.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}

const checks: Array<[string, boolean]> = []
const check = (name: string, ok: boolean) => {
  checks.push([name, ok])
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
}

const READ_CONFIG = `(() => window.localStorage.getItem('tessera-api-key'))()`

async function openDialog(p: Page) {
  await p.getByRole('button', { name: /API key/i }).first().click()
  await p.getByRole('dialog', { name: 'Your API key' }).waitFor({ timeout: 5000 })
}

// ─── structure, free ─────────────────────────────────────────────────────────

async function structure(p: Page, theme: string) {
  await openDialog(p)
  const dialog = p.getByRole('dialog', { name: 'Your API key' })
  const provider = dialog.getByLabel('Provider')
  const keyField = dialog.getByLabel('API key')

  const options = await provider.locator('option').allInnerTexts()
  check(`${theme}: every preset is offered`, options.length === 4)
  check(`${theme}: AgentRouter is offered by name`, options.some((o) => /AgentRouter/.test(o)))
  check(`${theme}: a custom base URL is offered`, options.some((o) => /Anthropic-compatible/.test(o)))

  // Gemini stays the default so the app still works with no key at all.
  check(`${theme}: gemini is the default`, (await provider.inputValue()) === 'gemini')
  check(`${theme}: gemini placeholder`, (await keyField.getAttribute('placeholder')) === 'AIza…')
  check(
    `${theme}: gemini key link`,
    (await dialog.getByRole('link', { name: 'Get a key' }).getAttribute('href'))?.includes(
      'aistudio.google.com',
    ) === true,
  )
  check(`${theme}: no model field for gemini`, (await dialog.getByLabel('Model').count()) === 0)

  // ── Anthropic ──
  await provider.selectOption('anthropic')
  check(`${theme}: anthropic placeholder`, (await keyField.getAttribute('placeholder')) === 'sk-ant-…')
  check(
    `${theme}: anthropic key link`,
    (await dialog.getByRole('link', { name: 'Get a key' }).getAttribute('href'))?.includes(
      'console.anthropic.com',
    ) === true,
  )
  check(`${theme}: model field appears`, (await dialog.getByLabel('Model').count()) === 1)
  check(
    `${theme}: no compatibility notice for anthropic`,
    !(await dialog.textContent())?.includes('identifies itself as Claude Code'),
  )

  // ── AgentRouter ──
  await provider.selectOption('agentrouter')
  check(`${theme}: agentrouter placeholder`, (await keyField.getAttribute('placeholder')) === 'sk-…')
  check(
    `${theme}: the compatibility notice says what it does, in the dialog (§7.3)`,
    (await dialog.textContent())?.includes('identifies itself as Claude Code') === true,
  )
  check(
    `${theme}: and says it is the user's call`,
    (await dialog.textContent())?.includes('your account, your call') === true,
  )

  // ── custom ──
  await provider.selectOption('custom')
  check(`${theme}: custom reveals a base URL field`, (await dialog.getByLabel('Base URL').count()) === 1)
  check(
    `${theme}: custom offers the compatibility checkbox`,
    (await dialog.getByLabel('AgentRouter compatibility').count()) === 1,
  )
  check(
    `${theme}: the notice is hidden until the box is ticked`,
    !(await dialog.textContent())?.includes('identifies itself as Claude Code'),
  )
  await dialog.getByLabel('AgentRouter compatibility').check()
  check(
    `${theme}: ticking it shows the notice`,
    (await dialog.textContent())?.includes('identifies itself as Claude Code') === true,
  )

  // The credential promise is the reason this dialog is trusted at all.
  const text = (await dialog.textContent()) ?? ''
  check(`${theme}: the credential promise is present`, text.includes('Stored in this browser only'))
  check(`${theme}: it says the key is discarded`, text.includes('discarded'))
  check(`${theme}: it says the key is never logged`, text.includes('never'))

  await p.screenshot({ path: join(OUT, `probe-byok-${theme}.png`) })
}

async function saveAndRead(p: Page) {
  await openDialog(p)
  const dialog = p.getByRole('dialog', { name: 'Your API key' })
  await dialog.getByLabel('Provider').selectOption('agentrouter')
  await dialog.getByLabel('API key').fill('sk-not-a-real-key-000')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await p.waitForTimeout(300)

  const stored = JSON.parse((await p.evaluate(READ_CONFIG)) as string) as Record<string, unknown>
  check('saving stores the provider, not just the key', stored.providerId === 'anthropic')
  check('saving stores the base URL', stored.baseUrl === 'https://agentrouter.org')
  check('saving stores the compatibility profile', stored.profile === 'claude-code')
  check('saving stores the key', stored.apiKey === 'sk-not-a-real-key-000')

  // Reopening shows it masked rather than revealing it.
  await openDialog(p)
  const shown = (await p.getByRole('dialog', { name: 'Your API key' }).textContent()) ?? ''
  // The mask deliberately keeps the first and last four characters so the user can
  // recognise which key they saved. The property under test is that the WHOLE key
  // never appears — an earlier version of this check looked for the last four and
  // failed the code for doing exactly what it is supposed to do.
  check(
    'the stored key is masked, never shown in full',
    shown.includes('••••') && !shown.includes('sk-not-a-real-key-000'),
  )

  await p.getByRole('button', { name: 'Remove' }).click()
  await p.waitForTimeout(300)
  check('Remove clears it', (await p.evaluate(READ_CONFIG)) === null)
}

async function legacyMigration(p: Page) {
  // Anyone who saved a key before spec 18 had a bare string, always a Gemini key.
  // An upgrade must not invalidate it (§4.3).
  await p.evaluate(`window.localStorage.setItem('tessera-api-key', 'AIzaLegacyKeyFromBefore')`)
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  await openDialog(p)
  const shown = (await p.getByRole('dialog', { name: 'Your API key' }).textContent()) ?? ''
  check('a pre-unit-I bare key still reads as a saved key', shown.includes('••••'))
  await p.getByRole('button', { name: 'Remove' }).click()
  await p.waitForTimeout(200)
}

// ─── live, opt-in, costs money ───────────────────────────────────────────────

async function live(p: Page) {
  const key = env('AGENTROUTER_API_KEY') ?? env('ANTHROPIC_API_KEY')
  if (!key) {
    console.log('skip  live: no AGENTROUTER_API_KEY')
    return
  }

  await p.evaluate(`window.localStorage.clear()`)
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)

  // Exactly what a member of the public does, through the dialog, from cold.
  await openDialog(p)
  const dialog = p.getByRole('dialog', { name: 'Your API key' })
  await dialog.getByLabel('Provider').selectOption('agentrouter')
  await dialog.getByLabel('API key').fill(key)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await p.waitForTimeout(400)

  const input = p.getByLabel('Tell the agent what to do')
  await input.fill('Draw a single red pixel at (8, 8).')
  await input.press('Enter')

  const done = p.getByText(/pixels? changed|No changes were made/i).first()
  let landed = true
  try {
    await done.waitFor({ timeout: 240_000 })
  } catch {
    landed = false
  }

  check('LIVE: a key pasted into the dialog drives a real edit', landed)

  if (landed) {
    const card = (await done.textContent()) ?? ''
    check('LIVE: the outcome reports pixels changed', /\d+ pixels? changed/.test(card))
    /**
     * The failure this catches is the WAF refusing us: without the compatibility
     * profile the route answers bad_client, and nothing draws.
     *
     * Scoped to OUR error row — its Dismiss button — not to `getByRole('alert')`.
     * Playwright pierces shadow roots, so the global query also matches the
     * Next.js dev-tools overlay, which is always present and always empty. That
     * made this check fail on a run where everything worked.
     */
    const errored = await p.getByRole('button', { name: 'Dismiss' }).count()
    check('LIVE: no error surfaced', errored === 0)
    await p.screenshot({ path: join(OUT, 'probe-byok-live.png') })
  }
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

    await structure(p, theme)
    if (theme === 'dark') {
      await p.keyboard.press('Escape')
      await saveAndRead(p)
      await legacyMigration(p)
    }

    check(`${theme}: no runtime errors`, errors.length === 0)
    if (errors.length) console.log('   ', errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // 320px — the tier that has already found a real overflow in this repo.
  const narrow = await browser.newContext({ viewport: { width: 320, height: 568 } })
  const np = await narrow.newPage()
  await np.goto(APP, { waitUntil: 'networkidle' })
  await np.waitForTimeout(1500)
  await openDialog(np)
  const box = await np.getByRole('dialog', { name: 'Your API key' }).boundingBox()
  check('320: the dialog fits the viewport', !!box && box.width <= 320 && box.x >= 0)
  check('320: the dialog is not taller than the screen', !!box && box.height <= 568)
  await np.screenshot({ path: join(OUT, 'probe-byok-320.png') })
  await narrow.close()

  if (LIVE) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: 'networkidle' })
    await p.waitForTimeout(1500)
    await live(p)
    await ctx.close()
  } else {
    console.log('skip  live checks (set PROBE_LIVE=1 — they spend real money)')
  }

  await browser.close()

  const failed = checks.filter(([, ok]) => !ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
  if (failed.length) {
    for (const [name] of failed) console.log(`  FAIL ${name}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
