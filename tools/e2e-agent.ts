/**
 * End-to-end agent flow. See docs/specs/12-agent-actions.md §10.
 *
 *   AI_PROVIDER=mock npm run dev
 *   npx tsx tools/e2e-agent.ts
 *
 * Deliberately a script against the running app rather than a Playwright test
 * runner: the repo has no runner configured, and adding one to assert two
 * behaviours would be more moving parts than the behaviours. It exits non-zero
 * on failure, so CI can call it exactly like a test.
 *
 * Needs the mock provider — with a real key the model chooses its own actions and
 * these assertions would be testing the model rather than the loop.
 */

import { chromium, type Page } from 'playwright'

const URL = process.env.E2E_URL ?? 'http://localhost:3000'

const CANVAS_HASH = `(() => {
  const c = document.querySelector('canvas')
  return c ? c.toDataURL().length : 0
})()`

const checks: Array<[string, boolean]> = []
const check = (name: string, ok: boolean) => {
  checks.push([name, ok])
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
}

async function instruct(p: Page, text: string) {
  const input = p.getByLabel('Tell the agent what to do')
  await input.fill(text)
  await input.press('Enter')
}

async function main() {
  const browser = await chromium.launch()
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await p.goto(URL, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)

  // ── instruct, watch steps, see the canvas change ──
  const before = (await p.evaluate(CANVAS_HASH)) as number
  await instruct(p, '__agent_parallel make the eyebrows angry')

  const log = p.getByRole('log')
  await log.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  check('the step log appears while working', await log.isVisible().catch(() => false))

  await p.getByText('Done', { exact: true }).waitFor({ timeout: 20_000 }).catch(() => {})
  const after = (await p.evaluate(CANVAS_HASH)) as number
  check('the canvas changed', before !== after)

  // ── one undo reverses the entire session ──
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(500)
  const undone = (await p.evaluate(CANVAS_HASH)) as number
  check('a single undo reverses the whole session', undone === before)

  // ── stopping mid-run leaves a coherent document ──
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  await instruct(p, '__agent_runaway keep going forever')

  const stop = p.getByRole('button', { name: 'Stop' })
  await stop.waitFor({ timeout: 15_000 }).catch(() => {})
  if (await stop.isVisible().catch(() => false)) await stop.click()
  await p.waitForTimeout(1000)

  const afterStop = (await p.evaluate(CANVAS_HASH)) as number
  check('stopping leaves a rendered document', afterStop > 0)
  check('the app is still interactive after a stop', await p.getByRole('toolbar').isVisible())

  await browser.close()

  const failed = checks.filter(([, ok]) => !ok).length
  console.log(failed ? `\n${failed} failing` : '\nagent flow ok')
  process.exit(failed ? 1 : 0)
}

void main()
