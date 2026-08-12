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

// APP_URL as well as E2E_URL: every other probe honours APP_URL, and this one
// silently did not — `npm run probes` pointed the whole suite at 3100 and this
// script alone went to 3000 and died on ERR_CONNECTION_REFUSED. E2E_URL still
// wins so any existing invocation keeps working.
const URL = process.env.E2E_URL ?? process.env.APP_URL ?? 'http://localhost:3000'

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
  /**
   * `force`, because the step log is repainting underneath the cursor.
   *
   * The runaway scenario appends a row per step to an aria-live log that sits
   * over the button, so a normal click loses a race against it: Playwright
   * reports "element is not stable", then "<div class=step-row> intercepts
   * pointer events", then "element was detached from the DOM", and finally
   * times out after 30s and takes the whole script down. The button is visible
   * and real the entire time — what fails is the actionability wait, not the
   * control. Found by `npm run probes`; this script had never been run in mock
   * mode, which is the gap HANDOFF §11 recorded and nobody had closed.
   */
  await stop.click({ force: true, timeout: 5_000 }).catch(() => {})
  await p.waitForTimeout(1500)

  // The assertions below are only worth anything if the run actually stopped —
  // without this, a Stop that silently did nothing still "leaves a rendered
  // document".
  check('Stop ends the run', (await stop.count()) === 0)

  const afterStop = (await p.evaluate(CANVAS_HASH)) as number
  check('stopping leaves a rendered document', afterStop > 0)
  check('the app is still interactive after a stop', await p.getByRole('toolbar').isVisible())

  await browser.close()

  const failed = checks.filter(([, ok]) => !ok).length
  console.log(failed ? `\n${failed} failing` : '\nagent flow ok')
  process.exit(failed ? 1 : 0)
}

void main()
