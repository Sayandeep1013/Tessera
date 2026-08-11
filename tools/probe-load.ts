import { chromium } from 'playwright'
import { join } from 'node:path'
const OUT = join(process.cwd(), 'docs', 'shots', 'audit')
async function main() {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' })
  const p = await ctx.newPage()
  await p.addInitScript(`window.__t0 = performance.now(); window.__marks = [];
    var iv = setInterval(function () {
      var c = document.querySelector('canvas');
      window.__marks.push({ t: Math.round(performance.now()), canvas: !!c, header: !!document.querySelector('header') });
      if (c) clearInterval(iv);
    }, 16);`)
  await p.goto('http://localhost:3000', { waitUntil: 'commit' })
  for (const ms of [80, 200, 400, 800, 1600]) {
    await p.waitForTimeout(ms === 80 ? 80 : ms - (ms / 2))
    await p.screenshot({ path: join(OUT, `load-t${ms}.png`) })
  }
  const marks = await p.evaluate(`window.__marks`) as any[]
  console.log('first header at', marks.find((m) => m.header)?.t, 'ms; first canvas at', marks.find((m) => m.canvas)?.t, 'ms')
  console.log('nav timing', await p.evaluate(`JSON.stringify({dom: Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart)})`))
  await b.close()
}
main()
