import { chromium } from 'playwright'
import { join } from 'node:path'
const READ = [
 '(() => {',
 '  var h = document.querySelector("header");',
 '  var a = document.activeElement;',
 '  var r = a.getBoundingClientRect();',
 '  return JSON.stringify({ focus: a.getAttribute("aria-label"), scrollLeft: h.scrollLeft, x: Math.round(r.x), logoX: Math.round(document.querySelector("header button").getBoundingClientRect().x) });',
 '})()'].join('\n')
async function main() {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' })
  const p = await ctx.newPage()
  await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  for (let i = 0; i < 9; i++) {
    await p.keyboard.press('Tab')
    console.log(i + 1, await p.evaluate(READ))
  }
  await p.screenshot({ path: join(process.cwd(), 'docs', 'shots', 'audit', '390-header-scrolled-by-tab.png'), clip: { x: 0, y: 0, width: 390, height: 60 } })
  await b.close()
}
main()
