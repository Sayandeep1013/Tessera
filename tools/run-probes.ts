/**
 * Run every browser probe against a running dev server, in one command.
 *
 *   npm run probes                      # against localhost:3000
 *   APP_URL=http://localhost:3100 npm run probes
 *
 * **Why this exists.** The finishing protocol in `docs/UNITS.md §0` said "run the
 * probes your unit touched", which requires knowing which ones your unit
 * touched. B1 renamed a File-menu item and broke `probe-layers` and
 * `probe-zoom` — neither of which is about the File menu. Nobody would have
 * chosen to run them. A discipline that depends on guessing the blast radius is
 * not a discipline; a single command is.
 *
 * `npm test` still cannot do this: every probe here drives a real browser
 * against a real dev server, which is the standing gap in HANDOFF §11. This is
 * the other half of the answer — `lib/__tests__/probe-handles.test.ts` catches
 * the cheap failure (a probe naming an element that no longer exists) in CI, and
 * this catches the rest before a unit is called done.
 *
 * Excluded on purpose: anything that spends real model quota
 * (`probe-agent`, `probe-gemini`, `check-quota`) and the one-shot
 * inspect/extract/generate scripts. Those are deliberate acts, not a suite.
 */

import { spawnSync } from 'node:child_process'

const APP = process.env.APP_URL ?? 'http://localhost:3000'

type Probe = {
  file: string
  what: string
  /** false = it reports rather than gates; its exit code is not a verdict. */
  gates?: boolean
  /**
   * Needs the DEV SERVER started with `AI_PROVIDER=mock`, not the probe process.
   *
   * The agent runs server-side, so `AI_PROVIDER=mock npx tsx tools/probe-…`
   * sets it on the wrong process: the server still reads `.env.local`, still
   * has a real key, and the probe quietly spends the project's 5-per-minute
   * budget before failing on wording it never asked the model for. That is
   * exactly what happened the first time this runner ran, and it is the same
   * mistake already recorded in HANDOFF §11 for the E2E script.
   *
   * So these are SKIPPED unless you say the server is in mock mode. Skipping
   * loudly beats spending quota by accident.
   */
  needsMockServer?: boolean
}

/** Set when you started the dev server with AI_PROVIDER=mock. */
const MOCK_SERVER = process.env.MOCK_SERVER === '1'

const PROBES: Probe[] = [
  { file: 'check-responsive.ts', what: 'overflow + target size at 6 viewports', gates: true },
  { file: 'probe-file-menu.ts', what: 'File menu: structure, submenu, confirms, phones', gates: true },
  { file: 'probe-canvas-size.ts', what: 'Canvas tab: presets, crop count, undo, phones', gates: true },
  { file: 'probe-code-panel.ts', what: 'code panel: both sync directions, errors, sheet', gates: true },
  { file: 'probe-export.ts', what: 'exporters: six formats, real downloads, the CSS cap', gates: true },
  { file: 'probe-symmetry.ts', what: 'the symmetry axis line: h, v, both, off', gates: true },
  { file: 'probe-layers.ts', what: 'layer panel, both themes', gates: true },
  { file: 'probe-tools-ui.ts', what: 'all 8 tools with real pointer events', gates: true },
  { file: 'probe-tooltip.ts', what: 'tooltip appears, places, dismisses', gates: true },
  { file: 'probe-crisp.ts', what: 'pixel edges stay crisp', gates: true },
  {
    file: 'probe-agent-ui.ts',
    what: 'agent panel geometry + outcome wording',
    gates: true,
    needsMockServer: true,
  },
  {
    file: 'e2e-agent.ts',
    what: 'agent flow end to end',
    gates: true,
    needsMockServer: true,
  },
  { file: 'probe-zoom.ts', what: 'zoom gesture smoothness — READ the verdict', gates: false },
]

/**
 * Is anything there, and is it us?
 *
 * HANDOFF §5: a different project once owned port 3000, and every probe went to
 * it, got a redirect to a login page, and failed with "waiting for
 * locator('canvas')" — which reads exactly like a broken app. Half an hour went
 * into that. One fetch answers it.
 */
async function checkServer(): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(APP, { redirect: 'follow' })
  } catch {
    return `nothing is answering on ${APP}.\n` +
      `  Start one:  npx next dev --turbopack -p 3100\n` +
      `  Then:       APP_URL=http://localhost:3100 npm run probes`
  }
  const html = await res.text()
  if (!html.includes('Tessera')) {
    return `something is on ${APP}, but it is not this project — no "Tessera" in the ` +
      `response.\n  Check whose it is before killing it (HANDOFF §5), then run on ` +
      `another port with APP_URL.`
  }
  return null
}

async function main() {
  const problem = await checkServer()
  if (problem) {
    console.error(`\n${problem}\n`)
    process.exit(1)
  }
  console.log(`\nProbing ${APP}\n`)

  const results: Array<{ probe: Probe; code: number | null }> = []

  for (const probe of PROBES) {
    if (probe.needsMockServer && !MOCK_SERVER) {
      results.push({ probe, code: null })
      continue
    }
    console.log(`\n${'─'.repeat(72)}\n▶ ${probe.file} — ${probe.what}\n`)
    const r = spawnSync('npx', ['tsx', `tools/${probe.file}`], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, APP_URL: APP },
    })
    results.push({ probe, code: r.status ?? 1 })
  }

  console.log(`\n${'═'.repeat(72)}\n`)
  let failed = 0
  let skipped = 0
  for (const { probe, code } of results) {
    const gating = probe.gates !== false
    if (code === null) {
      skipped++
      console.log(`skip  ${probe.file} — needs a mock-mode dev server`)
      continue
    }
    if (gating && code !== 0) failed++
    const mark = !gating ? 'read' : code === 0 ? 'ok  ' : 'FAIL'
    console.log(`${mark}  ${probe.file}${!gating || code === 0 ? '' : ` (exit ${code})`}`)
  }

  const ran = results.length - skipped
  console.log(
    failed
      ? `\n${failed} probe${failed === 1 ? '' : 's'} failing.`
      : `\n${ran} probes run, all gating probes green. ` +
        `probe-zoom reports rather than gates — read its verdict.`,
  )
  if (skipped) {
    console.log(
      `\n${skipped} skipped because the agent runs SERVER-side, so the mock has to be\n` +
      `set on the server, not on the probe. To include them:\n` +
      `  AI_PROVIDER=mock npx next dev --turbopack -p 3100\n` +
      `  MOCK_SERVER=1 APP_URL=http://localhost:3100 npm run probes`,
    )
  }
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
