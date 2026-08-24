/**
 * AI quality eval. See docs/specs/19-ai-quality-eval.md.
 *
 *   AI_PROVIDER=anthropic npx next dev --turbopack -p 3100
 *   EVAL_URL=http://localhost:3100 npx tsx tools/eval-ai.ts          # all 15
 *   EVAL_URL=http://localhost:3100 npx tsx tools/eval-ai.ts L1 C1    # a subset
 *
 * Drives the REAL app through Playwright rather than calling the runner directly:
 * what gets rated has to be what a user would actually get, context builder,
 * validator, registry, store and all.
 *
 * THIS SPENDS REAL MONEY. One scenario is one agent session. The subset argument
 * exists so that iterating on one failing scenario does not re-run the fourteen
 * that already pass; cumulative token usage is printed after every run.
 *
 * Dimensions 3, 5 and 6 of the rubric are computed here. Dimensions 1, 2 and 4
 * need a human (or an agent with eyes) to open the PNG — §3 is explicit that a run
 * which was not looked at is not a score.
 */

import { chromium, type Page } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.env.EVAL_URL ?? process.env.APP_URL ?? 'http://localhost:3100'
const HEADED = process.env.EVAL_HEADED === '1'
const OUT_ROOT = join(process.cwd(), 'docs', 'eval')
const STARTERS = join(process.cwd(), 'lib', 'artwork-core', 'fixtures', 'starters')

// ─── the key, from the environment only ──────────────────────────────────────

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const line = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`))
    return line?.slice(name.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}

const API_KEY = env('ANTHROPIC_API_KEY') ?? env('AGENTROUTER_API_KEY')
const BASE_URL = env('ANTHROPIC_BASE_URL') ?? env('AGENTROUTER_BASE_URL') ?? 'https://agentrouter.org'
const MODEL = env('ANTHROPIC_MODEL') ?? 'claude-opus-5'
const PROFILE = BASE_URL.includes('agentrouter') ? 'claude-code' : 'standard'

// ─── starting documents ──────────────────────────────────────────────────────

const starter = (name: string) => readFileSync(join(STARTERS, `${name}.tessera.json`), 'utf8')

const empty = (n: number) =>
  JSON.stringify({
    v: 1,
    id: `eval-empty-${n}`,
    name: `empty ${n}`,
    w: n,
    h: n,
    palette: [{ c: 'transparent' }],
    frames: [{ ms: 100, layers: [{ n: 'base', px: Array.from({ length: n }, () => '.'.repeat(n)) }] }],
    // Required by the schema, not optional. Omitting it made parseDoc reject every
    // blank canvas and took out 8 of the 15 scenarios on the first full run.
    meta: { createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z' },
  })

// ─── the suite (§2) ──────────────────────────────────────────────────────────

type Scenario = {
  id: string
  axis: string
  doc: () => string
  instruction: string
  failsIf: string
}

const SCENARIOS: Scenario[] = [
  { id: 'S1', axis: 'synthesis', doc: () => empty(16), instruction: 'Draw a red heart in the middle.', failsIf: 'not recognisable, not centred, asymmetric halves' },
  { id: 'S2', axis: 'synthesis', doc: () => empty(16), instruction: 'Draw a smiling yellow sun with rays.', failsIf: 'no disc, or rays read as noise' },
  { id: 'S3', axis: 'synthesis', doc: () => empty(32), instruction: 'Draw a tree: brown trunk, green leafy canopy, on grass.', failsIf: 'parts unidentifiable, trunk detached, canopy a flat rectangle' },
  { id: 'S4', axis: 'synthesis', doc: () => empty(32), instruction: 'Draw a red apple with a highlight and a shadow so it looks round.', failsIf: 'flat fill with no light logic' },

  { id: 'L1', axis: 'localisation', doc: () => starter('face'), instruction: 'Make the eyebrows angry.', failsIf: 'eyebrows unchanged, or anything else touched' },
  { id: 'L2', axis: 'localisation', doc: () => starter('face'), instruction: 'Give it a hat.', failsIf: 'hat floats, overlaps the face, or clashes with outline weight' },
  { id: 'L3', axis: 'preservation', doc: () => starter('bird'), instruction: 'Remove the beak.', failsIf: 'leaves a hole in the outline, or removes head' },
  { id: 'L4', axis: 'localisation', doc: () => starter('bird'), instruction: 'Give it a red collar and make its eye green.', failsIf: 'only one of the two lands' },

  { id: 'C1', axis: 'colour', doc: () => starter('bird'), instruction: 'Change the body from blue to purple.', failsIf: 'recolours wing or belly too, or enumerates pixels' },
  { id: 'C2', axis: 'colour', doc: () => starter('bird'), instruction: "Shade the underside of the body with a darker version of its own colour.", failsIf: 'unrelated hue, or blows the colour budget' },

  { id: 'G1', axis: 'geometry', doc: () => empty(16), instruction: 'Draw a 1-pixel border around the entire canvas edge.', failsIf: 'a gap, a doubled corner, or inset by one' },
  { id: 'G2', axis: 'geometry', doc: () => empty(16), instruction: 'Draw a butterfly with both wings exactly mirrored.', failsIf: 'wings differ by even one pixel' },

  { id: 'J1', axis: 'judgement', doc: () => empty(16), instruction: 'Draw a photorealistic portrait of a specific person.', failsIf: 'produces mush and calls it done' },
  { id: 'J2', axis: 'judgement', doc: () => starter('face'), instruction: 'Make the background transparent.', failsIf: 'thrashes, or claims a change it did not make' },
  { id: 'J3', axis: 'judgement', doc: () => empty(16), instruction: 'Draw a line from (0,0) to (40,40).', failsIf: 'burns the budget retrying a rejected call' },
]

// ─── computed dimensions (§3) ────────────────────────────────────────────────

type Result = {
  id: string
  axis: string
  instruction: string
  failsIf: string
  ok: boolean
  error?: string
  summary: string
  steps: string[]
  turns: number
  latencyMs: number
  /** Destructive actions the harness had to approve. */
  confirms: number
  /** Pixels that differ between the starting and finishing documents. */
  changed: number
  /** Of the pixels that were NOT transparent at the start, how many were altered. */
  disturbed: number
  paletteBefore: number
  paletteAfter: number
  before: string
  after: string
}

/**
 * The COMPOSITE, one character per pixel — what the user actually sees.
 *
 * The first version of this joined every layer's rows together, and L2 ("give it
 * a hat") reported 257 pixels changed on a 256-pixel canvas: the agent had put the
 * hat on a NEW layer, which shifted the whole concatenation and read as total
 * destruction. Preservation is a claim about the visible artwork, so it has to be
 * measured on the visible artwork. Mirrors compositeAt() in artwork-core/layers.ts.
 */
function pixels(json: string): string[] {
  const d = JSON.parse(json) as {
    w: number
    h: number
    palette: Array<{ c: string }>
    frames: Array<{ layers: Array<{ px: string[]; hidden?: boolean }> }>
  }
  const layers = d.frames[0]!.layers
  // Character -> palette index, the codec's own mapping.
  const indexOf = (ch: string) =>
    ch === '.' ? 0 : ch >= '1' && ch <= '9' ? Number(ch) : ch.charCodeAt(0) - 87

  const out: string[] = []
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      let ch = '.'
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i]!
        if (layer.hidden) continue
        const c = layer.px[y]?.[x] ?? '.'
        if (c !== '.') { ch = c; break }
      }
      // RESOLVED THROUGH THE PALETTE, not the raw character. A palette recolour
      // moves no index, so a character-wise diff reported scenario C1 as "0 px
      // changed" on a bird that had visibly turned purple — the same blind spot
      // the app itself had in lib/agent/session.ts, in the measuring instrument.
      out.push(ch === '.' ? 'transparent' : (d.palette[indexOf(ch)]?.c ?? 'transparent'))
    }
  }
  return out
}

function paletteSize(json: string): number {
  return (JSON.parse(json) as { palette: unknown[] }).palette.length
}

function diff(before: string, after: string): { changed: number; disturbed: number } {
  const a = pixels(before)
  const b = pixels(after)
  let changed = 0
  let disturbed = 0
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue
    changed++
    // A cell that held artwork and no longer holds the same thing is the
    // preservation signal — new pixels on empty canvas are not damage.
    if (a[i] && a[i] !== 'transparent') disturbed++
  }
  return { changed, disturbed }
}

// ─── driving one scenario ────────────────────────────────────────────────────

const READ_SOURCE = `(() => window.__tessera?.source?.() ?? null)()`

async function run(page: Page, s: Scenario, turns: { n: number }): Promise<Result> {
  turns.n = 0
  const doc = s.doc()

  const loaded = await page.evaluate(
    `(() => window.__tessera?.open?.(${JSON.stringify(doc)}) ?? false)()`,
  )
  if (!loaded) throw new Error(`${s.id}: the starting document was rejected`)
  await page.waitForTimeout(300)

  const before = (await page.evaluate(READ_SOURCE)) as string

  /**
   * Destructive actions (clear_layer, new_document, delete_layer) block the loop on
   * a confirmation the user has to click. Nothing clicked it on the first clean
   * run, so S1 sat on one round trip until the timeout — the model had asked to
   * clear the canvas before drawing on it.
   *
   * A person drawing a heart on a blank canvas would say yes, so the harness says
   * yes, and records that it was asked. Refusing here would measure the harness's
   * politeness rather than the model's work.
   */
  let confirms = 0
  const allow = page.getByRole('button', { name: 'Allow' })
  const watchConfirm = setInterval(() => {
    void allow
      .click({ timeout: 1000 })
      .then(() => { confirms++ })
      .catch(() => {})
  }, 1500)

  const input = page.getByLabel('Tell the agent what to do')
  await input.fill(s.instruction)
  const started = Date.now()
  await input.press('Enter')

  // Opus takes its time and a session is several turns. Settle on any terminal
  // state rather than a single selector — an error is a result too.
  /**
   * Settle on EITHER outcome. The first version waited only for the success card,
   * so a session that errored sat there for the full timeout — six failed
   * scenarios burned about seventy-five minutes of wall clock waiting for a card
   * that was never going to render.
   */
  const done = page
    .getByText(/pixels? changed|No changes were made|Nothing to undo|Done/i)
    .first()
  const failed = page.getByRole('button', { name: 'Dismiss' }).first()

  let error = ''
  try {
    /**
     * Measured 24 Aug 2026: G2 finished — full outcome card, "verified as exact
     * pixel mirrors", 0 mirror mismatches confirmed programmatically — and was
     * still marked TIMEOUT, because completion landed right at the 900s edge and
     * Playwright's poll for the outcome text lost the race against the deadline
     * by a few hundred milliseconds. The session was not slow because something
     * was wrong; MAX_STEPS=16 with a bounded-but-real thinking budget on a hard
     * scene (S4 ran 9 turns, several past 3 minutes each) legitimately needs more
     * than 15 minutes of wall clock. 1200s gives real headroom rather than
     * shaving the timeout to the exact edge of what was observed.
     */
    await Promise.race([
      done.waitFor({ timeout: 1_200_000 }),
      failed.waitFor({ timeout: 1_200_000 }),
    ])
    if (await failed.isVisible().catch(() => false)) {
      const panel = await page.getByRole('alert').last().innerText().catch(() => '')
      error = `the session failed: ${panel.split(/\r?\n/)[0] ?? 'unknown'}`
    }
  } catch {
    error = 'timed out waiting for the session to finish'
  }
  const latencyMs = Date.now() - started
  clearInterval(watchConfirm)
  await page.waitForTimeout(600)

  const after = (await page.evaluate(READ_SOURCE)) as string

  // The step log is replaced by the outcome card once a session ends, so the log
  // is read live during the run (see the listener in main) and the card is read
  // here. Counting model turns from the network is exact; counting DOM rows is not.
  const steps = await page
    .getByRole('log')
    .locator('> *')
    .allInnerTexts()
    .catch(() => [] as string[])

  const summary = await page
    .locator('aside, section, div')
    .filter({ hasText: /pixels? changed|No changes were made/ })
    .last()
    .innerText()
    .catch(() => '')

  const { changed, disturbed } = diff(before, after)

  return {
    id: s.id,
    axis: s.axis,
    instruction: s.instruction,
    failsIf: s.failsIf,
    ok: !error && changed > 0,
    ...(error ? { error } : {}),
    summary: summary.trim(),
    steps,
    turns: turns.n,
    latencyMs,
    confirms,
    changed,
    disturbed,
    paletteBefore: paletteSize(before),
    paletteAfter: paletteSize(after),
    before,
    after,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('No ANTHROPIC_API_KEY / AGENTROUTER_API_KEY in the environment or .env.local.')
    process.exit(2)
  }

  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const suite = only.length ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS
  if (!suite.length) {
    console.error(`No scenarios matched ${only.join(', ')}.`)
    process.exit(2)
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = join(OUT_ROOT, runId)
  mkdirSync(outDir, { recursive: true })

  console.log(`eval ${runId} · ${suite.length} scenario(s) · ${MODEL} via ${BASE_URL}`)
  console.log(`out: ${outDir}\n`)

  const browser = await chromium.launch({ headless: !HEADED })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  /**
   * Seed the BYOK config before any script runs, so the app takes the
   * bring-your-own-key path — the same path a member of the public uses. That also
   * means the free-session counter never applies and neither does our own IP rate
   * limit, which is what makes a fifteen-scenario run possible at all.
   */
  await page.addInitScript(
    `window.localStorage.setItem('tessera-api-key', ${JSON.stringify(
      JSON.stringify({
        providerId: 'anthropic',
        apiKey: API_KEY,
        baseUrl: BASE_URL,
        model: MODEL,
        profile: PROFILE,
      }),
    )})`,
  )

  const turns = { n: 0 }
  const spend = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/ai/agent')) turns.n++
  })
  page.on('response', async (r) => {
    if (!r.url().includes('/api/ai/agent')) return
    try {
      const j = (await r.json()) as {
        usage?: {
          inputTokens?: number
          outputTokens?: number
          cacheReadTokens?: number
          cacheWriteTokens?: number
        }
      }
      spend.input += j.usage?.inputTokens ?? 0
      spend.output += j.usage?.outputTokens ?? 0
      spend.cacheRead += j.usage?.cacheReadTokens ?? 0
      spend.cacheWrite += j.usage?.cacheWriteTokens ?? 0
    } catch {
      /* an error response carries no usage */
    }
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const results: Result[] = []
  for (const s of suite) {
    process.stdout.write(`${s.id}  ${s.instruction.slice(0, 52).padEnd(54)}`)
    let r: Result
    try {
      r = await run(page, s, turns)
    } catch (e) {
      console.log(`ERROR  ${(e as Error).message}`)
      continue
    }
    results.push(r)

    await page
      .locator('canvas')
      .first()
      .screenshot({ path: join(outDir, `${s.id}.png`) })
      .catch(() => {})
    writeFileSync(join(outDir, `${s.id}.json`), JSON.stringify(r, null, 2))

    console.log(
      `${r.error ? 'TIMEOUT' : 'ok'}  ${String(r.changed).padStart(4)}px  ` +
        `${r.disturbed ? `${r.disturbed} disturbed  ` : ''}` +
        `${r.confirms ? `${r.confirms} confirm  ` : ''}` +
        `${(r.latencyMs / 1000).toFixed(0)}s  ${r.turns} steps`,
    )

    // The agent panel keeps its log; reload so the next scenario starts clean and
    // its step count means what it says.
    await page.reload({ waitUntil: 'networkidle' })
    // And pause. Running fifteen sessions back to back provoked an upstream 429
    // that the runner then had no retry for — the suite was manufacturing the
    // failure it was measuring.
    await page.waitForTimeout(5000)
  }

  writeFileSync(
    join(outDir, 'index.json'),
    JSON.stringify({ runId, model: MODEL, spend, results }, null, 2),
  )
  await browser.close()

  console.log(`\n${results.length}/${suite.length} completed.`)
  console.log(
    'tokens: ' +
      `${spend.input.toLocaleString()} in / ${spend.output.toLocaleString()} out / ` +
      `${spend.cacheRead.toLocaleString()} cache-read / ${spend.cacheWrite.toLocaleString()} cache-write`,
  )
  console.log(`LOOK AT THE PNGs in ${outDir} — dimensions 1, 2 and 4 are not in the JSON.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
