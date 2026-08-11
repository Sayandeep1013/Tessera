/**
 * Corrected-configuration probe, following the API research findings:
 *   - gemini-3.1-flash-lite (the Flash line was cut to ~20 RPD; Flash-Lite kept quota)
 *   - media_resolution ultra_high (biggest quality lever for a ruled grid)
 *   - NO temperature/top_p/top_k (deprecated 2026-07-21)
 *   - a realistic 16x16 sprite, not an 8x8 toy
 *
 * Request-frugal and self-pacing: the free tier is 5 rpm per model.
 *
 *   npx tsx tools/probe-config.ts
 */

import { GoogleGenAI } from '@google/genai'
import { PNG } from 'pngjs'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

for (const l of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
  if (m) process.env[m[1]!] ??= m[2]!
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const line = (s = '') => console.log(s)
const rule = (t: string) => line(`\n${'-'.repeat(68)}\n${t}\n${'-'.repeat(68)}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── a realistic 16x16 face ──────────────────────────────────────────────────
const ART = [
  '................',
  '.....111111.....',
  '...1122222211...',
  '..122222222221..',
  '..122222222221..',
  '.12222222222221.',
  '.12233222332221.',   // eyes at x=4,5 and x=9,10
  '.12233222332221.',
  '.12222222222221.',
  '.12222222222221.',
  '.12224444442221.',   // mouth x=5..10
  '.12222222222221.',
  '..122222222221..',
  '..112222222211..',
  '...1111111111...',
  '................',
]
for (const [i, r] of ART.entries()) {
  if (r.length !== 16) { console.error(`row ${i} is ${r.length} chars, expected 16`); process.exit(1) }
}
if (ART.length !== 16) { console.error('expected 16 rows'); process.exit(1) }

const PALETTE: Record<string, string> = {
  '1': '#2d1b00', '2': '#f4c430', '3': '#1a1a2e', '4': '#c1402e',
}

const OUT = join(process.cwd(), 'spike', 'out')
mkdirSync(OUT, { recursive: true })

/** Scaled render with a per-cell grid, heavier every 4. */
function render(rows: string[], scale: number, ruled: boolean): Buffer {
  const w = rows[0]!.length, h = rows.length
  const png = new PNG({ width: w * scale, height: h * scale })
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
    const i = (png.width * y + x) << 2
    png.data[i] = parseInt(hex.slice(1, 3), 16); png.data[i + 1] = parseInt(hex.slice(3, 5), 16)
    png.data[i + 2] = parseInt(hex.slice(5, 7), 16); png.data[i + 3] = 255
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const hex = PALETTE[rows[y]![x]!] ?? '#f0f0f0'
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(x * scale + dx, y * scale + dy, hex)
  }
  if (ruled) {
    for (let x = 0; x <= w; x++) for (let y = 0; y < png.height; y++) put(x * scale, y, x % 4 === 0 ? '#555555' : '#bbbbbb')
    for (let y = 0; y <= h; y++) for (let x = 0; x < png.width; x++) put(x, y * scale, y % 4 === 0 ? '#555555' : '#bbbbbb')
  }
  return PNG.sync.write(png)
}

const gridText = [
  'CANVAS 16 wide x 16 tall. Rows are listed top to bottom.',
  '',
  '     0123456789012345',
  ...ART.map((r, i) => `${String(i).padStart(2)} | ${r}`),
  '',
  'PALETTE (character = colour):',
  '  . = transparent',
  '  1 = #2d1b00  (outline)',
  '  2 = #f4c430  (skin)',
  '  3 = #1a1a2e  (eye)',
  '  4 = #c1402e  (mouth)',
  '',
  'Next available index if you add a colour: 5',
].join('\n')

const SYSTEM = `You are a pixel-art editing assistant. You edit an existing artwork by emitting a list of
structured operations. You never produce or return images.

You receive a rendered PNG with a coordinate grid, and a text grid of one character per pixel. Use the
image for meaning and the text grid for exact coordinates. If they appear to disagree, the text grid is
authoritative. x increases to the right from 0; y increases downward from 0.

Operations you may emit:
  set_pixels        px: [[x, y, index], ...]
  draw_line         x1, y1, x2, y2, i
  draw_rect         x, y, w, h, i, fill
  flood_fill        x, y, i
  replace_color     from, to
  add_palette_color c

Operations apply in the order you list them. Emit the smallest set of operations that carries out the
instruction, and preserve everything it did not ask you to change. Respect the canvas bounds — an
operation that reaches outside them causes the whole edit to be rejected.

Return a one-sentence past-tense summary and the operations.`

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

const img = render(ART, 24, true).toString('base64')
writeFileSync(join(OUT, 'context.png'), render(ART, 24, true))
writeFileSync(join(OUT, 'before.png'), render(ART, 16, false))

/** Apply ops locally so we can eyeball the result. */
function applyOps(rows: string[], ops: Array<Record<string, never>>): string[] {
  const g = rows.map((r) => r.split(''))
  const ch = (i: number) => (i === 0 ? '.' : i <= 9 ? String(i) : String.fromCharCode(87 + i))
  const set = (x: number, y: number, i: number) => {
    if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y]![x] = ch(i)
  }
  for (const op of ops as unknown as Array<Record<string, number & never[]>>) {
    const o = op as unknown as Record<string, number> & { op: string; px?: number[][]; fill?: boolean }
    if (o.op === 'set_pixels') for (const p of o.px ?? []) set(p[0]!, p[1]!, p[2]!)
    else if (o.op === 'draw_line') {
      let x = o.x1!, y = o.y1!
      const dx = Math.abs(o.x2! - x), dy = -Math.abs(o.y2! - y)
      const sx = x < o.x2! ? 1 : -1, sy = y < o.y2! ? 1 : -1
      let e = dx + dy
      for (;;) { set(x, y, o.i!); if (x === o.x2! && y === o.y2!) break
        const e2 = 2 * e; if (e2 >= dy) { e += dy; x += sx } if (e2 <= dx) { e += dx; y += sy } }
    } else if (o.op === 'draw_rect') {
      for (let dy = 0; dy < o.h!; dy++) for (let dx = 0; dx < o.w!; dx++) {
        const edge = dx === 0 || dy === 0 || dx === o.w! - 1 || dy === o.h! - 1
        if (o.fill || edge) set(o.x! + dx, o.y! + dy, o.i!)
      }
    }
  }
  return g.map((r) => r.join(''))
}

async function attempt(model: string, mediaResolution?: string) {
  const label = `${model}${mediaResolution ? ` + ${mediaResolution}` : ''}`
  const cfg: Record<string, unknown> = {
    systemInstruction: SYSTEM,
    responseMimeType: 'application/json',
    responseSchema: SCHEMA,
    maxOutputTokens: 4000,
    // NOTE: no temperature/top_p/top_k — deprecated 2026-07-21.
  }
  if (mediaResolution) cfg.mediaResolution = mediaResolution

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
      config: cfg as never,
    })
    const ms = Date.now() - t
    const u = r.usageMetadata as Record<string, number> | undefined
    const parsed = JSON.parse(r.text ?? '{}')
    const ops = parsed.operations ?? []

    let oob = 0, touched = 0
    const ys: number[] = []
    const chk = (x: number, y: number) => { touched++; ys.push(y); if (x < 0 || y < 0 || x > 15 || y > 15) oob++ }
    for (const o of ops) {
      if (o.op === 'set_pixels') for (const p of o.px ?? []) chk(p[0], p[1])
      if (o.op === 'draw_line') { chk(o.x1, o.y1); chk(o.x2, o.y2) }
      if (o.op === 'flood_fill') chk(o.x, o.y)
    }
    // Brow band on this sprite is rows 5-7 (eyes occupy 6-7).
    const brow = ys.filter((y) => y >= 4 && y <= 8).length

    line(`\n### ${label}`)
    line(`  latency    ${ms}ms`)
    line(`  tokens     prompt ${u?.promptTokenCount ?? '?'}  thinking ${u?.thoughtsTokenCount ?? 0}  out ${u?.candidatesTokenCount ?? '?'}  total ${u?.totalTokenCount ?? '?'}`)
    line(`  summary    ${parsed.summary}`)
    line(`  ops        ${ops.length}`)
    for (const o of ops) line(`             ${JSON.stringify(o)}`)
    line(`  bounds     ${touched - oob}/${touched} valid${oob ? '   <-- OUT OF BOUNDS' : ''}`)
    line(`  targeting  ${brow}/${ys.length || 1} in the brow/eye band (rows 4-8)`)

    const after = applyOps(ART, ops)
    const safe = label.replace(/[^a-z0-9.-]+/gi, '_')
    writeFileSync(join(OUT, `after_${safe}.png`), render(after, 16, false))
    line('')
    for (let i = 0; i < 16; i++) {
      const changed = after[i] !== ART[i]
      line(`   ${ART[i]}   ${changed ? '=>' : '  '}   ${after[i]}${changed ? '  *' : ''}`)
    }
    return true
  } catch (e) {
    line(`\n### ${label}\n  FAILED: ${String((e as Error).message).slice(0, 400)}`)
    return false
  }
}

async function main() {
  rule('CORRECTED CONFIG — gemini-3.1-flash-lite, ultra_high, no temperature')
  line('16x16 sprite. Context PNG written to spike/out/context.png')

  await attempt('gemini-3.1-flash-lite', 'MEDIA_RESOLUTION_ULTRA_HIGH')

  await sleep(25_000)
  rule('BASELINE — same model, default media resolution')
  await attempt('gemini-3.1-flash-lite')

  rule('DAILY QUOTA CHECK — is flash-lite really the one with headroom?')
  let ok = 0
  for (let n = 1; n <= 6; n++) {
    try {
      await ai.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'hi' })
      ok++
    } catch (e) {
      const m = String((e as Error).message)
      line(`  stopped at ${n}: ${/limit: (\d+)/.exec(m)?.[0] ?? m.slice(0, 160)}`)
      break
    }
    await sleep(13_000)
  }
  line(`  ${ok}/6 paced requests succeeded on gemini-3.1-flash-lite`)
}

main().catch((e) => { console.error(e); process.exit(1) })
