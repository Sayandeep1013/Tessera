/** Magnified grid crop + the File menu open. npx tsx tools/probe-visual.ts */
import { chromium } from 'playwright'

async function main() {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)

  // a small crop of the artwork's empty area, blown up, to see grid lines
  await p.screenshot({ path: 'docs/shots/probe-grid.png', clip: { x: 520, y: 160, width: 150, height: 150 } })

  // the File menu open, to see what it overlaps
  await p.getByRole('button', { name: 'File — new, open, export' }).click()
  await p.waitForTimeout(300)
  await p.screenshot({ path: 'docs/shots/probe-filemenu.png', clip: { x: 0, y: 0, width: 700, height: 340 } })

  await b.close()
  console.log('written')
}
void main()
