/**
 * UI audit harness — measures OUR app the same way tools/extract-newt.ts measured
 * the reference, so the two number sets are directly comparable.
 *
 *   npx tsx tools/audit-ui.ts [url]
 *
 * Outputs:
 *   docs/shots/audit/<vp>-<theme>.png
 *   docs/research/ui-audit-data.json
 *
 * NOTE: every browser-side payload is a plain STRING, never a TS function.
 * tsx compiles with esbuild `keepNames`, which injects a `__name` helper that
 * does not exist inside page.evaluate.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.argv[2] ?? 'http://localhost:3000'
const SHOTS = join(process.cwd(), 'docs', 'shots', 'audit')
const OUT = join(process.cwd(), 'docs', 'research', 'ui-audit-data.json')

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
]

const PROPS = [
  'display', 'position', 'width', 'height', 'padding', 'margin', 'gap',
  'flexDirection', 'alignItems', 'justifyContent', 'flex',
  'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFamily',
  'color', 'backgroundColor', 'borderRadius', 'boxShadow', 'backdropFilter',
  'opacity', 'zIndex', 'overflow', 'overflowX', 'cursor', 'pointerEvents',
  'outline', 'transform', 'visibility', 'minWidth', 'minHeight',
]

/* ── inventory of every rendered element with a box ─────────────────────── */

const INVENTORY = `(() => {
  var PROPS = ${JSON.stringify(PROPS)};

  function label(el) {
    var t = el.tagName.toLowerCase();
    var a = el.getAttribute('aria-label') || el.getAttribute('title');
    if (a) return t + '[' + a + ']';
    if (el.getAttribute('role')) return t + '{' + el.getAttribute('role') + '}';
    var own = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) own += n.nodeValue;
    }
    own = own.replace(/\\s+/g, ' ').trim();
    if (own) return t + ':' + own.slice(0, 28);
    if (el.getAttribute('placeholder')) return t + '~' + el.getAttribute('placeholder').slice(0, 24);
    return t;
  }

  function path(el) {
    var parts = [];
    var cur = el;
    var depth = 0;
    while (cur && cur !== document.body && depth < 12) {
      parts.unshift(label(cur));
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  // effective background: composite ancestor backgrounds down to the page
  function parseRGB(s) {
    s = String(s);
    var m = s.match(/rgba?\\(([^)]+)\\)/);
    if (m) {
      var p = m[1].split(',').map(function (v) { return parseFloat(v); });
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    // color(srgb r g b / a) — Chromium emits this for color-mix()
    var c = s.match(/color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\)/);
    if (c) {
      return {
        r: parseFloat(c[1]) * 255, g: parseFloat(c[2]) * 255, b: parseFloat(c[3]) * 255,
        a: c[4] === undefined ? 1 : parseFloat(c[4])
      };
    }
    return null;
  }
  function over(fg, bg) {
    var a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a: a
    };
  }
  function effBg(el) {
    var stack = [];
    var cur = el;
    while (cur) {
      var c = parseRGB(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0) stack.push(c);
      cur = cur.parentElement;
    }
    var acc = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  }
  function lum(c) {
    function ch(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }
  function hasText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    }
    return false;
  }

  var out = [];
  var all = document.querySelectorAll('body *');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (r.width === 0 && r.height === 0 && el.tagName.toLowerCase() !== 'div') continue;
    var rec = {
      tag: el.tagName.toLowerCase(),
      path: path(el),
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
      style: {}
    };
    for (var p = 0; p < PROPS.length; p++) rec.style[PROPS[p]] = cs[PROPS[p]];
    if (el.hasAttribute('disabled')) rec.disabled = true;
    if (el.hasAttribute('aria-pressed')) rec.ariaPressed = el.getAttribute('aria-pressed');
    if (el.hasAttribute('aria-label')) rec.ariaLabel = el.getAttribute('aria-label');
    if (el.hasAttribute('title')) rec.title = el.getAttribute('title');
    if (el.hasAttribute('placeholder')) rec.placeholder = el.getAttribute('placeholder');
    if (hasText(el) || el.tagName.toLowerCase() === 'input') {
      var fg = parseRGB(cs.color);
      var bg = effBg(el);
      if (fg) {
        rec.contrast = contrast(over(fg, bg), bg);
        rec.effBg = 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')';
      }
    }
    // icon (svg) contrast against its own effective bg
    if (el.tagName.toLowerCase() === 'svg') {
      var fgi = parseRGB(cs.color);
      var bgi = effBg(el.parentElement || el);
      if (fgi) {
        rec.contrast = contrast(over(fgi, bgi), bgi);
        rec.effBg = 'rgb(' + Math.round(bgi.r) + ',' + Math.round(bgi.g) + ',' + Math.round(bgi.b) + ')';
      }
    }
    out.push(rec);
  }

  return {
    docScrollW: document.documentElement.scrollWidth,
    docScrollH: document.documentElement.scrollHeight,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    dpr: window.devicePixelRatio,
    htmlClass: document.documentElement.className,
    tokens: (function () {
      var cs = getComputedStyle(document.documentElement);
      var names = ['--surface','--panel','--panel2','--fg','--muted','--faint','--line','--hover','--accent','--onaccent','--art-bg','--art-grid','--art-edge-tl','--art-edge-br','--r-sm','--r-md','--r-lg','--r-xl','--r-pill','--shadow-sm','--shadow-card','--shadow-lg','--fg-muted','--fg-faint','--surface-2','--shadow-1','--accent-fg'];
      var o = {};
      for (var k = 0; k < names.length; k++) o[names[k]] = cs.getPropertyValue(names[k]).trim();
      return o;
    })(),
    elements: out
  };
})()`

/* ── canvas per-pixel probe ─────────────────────────────────────────────── */

const CANVAS_PROBE = `(() => {
  var c = document.querySelector('canvas');
  if (!c) return null;
  var r = c.getBoundingClientRect();
  var ctx = c.getContext('2d');
  var dpr = window.devicePixelRatio;
  var img;
  try { img = ctx.getImageData(0, 0, c.width, c.height); } catch (e) { return { error: String(e) }; }
  var d = img.data;
  var hist = {};
  for (var i = 0; i < d.length; i += 4) {
    var k = d[i] + ',' + d[i+1] + ',' + d[i+2] + ',' + d[i+3];
    hist[k] = (hist[k] || 0) + 1;
  }
  var entries = Object.keys(hist).map(function (k) { return [k, hist[k]]; });
  entries.sort(function (a, b) { return b[1] - a[1]; });
  var total = d.length / 4;

  // find artwork bounds: scan the middle row/col for the first non-background run
  // (background = the most common colour)
  var bgKey = entries[0][0];
  var bgp = bgKey.split(',').map(Number);
  function at(x, y) {
    var o = (y * c.width + x) * 4;
    return [d[o], d[o+1], d[o+2], d[o+3]];
  }
  function same(p, q) { return p[0]===q[0]&&p[1]===q[1]&&p[2]===q[2]&&p[3]===q[3]; }
  var my = Math.floor(c.height / 2), mx = Math.floor(c.width / 2);
  var x0 = -1, x1 = -1, y0 = -1, y1 = -1;
  for (var x = 0; x < c.width; x++) if (!same(at(x, my), bgp)) { x0 = x; break; }
  for (var x2 = c.width - 1; x2 >= 0; x2--) if (!same(at(x2, my), bgp)) { x1 = x2; break; }
  for (var y = 0; y < c.height; y++) if (!same(at(mx, y), bgp)) { y0 = y; break; }
  for (var y2 = c.height - 1; y2 >= 0; y2--) if (!same(at(mx, y2), bgp)) { y1 = y2; break; }

  return {
    cssBox: { x: r.x, y: r.y, w: r.width, h: r.height },
    attrs: { width: c.width, height: c.height },
    dpr: dpr,
    backingScale: c.width / r.width,
    distinctColours: entries.length,
    top: entries.slice(0, 8).map(function (e) { return { rgba: e[0], pct: Math.round(e[1] / total * 1e6) / 1e4 }; }),
    artworkDevice: { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    artworkCss: {
      x: Math.round((r.x + x0 / (c.width / r.width)) * 100) / 100,
      y: Math.round((r.y + y0 / (c.height / r.height)) * 100) / 100,
      w: Math.round(((x1 - x0 + 1) / (c.width / r.width)) * 100) / 100,
      h: Math.round(((y1 - y0 + 1) / (c.height / r.height)) * 100) / 100
    },
    centreDeltaY: Math.round((((y0 + y1) / 2) / (c.height / r.height) - r.height / 2) * 100) / 100,
    centreDeltaX: Math.round((((x0 + x1) / 2) / (c.width / r.width) - r.width / 2) * 100) / 100
  };
})()`

/* ── tab order + focus ring ─────────────────────────────────────────────── */

const FOCUS_SNAP = `(() => {
  var el = document.activeElement;
  if (!el || el === document.body) return null;
  var cs = getComputedStyle(el);
  var r = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    label: el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim().slice(0, 30),
    disabled: el.hasAttribute('disabled'),
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    outline: cs.outline,
    outlineOffset: cs.outlineOffset,
    boxShadow: cs.boxShadow
  };
})()`

/* ── hit targets: every interactive control, its box and accessible name ── */

const TARGETS = `(() => {
  var out = [];
  var els = document.querySelectorAll('button, a[href], input, [role="radio"], [role="switch"], [tabindex]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    var name = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim() || el.getAttribute('placeholder') || '';
    var svg = el.querySelector('svg');
    var sr = svg ? svg.getBoundingClientRect() : null;
    out.push({
      tag: el.tagName.toLowerCase(),
      name: name.slice(0, 40),
      hasName: Boolean(name),
      disabled: el.hasAttribute('disabled'),
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
      minSide: Math.round(Math.min(r.width, r.height) * 100) / 100,
      iconW: sr ? Math.round(sr.width * 100) / 100 : null,
      iconH: sr ? Math.round(sr.height * 100) / 100 : null,
      fontSize: getComputedStyle(el).fontSize,
      cursor: getComputedStyle(el).cursor
    });
  }
  return out;
})()`

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch()
  const report: Record<string, unknown> = {}

  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark'] as const) {
      const key = `${vp.name}-${theme}`
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      })
      const page = await ctx.newPage()
      const errors: string[] = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      page.on('pageerror', (e) => errors.push(String(e)))

      // layout-shift observer, installed before load
      await page.addInitScript(`window.__cls = 0; window.__shifts = [];
        try {
          new PerformanceObserver(function (l) {
            var es = l.getEntries();
            for (var i = 0; i < es.length; i++) {
              if (!es[i].hadRecentInput) { window.__cls += es[i].value; window.__shifts.push(es[i].value); }
            }
          }).observe({ type: 'layout-shift', buffered: true });
        } catch (e) {}`)

      await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.waitForTimeout(2500)

      await page.screenshot({ path: join(SHOTS, `${key}.png`) })

      const inventory = await page.evaluate(INVENTORY)
      const canvas = await page.evaluate(CANVAS_PROBE)
      const targets = await page.evaluate(TARGETS)
      const cls = await page.evaluate(`({ cls: window.__cls, shifts: window.__shifts })`)

      // tab walk
      const tabs: unknown[] = []
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press('Tab')
        const snap = await page.evaluate(FOCUS_SNAP)
        if (!snap) break
        tabs.push(snap)
      }
      await page.screenshot({ path: join(SHOTS, `${key}-focus-last.png`) })

      report[key] = { viewport: vp, theme, inventory, canvas, targets, cls, tabs, errors }
      console.log(`${key}: ${errors.length} console errors, ${tabs.length} tab stops`)
      await ctx.close()
    }
  }

  // hover-state probe at 1440 light
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light',
    })
    const page = await ctx.newPage()
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(2000)

    const hovers: Record<string, unknown> = {}
    const probes: Array<[string, string]> = [
      ['toolrail-inactive', '[aria-label="Eraser (E)"]'],
      ['toolrail-active', '[aria-label="Brush (B)"]'],
      ['toolrail-disabled', '[aria-label^="Select / Move"]'],
      ['brush-minus', '[aria-label="Smaller brush"]'],
      ['zoom-out', '[aria-label="Zoom out"]'],
      ['zoom-level', '[aria-label="Fit to screen"]'],
      ['composer-plus', '[aria-label="AI options"]'],
      ['composer-send', '[aria-label="Send"]'],
      ['settings', '[aria-label="Settings"]'],
    ]
    const READ = `(sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, boxShadow: c.boxShadow, transform: c.transform, cursor: c.cursor, opacity: c.opacity }; }`
    for (const [name, sel] of probes) {
      const before = await page.evaluate(`(${READ})(${JSON.stringify(sel)})`)
      const loc = page.locator(sel).first()
      if (await loc.count()) {
        try {
          await loc.hover({ timeout: 2000, force: true })
          await page.waitForTimeout(300)
        } catch { /* off-screen */ }
      }
      const after = await page.evaluate(`(${READ})(${JSON.stringify(sel)})`)
      hovers[name] = { sel, before, after }
      await page.mouse.move(700, 500)
      await page.waitForTimeout(200)
    }
    report.hovers = hovers
    await ctx.close()
  }

  // DPR 1 — what a plain 1080p monitor at 100% scaling actually shows.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light',
    })
    const page = await ctx.newPage()
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: join(SHOTS, '1440x900-light-dpr1.png') })
    // crop the header so the half-pixel positioning is visible
    await page.screenshot({ path: join(SHOTS, 'header-dpr1-crop.png'), clip: { x: 0, y: 0, width: 720, height: 48 } })
    report.dpr1 = await page.evaluate(`(() => {
      var out = [];
      var els = document.querySelectorAll('header button, header input, header span, header svg');
      for (var i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect();
        var frac = (r.y % 1 !== 0) || (r.x % 1 !== 0) || (r.height % 1 !== 0);
        if (frac) out.push({
          label: els[i].getAttribute('aria-label') || els[i].getAttribute('title') || els[i].tagName,
          x: r.x, y: r.y, w: r.width, h: r.height
        });
      }
      return { headerRect: document.querySelector('header').getBoundingClientRect().toJSON(), subpixel: out };
    })()`)
    await ctx.close()
  }

  // Resize jank: does the artwork re-fit, and does the layout hold?
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light',
    })
    const page = await ctx.newPage()
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(2000)
    const READZ = `(() => {
      var b = document.querySelector('[aria-label="Fit to screen"]');
      var c = document.querySelector('canvas').getBoundingClientRect();
      return { zoom: b ? b.textContent.trim() : null, canvas: { w: c.width, h: c.height } };
    })()`
    const seq: unknown[] = []
    seq.push({ at: '1440x900', ...(await page.evaluate(READZ) as object) })
    for (const [w, h] of [[1100, 900], [768, 1024], [390, 844], [1440, 900]] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(700)
      seq.push({ at: `${w}x${h}`, ...(await page.evaluate(READZ) as object) })
    }
    await page.screenshot({ path: join(SHOTS, 'after-resize-1440.png') })
    report.resize = seq
    await ctx.close()
  }

  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(`wrote ${OUT}`)
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
