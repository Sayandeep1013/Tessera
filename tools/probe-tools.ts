/**
 * Does gemini-3.1-flash-lite emit MULTIPLE functionCall parts in one response?
 *
 * Spec 12 §5 assumes it does, and the whole MAX_STEPS budget rests on that. It is
 * documented Gemini behaviour but was never confirmed on this model on the free
 * tier — so confirm it before building the runner around it.
 *
 *   npx tsx tools/probe-tools.ts
 */

import { GoogleGenAI, Type } from '@google/genai'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const l of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())
  if (m) process.env[m[1]!] ??= m[2]!
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MODEL = 'gemini-3.1-flash-lite'

const line = (s = '') => console.log(s)
const rule = (t: string) => line(`\n${'-'.repeat(66)}\n${t}\n${'-'.repeat(66)}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const declarations = [
  {
    name: 'get_state',
    description: 'Read the current canvas state: size, palette, selected tool and colour.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'set_color',
    description: 'Set the active paint colour to a palette index.',
    parameters: {
      type: Type.OBJECT,
      properties: { index: { type: Type.INTEGER, description: 'Palette index' } },
      required: ['index'],
    },
  },
  {
    name: 'draw_line',
    description: 'Draw a straight line between two points using the given palette index.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        x1: { type: Type.INTEGER }, y1: { type: Type.INTEGER },
        x2: { type: Type.INTEGER }, y2: { type: Type.INTEGER },
        i: { type: Type.INTEGER },
      },
      required: ['x1', 'y1', 'x2', 'y2', 'i'],
    },
  },
  {
    name: 'finish',
    description: 'Call when the task is complete.',
    parameters: {
      type: Type.OBJECT,
      properties: { summary: { type: Type.STRING } },
      required: ['summary'],
    },
  },
]

const SYSTEM = `You are controlling a pixel-art editor by calling functions.
The canvas is 16x16. Palette index 1 is black, 2 is yellow.
When several independent steps are needed, call them together in one turn rather than
one at a time. Call finish when done.`

type Part = { functionCall?: { name?: string; args?: unknown }; text?: string }

async function turn(label: string, contents: unknown[]) {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: contents as never,
    config: { systemInstruction: SYSTEM, tools: [{ functionDeclarations: declarations }] } as never,
  })
  const parts = (res.candidates?.[0]?.content?.parts ?? []) as Part[]
  const calls = parts.filter((p) => p.functionCall)
  line(`\n${label}`)
  line(`  parts: ${parts.length}   functionCalls: ${calls.length}`)
  for (const c of calls) line(`    -> ${c.functionCall!.name}(${JSON.stringify(c.functionCall!.args)})`)
  const text = parts.filter((p) => p.text).map((p) => p.text).join(' ').trim()
  if (text) line(`  text: ${text.slice(0, 160)}`)
  return { parts, calls, res }
}

async function main() {
  rule('1. CAN IT BATCH? — a prompt that plainly needs three actions')
  const a = await turn(
    'prompt: "Set the colour to 1, then draw a line from (2,2) to (8,8), then finish."',
    [{ role: 'user', parts: [{ text: 'Set the colour to palette index 1, draw a line from (2,2) to (8,8) with index 1, then finish. Do it all now.' }] }],
  )

  await sleep(13_000)

  rule('2. NATURAL PHRASING — no explicit instruction to batch')
  const b = await turn(
    'prompt: "Draw a black diagonal across the canvas."',
    [{ role: 'user', parts: [{ text: 'Draw a black diagonal line across the canvas from corner to corner.' }] }],
  )

  await sleep(13_000)

  rule('3. ROUND TRIP — does a functionResponse turn work?')
  const first = await turn('prompt: "What size is the canvas? Then finish."', [
    { role: 'user', parts: [{ text: 'Check the canvas state, then finish.' }] },
  ])

  if (first.calls.length) {
    const responses = first.calls.map((c) => ({
      functionResponse: {
        name: c.functionCall!.name!,
        response: { result: { w: 16, h: 16, tool: 'brush', colorIndex: 1 } },
      },
    }))
    await sleep(13_000)
    await turn('after feeding results back', [
      { role: 'user', parts: [{ text: 'Check the canvas state, then finish.' }] },
      { role: 'model', parts: first.parts },
      { role: 'user', parts: responses },
    ])
  }

  rule('VERDICT')
  const maxBatch = Math.max(a.calls.length, b.calls.length)
  line(`largest batch observed: ${maxBatch} call(s) in one response`)
  line(
    maxBatch > 1
      ? 'BATCHING CONFIRMED — spec 12 §5 holds; MAX_STEPS 6 is realistic.'
      : 'NO BATCHING OBSERVED — the runner still works, but each action costs a round trip.\n' +
        'At 5 rpm that is ~12s per action. Revisit MAX_STEPS and consider raising it,\n' +
        'or accept fewer actions per session.',
  )
}

main().catch((e) => {
  console.error(String(e).slice(0, 600))
  process.exit(1)
})
