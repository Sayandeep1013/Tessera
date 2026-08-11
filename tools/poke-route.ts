/** Hit /api/ai/edit directly and print exactly what comes back. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const doc = JSON.parse(
  readFileSync(join(process.cwd(), 'lib/artwork-core/fixtures/starters/face.tessera.json'), 'utf8'),
)

const res = await fetch('http://localhost:3000/api/ai/edit', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ doc, frame: 0, instruction: 'make it angrier' }),
})

console.log('status:', res.status)
const text = await res.text()
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 1500))
} catch {
  console.log(text.slice(0, 1500))
}
