/**
 * Render every starter to one PNG so they can be LOOKED at.
 *
 *   npx tsx tools/render-starters.ts
 *
 * A starter that parses is not the same as a starter that looks like the thing
 * it is named after, and 16x16 pixel art written as ASCII rows reads nothing
 * like it renders. This exists so adding one ends with looking at it.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { listStarters, loadStarter } from '../lib/artwork-core/create'
import { spriteToSvg } from '../lib/renderer/sprite-svg'

const OUT = join(process.cwd(), 'docs', 'shots')

async function main() {
  mkdirSync(OUT, { recursive: true })

  const cards = listStarters()
    .map((n) => {
      const doc = loadStarter(n)
      const svg = spriteToSvg(doc, 0).replace(
        '<svg ',
        '<svg width="256" height="256" style="image-rendering:pixelated;background:#1b1b1e;border-radius:6px" ',
      )
      return `<figure style="margin:0;text-align:center;font:13px system-ui;color:#ddd">
        ${svg}
        <figcaption style="margin-top:8px">${n} — ${doc.w}×${doc.h}, ${doc.palette.length} colours</figcaption>
      </figure>`
    })
    .join('')

  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 700, height: 340 }, deviceScaleFactor: 2 })
  await p.setContent(
    `<body style="margin:0;background:#0b0b0d;display:flex;gap:28px;padding:28px;align-items:center;justify-content:center">${cards}</body>`,
  )
  await p.screenshot({ path: join(OUT, 'starters.png') })
  await b.close()

  // Also dump the rows, which is what a reviewer actually edits.
  for (const n of listStarters()) {
    const doc = loadStarter(n)
    console.log(`\n── ${n} (${doc.w}×${doc.h}) ──`)
  }
  console.log(`\nwritten ${join('docs', 'shots', 'starters.png')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
