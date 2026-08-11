/**
 * Wheel behaviour check. npx tsx tools/probe-wheel.ts
 *
 * A trackpad two-finger scroll used to zoom 32x -> 64x in one flick, because
 * every wheel event jumped a ladder rung. This asserts scroll pans and only
 * pinch zooms.
 */
import { chromium } from 'playwright'

const SCROLL = `(() => {
  const c = document.querySelector('canvas')
  for (let i = 0; i < 30; i++) {
    c.dispatchEvent(new WheelEvent('wheel', {
      deltaY: 12, deltaX: 0, bubbles: true, cancelable: true, clientX: 700, clientY: 400,
    }))
  }
  return true
})()`

const PINCH = `(() => {
  const c = document.querySelector('canvas')
  for (let i = 0; i < 30; i++) {
    c.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -4, ctrlKey: true, bubbles: true, cancelable: true, clientX: 700, clientY: 400,
    }))
  }
  return true
})()`

const READ = `document.querySelector('[aria-label="Fit to screen"]').textContent`

async function main() {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await p.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)

  const before = await p.evaluate(READ)
  await p.evaluate(SCROLL)
  await p.waitForTimeout(200)
  const afterScroll = await p.evaluate(READ)

  await p.evaluate(PINCH)
  await p.waitForTimeout(200)
  const afterPinch = await p.evaluate(READ)

  await b.close()

  console.log(`start            ${before}`)
  console.log(`after 30 scrolls ${afterScroll}   (must be unchanged — scroll pans)`)
  console.log(`after 30 pinches ${afterPinch}   (must have grown, gradually)`)

  const ok = afterScroll === before && afterPinch !== before
  console.log(ok ? '\nPASS' : '\nFAIL')
  process.exit(ok ? 0 : 1)
}
void main()
