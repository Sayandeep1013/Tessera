/**
 * Design measurement pass against the live Newt application.
 *
 * Public-page inspection only — the DevTools equivalent of viewing the site.
 * No authentication, no private endpoints, no bypass of any access control.
 * Output feeds docs/specs/02-design-system.md.
 *
 *   npx tsx tools/inspect-newt.ts
 *
 * NOTE: the browser-side code is a plain string, not a TS function. tsx compiles
 * with esbuild's keepNames on, which injects a `__name` helper that does not
 * exist inside page.evaluate — passing source text sidesteps the transform.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TARGET = 'https://newt.sh/'
const OUT = join(process.cwd(), 'docs', 'research', 'newt')

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
]

const MEASURE = `(() => {
  var colors = new Set(), fonts = new Set(), radii = new Set();

  function describe(el) {
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    if (cs.color) colors.add(cs.color);
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.add(cs.backgroundColor);
    if (cs.fontFamily) fonts.add(cs.fontFamily);
    if (cs.borderRadius && cs.borderRadius !== '0px') radii.add(cs.borderRadius);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      cls: (el.getAttribute('class') || '').slice(0, 120) || undefined,
      text: (el.textContent || '').trim().slice(0, 60) || undefined,
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      style: {
        display: cs.display,
        position: cs.position,
        font: cs.fontWeight + ' ' + cs.fontSize + '/' + cs.lineHeight + ' ' + cs.fontFamily.split(',')[0],
        color: cs.color,
        background: cs.backgroundColor,
        radius: cs.borderRadius !== '0px' ? cs.borderRadius : undefined,
        padding: cs.padding !== '0px' ? cs.padding : undefined,
        gap: cs.gap !== 'normal' ? cs.gap : undefined,
        shadow: cs.boxShadow !== 'none' ? cs.boxShadow : undefined,
        border: cs.borderWidth !== '0px' ? (cs.borderWidth + ' ' + cs.borderStyle + ' ' + cs.borderColor) : undefined,
        zIndex: cs.zIndex !== 'auto' ? cs.zIndex : undefined
      }
    };
  }

  var all = Array.prototype.slice.call(document.querySelectorAll('*')).filter(function (el) {
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  });

  var interactive = Array.prototype.slice
    .call(document.querySelectorAll('button, input, a, [role="button"], select, textarea, canvas, svg'))
    .map(describe);

  var elements = all.slice(0, 200).map(describe);

  var bodyCs = getComputedStyle(document.body);
  var rootCs = getComputedStyle(document.documentElement);

  var customProps = {};
  var sheets = Array.prototype.slice.call(document.styleSheets);
  for (var i = 0; i < sheets.length; i++) {
    try {
      var rules = Array.prototype.slice.call(sheets[i].cssRules);
      for (var j = 0; j < rules.length; j++) {
        var rule = rules[j];
        if (rule.selectorText && /:root|^html$/.test(rule.selectorText)) {
          for (var k = 0; k < rule.style.length; k++) {
            var prop = rule.style[k];
            if (prop.indexOf('--') === 0) customProps[prop] = rule.style.getPropertyValue(prop).trim();
          }
        }
      }
    } catch (e) { /* cross-origin sheet */ }
  }

  var canvases = Array.prototype.slice.call(document.querySelectorAll('canvas')).map(function (c) {
    var r = c.getBoundingClientRect();
    var cs = getComputedStyle(c);
    return {
      attrWidth: c.width,
      attrHeight: c.height,
      cssWidth: Math.round(r.width),
      cssHeight: Math.round(r.height),
      imageRendering: cs.imageRendering,
      scale: c.width ? +(r.width / c.width).toFixed(3) : null
    };
  });

  var meta = {};
  Array.prototype.slice.call(document.querySelectorAll('meta[name], meta[property]')).forEach(function (m) {
    meta[m.getAttribute('name') || m.getAttribute('property')] = m.getAttribute('content');
  });

  return {
    title: document.title,
    meta: meta,
    manifest: (document.querySelector('link[rel="manifest"]') || {}).href,
    bodyBackground: bodyCs.backgroundColor,
    bodyColor: bodyCs.color,
    bodyFont: bodyCs.fontFamily,
    rootFontSize: rootCs.fontSize,
    colorScheme: rootCs.colorScheme,
    customProps: customProps,
    canvases: canvases,
    interactive: interactive,
    elementCount: all.length,
    elements: elements,
    palette: Array.from(colors).sort(),
    fonts: Array.from(fonts).sort(),
    radii: Array.from(radii).sort(),
    textContent: (document.body.innerText || '').trim().slice(0, 2000)
  };
})()`

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const report: Record<string, unknown> = { target: TARGET, capturedAt: new Date().toISOString() }
  const network: Array<Record<string, unknown>> = []

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    })
    const page = await ctx.newPage()

    if (vp.name === VIEWPORTS[0]!.name) {
      page.on('response', (res) => {
        const url = res.url()
        network.push({
          method: res.request().method(),
          status: res.status(),
          type: res.request().resourceType(),
          url: url.length > 160 ? url.slice(0, 160) + '…' : url,
        })
      })
    }

    console.log(`-> ${vp.name}`)
    try {
      await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 45_000 })
    } catch {
      await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    }
    await page.waitForTimeout(4000) // let the SPA settle

    await page.screenshot({ path: join(OUT, `${vp.name}.png`) })
    try {
      report[vp.name] = await page.evaluate(MEASURE)
    } catch (e) {
      report[vp.name] = { error: String(e) }
    }
    await ctx.close()
  }

  report.network = network
  await browser.close()

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(`\nWrote ${join(OUT, 'report.json')} + ${VIEWPORTS.length} screenshots.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
