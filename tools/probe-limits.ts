/**
 * Focused follow-up probe. Deliberately request-frugal — the previous run hit a
 * 429 after 4 rapid calls, so this paces itself and spends at most ~6 requests.
 *
 * Answers:
 *   1. WHICH quota did we hit — per-minute or per-day? (full error, not truncated)
 *   2. Does disabling thinking fix the 16.6s latency, and at what quality cost?
 *   3. Is flash-lite a better fit (higher RPD) for the same task?
 *
 *   npx tsx tools/probe-limits.ts
 */

import { GoogleGenAI } from '@google/genai'
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const l of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
  if (m) process.env[m[1]!] ??= m[2]!
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const line = (s = '') => console.log(s)
const rule = (t: string) => line(`\n${'-'.repeat(66)}\n${t}\n${'-'.repeat(66)}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const ART = ['..1111..', '.122221.', '12322321', '12222221', '12233221', '.122221.', '..1111..', '........']
const PALETTE: Record<string, string> = { '1': '#2d1b00', '2': '#f4c430', '3': '#1a1a2e' }

function renderRuled(rows: string[], scale = 32): string {
  const w = rows[0]!.length, h = rows.length
  const png = new PNG({ width: w * scale, height: h * scale })
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
    const i = (png.width * y + x) << 2
    png.data[i] = parseInt(hex.slice(1, 3), 16); png.data[i + 1] = parseInt(hex.slice(3, 5), 16)
    png.data[i + 2] = parseInt(hex.slice(5, 7), 16); png.data[i + 3] = 255
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const hex = PALETTE[rows[y]![x]!] ?? '#ffffff'
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(x * scale + dx, y * scale + dy, hex)
  }
  for (let x = 0; x <= w; x++) for (let y = 0; y < png.height; y++) put(x * scale, y, x % 4 === 0 ? '#666666' : '#cccccc')
  for (let y = 0; y <= h; y++) for (let x = 0; x < png.width; x++) put(x, y * scale, y % 4 === 0 ? '#666666' : '#cccccc')
  return PNG.sync.write(png).toString('base64')
}

const gridText = ['CANVAS 8 wide x 8 tall. Rows top to bottom.', '', '    01234567',
  ...ART.map((r, i) => `${String(i).padStart(2)} | ${r}`), '',
  'PALETTE (character = colour):', '  . = transparent', '  1 = #2d1b00  (outline)',
  '  2 = #f4c430  (skin)', '  3 = #1a1a2e  (eye)', '', 'Next available index if you add a colour: 4'].join('\n')

const SYSTEM = `You are a pixel-art editing assistant. You edit an existing artwork by emitting a list of
structured operations. You never produce or return images.

You receive a rendered PNG with a grid, and a text grid of one character per pixel. Use the image for
meaning and the text grid for exact coordinates. x increases right from 0, y increases down from 0.

Operations you may emit:
  set_pixels        px: [[x, y, index], ...]
  draw_line         x1, y1, x2, y2, i
  draw_rect         x, y, w, h, i, fill
  flood_fill        x, y, i
  replace_color     from, to
  add_palette_color c

Emit the smallest set of operations that carries out the instruction. Preserve everything else.
Respect the canvas bounds. Return a one-sentence past-tense summary and the operations.`

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['set_pixels', 'draw_line', 'draw_rect', 'flood_fill', 'replace_color', 'add_palette_color'] },
          px: { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
          x: { type: 'integer' }, y: { type: 'integer' },
          x1: { type: 'integer' }, y1: { type: 'integer' },
          x2: { type: 'integer' }, y2: { type: 'integer' },
          w: { type: 'integer' }, h: { type: 'integer' }, i: { type: 'integer' },
          from: { type: 'integer' }, to: { type: 'integer' },
          fill: { type: 'boolean' }, c: { type: 'string' },
        },
        required: ['op'],
      },
    },
  },
  required: ['summary', 'operations'],
}

const img = renderRuled(ART)

async function runTask(model: string, thinkingBudget: number | undefined, label: string) {
  const t = Date.now()
  try {
    const cfg: Record<string, unknown> = {
      systemInstruction: SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 4000,
    }
    if (thinkingBudget !== undefined) cfg.thinkingConfig = { thinkingBudget }

    const r = await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: img } },
          { text: `${gridText}\n\nINSTRUCTION: make it angrier\n\nEmit operations that carry out this instruction. Change as little as possible.` },
        ],
      }],
      config: cfg as never,
    })
    const ms = Date.now() - t
    const u = r.usageMetadata as Record<string, number> | undefined
    const parsed = JSON.parse(r.text ?? '{}')

    let oob = 0, touched = 0
    const ys: number[] = []
    const chk = (x: number, y: number) => { touched++; ys.push(y); if (x < 0 || y < 0 || x > 7 || y > 7) oob++ }
    for (const op of parsed.operations ?? []) {
      if (op.op === 'set_pixels') for (const p of op.px ?? []) chk(p[0], p[1])
      if (op.op === 'draw_line') { chk(op.x1, op.y1); chk(op.x2, op.y2) }
      if (op.op === 'flood_fill') chk(op.x, op.y)
    }
    const upper = ys.filter((y) => y <= 3).length

    line(`\n${label}`)
    line(`  latency   ${ms}ms`)
    line(`  thinking  ${u?.thoughtsTokenCount ?? 0} tokens   total ${u?.totalTokenCount ?? 0}`)
    line(`  summary   ${parsed.summary}`)
    line(`  ops       ${JSON.stringify(parsed.operations)}`)
    line(`  bounds    ${touched - oob}/${touched} valid` + (oob ? '  <-- OUT OF BOUNDS' : ''))
    line(`  targeting ${upper}/${ys.length || 1} in brow region`)
    return true
  } catch (e) {
    const msg = String((e as Error).message)
    line(`\n${label}\n  FAILED`)
    line(msg.slice(0, 1200))
    return false
  }
}

async function main() {
  rule('WAITING 65s FOR THE PER-MINUTE WINDOW TO CLEAR')
  await sleep(65_000)

  rule('A. gemini-flash-latest, THINKING DISABLED')
  await runTask('gemini-flash-latest', 0, 'flash-latest / thinkingBudget=0')

  await sleep(20_000)

  rule('B. gemini-flash-lite-latest, THINKING DISABLED')
  await runTask('gemini-flash-lite-latest', 0, 'flash-lite-latest / thinkingBudget=0')

  await sleep(20_000)

  rule('C. FULL QUOTA ERROR — burst until 429, print it whole')
  for (let n = 1; n <= 12; n++) {
    try {
      await ai.models.generateContent({ model: 'gemini-flash-latest', contents: 'hi' })
      line(`  ${n}: ok`)
    } catch (e) {
      line(`  ${n}: 429 — full error follows:\n`)
      line(String((e as Error).message))
      break
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
