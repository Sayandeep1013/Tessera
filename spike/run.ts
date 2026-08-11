/**
 * Phase 0 probe matrix. See docs/specs/06-ai-protocol.md §10.
 *
 * Runs the instruction set against a starter sprite, writes a before | after |
 * diff strip per run, and an index at spike/out/results.md for a HUMAN to score.
 *
 * Deliberately does not self-score: an earlier coordinate heuristic marked a
 * correct frown as 0/12 because it expected eyebrows. Machine metrics here are
 * descriptive (bounds, counts, latency), never a verdict.
 *
 *   npx tsx spike/run.ts            # 9 runs, face sprite
 *   npx tsx spike/run.ts --only 3   # just probe #3
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { loadStarter } from '../lib/artwork-core/create'
import { serializeDoc } from '../lib/artwork-core/codec'
import { describeDiff, diffCounts } from '../lib/artwork-core/diff'
import { buildContext, buildUserText } from '../lib/ai/context'
import { SYSTEM_PROMPT } from '../lib/ai/prompt'
import { schemaFor } from '../lib/ai/opSchema'
import { validateResponse } from '../lib/ai/validate'
import { getProvider } from '../lib/ai/provider/index'
import { renderDoc, renderDiff, strip } from './render'

// ── env ─────────────────────────────────────────────────────────────────────
try {
  for (const l of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
    if (m) process.env[m[1]!] ??= m[2]!
  }
} catch {
  /* no .env.local — provider will report a config error */
}

const OUT = join(process.cwd(), 'spike', 'out')
mkdirSync(OUT, { recursive: true })

const PROBES = [
  { id: '01', slug: 'angrier', instruction: 'make it angrier', cls: 'expression' },
  { id: '02', slug: 'happier', instruction: 'make it happier', cls: 'expression' },
  { id: '03', slug: 'outline-black', instruction: 'make the outline black', cls: 'recolour' },
  { id: '04', slug: 'eyes-blue', instruction: 'change the eyes to blue', cls: 'targeted recolour' },
  { id: '05', slug: 'add-hat', instruction: 'add a hat', cls: 'add object' },
  { id: '06', slug: 'remove-mouth', instruction: 'remove the mouth', cls: 'remove object' },
  { id: '07', slug: 'add-shadow', instruction: 'add a shadow under the chin', cls: 'add detail' },
  { id: '08', slug: 'night', instruction: 'make it night', cls: 'atmosphere' },
  { id: '09', slug: 'gameboy', instruction: 'turn it into a Game Boy palette', cls: 'palette swap' },
]

/** 5 rpm free-tier ceiling — 13s keeps us clear with margin. */
const PACE_MS = 13_000
const SCALE = 16
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type RunResult = {
  id: string
  slug: string
  instruction: string
  cls: string
  status: 'ok' | 'rejected' | 'error'
  summary?: string
  detail?: string
  opCount?: number
  counts?: ReturnType<typeof diffCounts>
  latencyMs?: number
  tokens?: string
  image?: string
}

async function main() {
  const onlyArg = process.argv.indexOf('--only')
  const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : null
  const probes = only ? PROBES.filter((p) => p.id === only.padStart(2, '0')) : PROBES

  const provider = getProvider()
  const doc = loadStarter('face')

  console.log(`provider: ${provider.id}`)
  try {
    console.log(`model:    ${await provider.model()}`)
  } catch (e) {
    console.error(`\nCannot resolve a model: ${(e as Error).message}`)
    process.exit(1)
  }
  console.log(`sprite:   face ${doc.w}x${doc.h}, ${doc.palette.length} colours`)
  console.log(`probes:   ${probes.length}, paced at ${PACE_MS / 1000}s\n`)

  // Reference images, written once.
  writeFileSync(join(OUT, 'before.png'), PNG.sync.write(renderDoc(doc, 0, SCALE)))
  writeFileSync(join(OUT, 'context.png'), Buffer.from(buildContext(doc, 0).png, 'base64'))

  const results: RunResult[] = []
  const ctx = buildContext(doc, 0)

  for (const [n, probe] of probes.entries()) {
    process.stdout.write(`[${probe.id}] ${probe.instruction.padEnd(34)}`)

    const call = () =>
      provider.generate({
        systemPrompt: SYSTEM_PROMPT,
        imagePngBase64: ctx.png,
        userText: buildUserText(doc, 0, probe.instruction),
        jsonSchema: schemaFor(provider.schemaFlavour),
        maxOutputTokens: 8000,
      })

    let res = await call()

    // Honour a rate limit once rather than burning the probe on it.
    if (!res.ok && res.kind === 'rate_limited') {
      const waitMs = (res.retryAfterMs ?? 20_000) + 1000
      process.stdout.write(`rate limited, waiting ${Math.ceil(waitMs / 1000)}s... `)
      await sleep(waitMs)
      res = await call()
    }

    if (!res.ok) {
      console.log(`${res.kind}: ${res.message.slice(0, 80)}`)
      results.push({ ...probe, status: 'error', detail: `${res.kind}: ${res.message}` })
      await sleep(PACE_MS)
      continue
    }

    const v = validateResponse(res.raw, doc, 0)
    if (!v.ok) {
      console.log(`rejected (${v.error.code})`)
      results.push({
        ...probe,
        status: 'rejected',
        detail: `${v.error.code}: ${v.error.message}`,
        latencyMs: res.latencyMs,
      })
      await sleep(PACE_MS)
      continue
    }

    const p = v.value
    const counts = diffCounts(p.diff)
    const file = `${probe.id}-${probe.slug}.png`
    writeFileSync(
      join(OUT, file),
      strip([
        renderDoc(doc, 0, SCALE),
        renderDoc(p.preview, 0, SCALE),
        renderDiff(p.preview, 0, p.diff, SCALE),
      ]),
    )
    writeFileSync(join(OUT, `${probe.id}-${probe.slug}.tessera.json`), serializeDoc(p.preview))

    console.log(`ok   ${describeDiff(p.diff).padEnd(24)} ${res.latencyMs}ms`)
    results.push({
      ...probe,
      status: 'ok',
      summary: p.summary,
      opCount: p.ops.length,
      counts,
      latencyMs: res.latencyMs,
      tokens: res.usage ? `${res.usage.totalTokens ?? '?'}` : undefined,
      image: file,
    })

    if (n < probes.length - 1) await sleep(PACE_MS)
  }

  writeFileSync(join(OUT, 'results.md'), report(results))
  console.log(`\nWrote ${join(OUT, 'results.md')}`)
  console.log(`${results.filter((r) => r.status === 'ok').length}/${results.length} produced an edit to judge.`)
}

function report(rows: RunResult[]): string {
  const ok = rows.filter((r) => r.status === 'ok')
  const lines = [
    '# Phase 0 — probe results',
    '',
    `Sprite: **face** (16x16). Runs: **${rows.length}**. Produced an edit: **${ok.length}**.`,
    '',
    'Each strip is **BEFORE | AFTER | DIFF**. In the diff panel:',
    'green = pixel added, amber = pixel changed, red = pixel cleared.',
    '',
    '## How to score',
    '',
    'For each probe, reply with one word:',
    '',
    '| Word | Means |',
    '|---|---|',
    '| `pass` | I would accept this edit if I had asked for it |',
    '| `weak` | Right idea, clumsy execution |',
    '| `fail` | Wrong region, garbled, or nothing meaningfully changed |',
    '',
    '**Gate: 6 or more `pass` out of 9.**',
    '',
    'The counts below are descriptive only — they are not a verdict. An earlier',
    'automated heuristic scored a correct frown as 0/12 because it expected',
    'eyebrows, which is exactly why this call is yours.',
    '',
    '---',
    '',
  ]

  for (const r of rows) {
    lines.push(`## ${r.id} — "${r.instruction}"`)
    lines.push('')
    lines.push(`*${r.cls}*`)
    lines.push('')
    if (r.status === 'ok') {
      lines.push(`![${r.slug}](./${r.image})`)
      lines.push('')
      lines.push(`> ${r.summary}`)
      lines.push('')
      lines.push(
        `\`${r.opCount}\` ops · \`+${r.counts!.added} ~${r.counts!.changed} -${r.counts!.removed}\`` +
          (r.counts!.palette ? ` · ${r.counts!.palette} new colour(s)` : '') +
          ` · ${r.latencyMs}ms` +
          (r.tokens ? ` · ${r.tokens} tokens` : ''),
      )
    } else if (r.status === 'rejected') {
      lines.push(`**Rejected by the validator** — nothing was applied.`)
      lines.push('')
      lines.push(`\`${r.detail}\``)
    } else {
      lines.push(`**Provider error.**`)
      lines.push('')
      lines.push(`\`${r.detail}\``)
    }
    lines.push('')
    lines.push('Score: `____`')
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
