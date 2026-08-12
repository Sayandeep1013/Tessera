/**
 * Overflow check at every tier. See docs/research/ui-audit.md §3.
 *
 * The audit found the header running 165px off-screen at 768 and 543px at 390,
 * with controls unreachable and the page scrolling sideways. This measures the
 * real rendered boxes so the fix is verified rather than assumed.
 *
 *   npx tsx tools/check-responsive.ts
 */

import { chromium } from 'playwright'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const SIZES = [
  { w: 1440, h: 900, tier: 'wide' },
  { w: 1280, h: 800, tier: 'wide' },
  { w: 1024, h: 768, tier: 'compact' },
  { w: 768, h: 1024, tier: 'tablet' },
  { w: 390, h: 844, tier: 'mobile' },
  // The narrowest phone still in real use. Added when the Layers button arrived:
  // 390 had room to spare and would not have caught a header one control too wide.
  { w: 320, h: 568, tier: 'mobile' },
]

// Passed as a plain string: tsx/esbuild injects a __name helper that does not
// exist in the browser, so a function argument here throws "__name is not defined".
// Wrapped as an IIFE: page.evaluate treats a string as an *expression*, so a bare
// arrow function evaluates to the function itself and serialises as undefined.
const PROBE = `(() => {
  const vw = document.documentElement.clientWidth
  const out = { overflow: [], tiny: [], scrollW: document.documentElement.scrollWidth, vw }
  for (const el of document.querySelectorAll('button, input, [role="toolbar"], header')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    const name = el.getAttribute('aria-label') || el.getAttribute('title') || el.tagName.toLowerCase()
    if (r.right > vw + 0.5 || r.left < -0.5) {
      out.overflow.push(name + ' @ ' + Math.round(r.left) + '..' + Math.round(r.right))
    }
    if (el.tagName === 'BUTTON' && (r.width < 24 || r.height < 24)) {
      out.tiny.push(name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
    }
  }
  return out
})()`

const browser = await chromium.launch()
let failures = 0

for (const { w, h, tier } of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  const r = (await page.evaluate(PROBE)) as {
    overflow: string[]
    tiny: string[]
    scrollW: number
    vw: number
  }

  const scrolls = r.scrollW > r.vw + 0.5
  const bad = r.overflow.length || r.tiny.length || scrolls
  if (bad) failures++

  console.log(`\n${w}x${h}  (${tier})  ${bad ? 'FAIL' : 'ok'}`)
  if (scrolls) console.log(`  page scrolls sideways: ${r.scrollW} > ${r.vw}`)
  for (const o of r.overflow) console.log(`  offscreen: ${o}`)
  for (const t of r.tiny) console.log(`  below 24px target: ${t}`)

  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} viewport(s) failing` : '\nall viewports clean')
process.exit(failures ? 1 : 0)
