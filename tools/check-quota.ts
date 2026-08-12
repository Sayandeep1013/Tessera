/**
 * Is the Gemini key alive, and is the free tier exhausted?
 *
 *   npx tsx tools/check-quota.ts
 *
 * Spends exactly one request against a 5-per-minute budget, with the smallest
 * possible prompt. Prints the status and nothing else — never the key.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function keyFromEnvLocal(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    const text = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    const line = text.split(/\r?\n/).find((l) => l.trim().startsWith('GEMINI_API_KEY='))
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : null
  } catch {
    return null
  }
}

async function main() {
  const key = keyFromEnvLocal()
  if (!key) {
    console.log('no key found in the environment or .env.local')
    process.exit(1)
  }
  console.log(`key present, ${key.length} chars, ends ...${key.slice(-4)}`)

  const model = 'gemini-3.1-flash-lite'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }] }),
    },
  )

  const body = (await res.json()) as Record<string, unknown>
  console.log(`status ${res.status} ${res.statusText}`)

  if (res.ok) {
    console.log('quota is FINE — the key answered a real request')
    return
  }

  const err = body.error as { status?: string; message?: string } | undefined
  console.log(`code    ${err?.status ?? '?'}`)
  console.log(`message ${err?.message ?? JSON.stringify(body).slice(0, 300)}`)
  if (res.status === 429) console.log('\n=> quota or rate limit. 5 requests/minute is the usual one.')
  if (res.status === 400 || res.status === 403) console.log('\n=> the key itself is being rejected, not the quota.')
}

main().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
