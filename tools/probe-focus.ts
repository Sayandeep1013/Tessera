import { chromium } from 'playwright'
import { join } from 'node:path'
const OUT = join(process.cwd(), 'docs', 'shots', 'audit')
async function main() {
  const b = await chromium.launch()
  for (const theme of ['light', 'dark'] as const) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme })
    const p = await ctx.newPage()
    await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
    await p.waitForTimeout(2000)
    for (let i = 0; i < 11; i++) await p.keyboard.press('Tab')   // -> Brush (active tool)
    await p.screenshot({ path: join(OUT, `focus-active-tool-${theme}.png`), clip: { x: 0, y: 260, width: 200, height: 420 } })
    const snap = await p.evaluate(`(() => { var e=document.activeElement; var c=getComputedStyle(e); return {label:e.getAttribute('aria-label'), outline:c.outline, offset:c.outlineOffset, radius:c.borderRadius, bg:c.backgroundColor}; })()`)
    console.log(theme, JSON.stringify(snap))
    // canvas reachability
    const canFocus = await p.evaluate(`(() => { var c=document.querySelector('canvas'); c.focus(); return document.activeElement === c; })()`)
    console.log(theme, 'canvas focusable:', canFocus)
    // arrow key in toolbar
    const before = await p.evaluate(`document.activeElement.getAttribute('aria-label')`)
    await p.keyboard.press('ArrowDown')
    const after = await p.evaluate(`document.activeElement.getAttribute('aria-label')`)
    console.log(theme, 'toolbar ArrowDown:', before, '->', after)
    await ctx.close()
  }
  await b.close()
}
main()
