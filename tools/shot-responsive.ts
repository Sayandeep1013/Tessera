/** Screenshot the narrow tiers. npx tsx tools/shot-responsive.ts */
import { chromium } from 'playwright'

async function main() {
  const b = await chromium.launch()
  for (const [w, h, name] of [[390, 844, 'mobile'], [768, 1024, 'tablet']] as const) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
    await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
    await p.waitForTimeout(700)
    await p.screenshot({ path: `docs/shots/editor-${name}.png` })
    await p.close()
    console.log(`${name}: written`)
  }
  await b.close()
}
void main()
