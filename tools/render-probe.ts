/** Render the last probe result to a PNG. npx tsx tools/render-probe.ts */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseDoc } from '../lib/artwork-core/codec'
import { buildContext } from '../lib/ai/context'

const r = parseDoc(JSON.parse(readFileSync('.probe-agent-result.json', 'utf8')))
if (!r.ok) throw new Error(r.error.message)
writeFileSync('docs/shots/probe-ai-result.png', Buffer.from(buildContext(r.value, 0).png, 'base64'))
console.log(`wrote docs/shots/probe-ai-result.png (${r.value.w}x${r.value.h})`)
