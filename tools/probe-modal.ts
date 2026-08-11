import { chromium } from 'playwright'
async function main() {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 900, height: 780 }, deviceScaleFactor: 2 })
  await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  await p.getByLabel('Use your own API key').click()
  await p.waitForTimeout(300)
  await p.screenshot({ path: 'docs/shots/probe-keydialog.png' })
  await b.close()
  console.log('written')
}
void main()
