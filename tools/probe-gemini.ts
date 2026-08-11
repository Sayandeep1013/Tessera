/**
 * Capability probe for the configured Gemini key.
 *
 * Resolves a LIVE model from the key's own model list rather than hard-coding
 * one — Google retires model ids for new keys without warning (gemini-2.5-flash
 * is already closed to new users), so a hard-coded id is a 404 waiting to happen.
 *
 *   npx tsx tools/probe-gemini.ts
 */

import { GoogleGenAI } from '@google/genai'
import { PNG } from 'pngjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const l of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
  if (m) process.env[m[1]!] ??= m[2]!
}

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1) }
const ai = new GoogleGenAI({ apiKey: KEY })

const line = (s = '') => console.log(s)
const rule = (t: string) => line(`\n${'-'.repeat(66)}\n${t}\n${'-'.repeat(66)}`)

/** Newest-first preference. Aliases first — they never 404. */
const PREFERENCE = [
  'gemini-flash-latest',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-pro-latest',
]

const ART = [
  '..1111..',
  '.122221.',
  '12322321',
  '12222221',
  '12233221',
  '.122221.',
  '..1111..',
  '........',
]
const PALETTE: Record<string, string> = { '1': '#2d1b00', '2': '#f4c430', '3': '#1a1a2e' }

function renderRuled(rows: string[], scale = 32): string {
  const w = rows[0]!.length, h = rows.length
  const png = new PNG({ width: w * scale, height: h * scale })
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
    const i = (png.width * y + x) << 2
    png.data[i] = parseInt(hex.slice(1, 3), 16)
    png.data[i + 1] = parseInt(hex.slice(3, 5), 16)
    png.data[i + 2] = parseInt(hex.slice(5, 7), 16)
    png.data[i + 3] = 255
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const hex = PALETTE[rows[y]![x]!] ?? '#ffffff'
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) put(x * scale + dx, y * scale + dy, hex)
    }
  for (let x = 0; x <= w; x++)
    for (let y = 0; y < png.height; y++) put(x * scale, y, x % 4 === 0 ? '#666666' : '#cccccc')
  for (let y = 0; y <= h; y++)
    for (let x = 0; x < png.width; x++) put(x, y * scale, y % 4 === 0 ? '#666666' : '#cccccc')
  return PNG.sync.write(png).toString('base64')
}

const gridText = [
  'CANVAS 8 wide x 8 tall. Rows top to bottom.',
  '',
  '    01234567',
  ...ART.map((r, i) => `${String(i).padStart(2)} | ${r}`),
  '',
  'PALETTE (character = colour):',
  '  . = transparent',
  '  1 = #2d1b00  (outline)',
  '  2 = #f4c430  (skin)',
  '  3 = #1a1a2e  (eye)',
  '',
  'Next available index if you add a colour: 4',
].join('\n')

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

const LOOSE_SCHEMA = {
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
          w: { type: 'integer' }, h: { type: 'integer' },
          i: { type: 'integer' },
          from: { type: 'integer' }, to: { type: 'integer' },
          fill: { type: 'boolean' },
          c: { type: 'string' },
        },
        required: ['op'],
      },
    },
  },
  required: ['summary', 'operations'],
}

async function main() {
  rule('1. MODELS EXPOSED TO THIS KEY')
  const available = new Set<string>()
  try {
    for await (const m of await ai.models.list()) {
      const n = ((m as { name?: string }).name ?? '').replace('models/', '')
      const acts = (m as { supportedActions?: string[] }).supportedActions ?? []
      if (!acts.length || acts.includes('generateContent')) available.add(n)
    }
    line(`${available.size} models expose generateContent`)
  } catch (e) {
    line(`FAILED to list: ${(e as Error).message}`); process.exit(1)
  }

  rule('2. RESOLVING A WORKING MODEL')
  let model = ''
  for (const cand of PREFERENCE) {
    if (!available.has(cand)) { line(`  ${cand.padEnd(28)} not offered`); continue }
    try {
      const r = await ai.models.generateContent({ model: cand, contents: 'Reply with exactly: OK' })
      line(`  ${cand.padEnd(28)} WORKS -> ${JSON.stringify(r.text?.trim().slice(0, 20))}`)
      model = cand
      break
    } catch (e) {
      line(`  ${cand.padEnd(28)} ${String((e as Error).message).slice(0, 90)}`)
    }
  }
  if (!model) { line('\nNo usable model found.'); process.exit(1) }
  line(`\nSELECTED: ${model}`)

  rule('3. THE REAL TASK - vision + ruled grid + forced JSON')
  const img = renderRuled(ART)
  line(`context image: ${Math.round(img.length / 1024)}KB base64`)
  const t = Date.now()
  try {
    const r = await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: img } },
          { text: `${gridText}\n\nINSTRUCTION: make it angrier\n\nEmit operations that carry out this instruction. Change as little as possible.` },
        ],
      }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: LOOSE_SCHEMA as never,
        temperature: 0.4,
        maxOutputTokens: 4000,
      },
    })
    line(`OK (${Date.now() - t}ms)`)
    line(`usage: ${JSON.stringify(r.usageMetadata)}`)
    const parsed = JSON.parse(r.text ?? '{}')
    line(`\nsummary: ${parsed.summary}`)
    line(`operations (${parsed.operations?.length ?? 0}):`)
    for (const op of parsed.operations ?? []) line(`   ${JSON.stringify(op)}`)

    let oob = 0, touched = 0
    const chk = (x: number, y: number) => { touched++; if (x < 0 || y < 0 || x > 7 || y > 7) oob++ }
    for (const op of parsed.operations ?? []) {
      if (op.op === 'set_pixels') for (const p of op.px ?? []) chk(p[0], p[1])
      if (op.op === 'draw_line') { chk(op.x1, op.y1); chk(op.x2, op.y2) }
      if (op.op === 'draw_rect') { chk(op.x, op.y); chk(op.x + op.w - 1, op.y + op.h - 1) }
      if (op.op === 'flood_fill') chk(op.x, op.y)
    }
    line(`\ncoordinate check: ${touched - oob}/${touched} in bounds${oob ? `  <-- ${oob} OUT OF BOUNDS` : '  (all valid)'}`)

    const ys: number[] = []
    for (const op of parsed.operations ?? []) {
      if (op.op === 'set_pixels') for (const p of op.px ?? []) ys.push(p[1])
      if (op.op === 'draw_line') ys.push(op.y1, op.y2)
    }
    if (ys.length) {
      const upper = ys.filter((y) => y <= 3).length
      line(`targeting: ${upper}/${ys.length} edits in the upper half (brow/eye region)`)
    }
  } catch (e) {
    line(`FAILED: ${(e as Error).message}`)
  }

  rule('4. RATE LIMIT REALITY CHECK - 8 rapid requests')
  let ok = 0
  for (let n = 1; n <= 8; n++) {
    const s = Date.now()
    try {
      await ai.models.generateContent({ model, contents: 'say hi' })
      ok++
      line(`  ${n}: ok (${Date.now() - s}ms)`)
    } catch (e) {
      line(`  ${n}: FAIL ${String((e as Error).message).slice(0, 150)}`)
      break
    }
  }

  rule('VERDICT')
  line(`model:          ${model}`)
  line(`rapid requests: ${ok}/8 succeeded`)
  line(ok >= 8 ? 'Rate limits are not an obstacle at our usage pattern.' : `Limit hit after ${ok}.`)
}

main().catch((e) => { console.error('\nprobe crashed:', e); process.exit(1) })
