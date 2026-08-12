/**
 * End-to-end agent probe: the REAL runner, the REAL declarations, the REAL model.
 *
 * Stubs fetch with the same pass-through the route performs, so everything except
 * the HTTP hop is production code. This is the proof that #37 works — unit tests
 * against the mock prove the loop's shape, this proves the model can actually
 * drive it.
 *
 *   npx tsx tools/probe-agent.ts "make the eyebrows angry"
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runAgent } from '../lib/agent/run'
import { AGENT_SYSTEM_PROMPT } from '../lib/agent/prompt'
import { toDeclarations } from '../lib/actions/registry'
import { getProvider } from '../lib/ai/provider'
import { buildContext } from '../lib/ai/context'
import { loadStarter } from '../lib/artwork-core/create'
import { applyCommand } from '../lib/artwork-core/commands'
import { clampLayer } from '../lib/artwork-core/layers'
import { serializeDoc } from '../lib/artwork-core/codec'
import type { ActionCtx, EditorSnapshot } from '../lib/actions/types'
import type { Doc } from '../lib/artwork-core/schema'

for (const l of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)
  if (m) process.env[m[1]!] ??= m[2]!
}

const instruction = process.argv[2] ?? 'make the eyebrows angry'

const provider = getProvider()
if (!provider.converse) throw new Error(`provider ${provider.id} has no converse()`)

let turns = 0
// The Gemini SDK uses fetch too, so intercept only our own route and pass
// everything else through untouched.
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string, init: RequestInit) => {
  if (!String(url).includes('/api/ai/agent')) return realFetch(url as never, init)
  turns++
  const { history } = JSON.parse(String(init.body)) as { history: never }
  const res = await provider.converse!({
    systemPrompt: AGENT_SYSTEM_PROMPT,
    history,
    tools: toDeclarations() as never,
    maxOutputTokens: 4000,
  })
  if (!res.ok) {
    return {
      ok: false,
      status: 429,
      json: async () => ({ code: res.kind, message: res.message }),
    } as Response
  }
  return { ok: true, status: 200, json: async () => ({ parts: res.parts }) } as Response
}) as typeof fetch

const size = Number(process.argv[3] ?? 16)
let doc: Doc = loadStarter('face')
if (size !== 16) {
  // Phase 0's top hypothesis was that 16x16 leaves no room for expression.
  // Upscale the starter so the subject is identical and only the canvas differs.
  const k = Math.max(1, Math.round(size / 16))
  const w = 16 * k
  const px = new Uint8Array(w * w)
  const src = doc.frames[0]!.layers[0]!.px
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      px[y * w + x] = src[Math.floor(y / k) * 16 + Math.floor(x / k)]!
    }
  }
  doc = { ...doc, w, h: w, frames: [{ ms: 100, layers: [{ n: 'base', px }] }] }
}
const editor: EditorSnapshot = {
  tool: 'brush',
  colorIndex: 1,
  brushSize: 1,
  brushShape: 'square',
  viewport: { scale: 16, offsetX: 0, offsetY: 0 },
  showGrid: true,
}

let layer = 0

const ctx: ActionCtx = {
  doc: () => doc,
  frame: () => 0,
  layer: () => layer,
  newId: () => `probe-${Date.now()}`,
  setLayer: (i) => {
    layer = clampLayer(doc, 0, i)
  },
  commit: (cmd) => {
    doc = applyCommand(doc, cmd)
  },
  editor: {
    setTool: (t) => (editor.tool = t),
    setColorIndex: (i) => (editor.colorIndex = i),
    setBrushSize: (n) => (editor.brushSize = n),
    setBrushShape: (s) => (editor.brushShape = s),
    setViewport: (vp) => (editor.viewport = vp),
    toggleGrid: (on) => (editor.showGrid = on ?? !editor.showGrid),
    state: () => ({ ...editor }),
  },
  undo: () => {},
  redo: () => {},
  historyDepth: () => ({ undo: 0, redo: 0 }),
  confirmed: false,
  budget: null,
}

const started = Date.now()
console.log(`model:       ${await provider.model()}`)
console.log(`declared:    ${toDeclarations().length} actions`)
console.log(`instruction: ${instruction}\n`)

const out = await runAgent({
  instruction,
  imagePngBase64: buildContext(doc, 0).png,
  ctx,
  sessionId: 'probe',
  currentDoc: () => doc,
  // Auto-approve, so a destructive call shows up in the log rather than stalling.
  onConfirm: async (name) => {
    console.log(`  [confirm] ${name} — auto-approved for the probe`)
    return true
  },
  onStep: (s) => {
    if (s.type === 'thinking') console.log(`— step ${s.step}/${s.of}`)
    if (s.type === 'action') {
      const r = s.result.ok
        ? `ok ${JSON.stringify(s.result.data ?? {}).slice(0, 90)}`
        : `FAIL ${s.result.error}`
      console.log(`  ${s.name}(${JSON.stringify(s.args).slice(0, 70)}) -> ${r}`)
    }
    if (s.type === 'error') console.log(`  !! ${s.code}: ${s.message}`)
  },
})

console.log(`\nstopped by:  ${out.stoppedBy}`)
console.log(`summary:     ${out.summary}`)
console.log(`changed:     ${out.changed} pixels`)
console.log(`model turns: ${turns}`)
console.log(`elapsed:     ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log(`command:     ${out.command?.type ?? 'none — nothing changed'}`)

writeFileSync('.probe-agent-result.json', serializeDoc(doc))
console.log('\nwrote .probe-agent-result.json')
