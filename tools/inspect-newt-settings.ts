/**
 * Measure Newt's settings surface — what options exist, how they are grouped,
 * and what kind of control each one is.
 *
 *   npx tsx tools/inspect-newt-settings.ts
 *
 * The earlier inspection (tools/inspect-newt.ts) measured the top-level chrome
 * but never opened a menu, so the settings contents were never captured.
 *
 * What this is for, and what it is NOT for. docs/SPEC.md §0 puts Newt's
 * branding, icons, copy and artwork off-limits, and nothing here derives from
 * its code. This records the SHAPE of the feature — which options an editor of
 * this kind offers, how they are grouped, and what control type each one uses —
 * so ours can offer the same capabilities written in our own words. Wording is
 * captured only so the capability behind it can be identified.
 */

import { chromium, type Page } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'research', 'newt')
const URL = 'https://newt.sh/'

/** Any panel/dialog/menu currently on screen, with its full text and controls. */
const SURFACES = `(() => {
  const out = [];
  const seen = new Set();
  const sel = '[role=menu],[role=dialog],[role=listbox],[role=tabpanel],[data-state=open],[data-radix-popper-content-wrapper]';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const key = Math.round(r.x) + ':' + Math.round(r.y) + ':' + Math.round(r.width);
    if (seen.has(key)) continue;
    seen.add(key);
    const items = [];
    for (const it of el.querySelectorAll('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=switch],button,input,select,a[href]')) {
      const ir = it.getBoundingClientRect();
      if (ir.width === 0) continue;
      items.push({
        role: it.getAttribute('role') || it.tagName.toLowerCase(),
        type: it.getAttribute('type'),
        text: (it.innerText || '').trim().slice(0, 60),
        aria: it.getAttribute('aria-label'),
        checked: it.getAttribute('aria-checked'),
        state: it.getAttribute('data-state'),
        shortcut: (it.querySelector('kbd') || {}).innerText || null,
        w: Math.round(ir.width), h: Math.round(ir.height),
      });
    }
    out.push({
      role: el.getAttribute('role'),
      label: el.getAttribute('aria-label'),
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      text: el.innerText.trim().slice(0, 2000),
      items,
    });
  }
  return out;
})()`

/** Every visible element, keyed by position+size. Diffing two of these finds a
 *  popover whatever role it happens to use — Settings opened something my
 *  role-based selector did not recognise, and guessing at more roles is a worse
 *  strategy than not guessing. */
const VISIBLE = `(() => {
  const out = {};
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    out[Math.round(r.x)+':'+Math.round(r.y)+':'+Math.round(r.width)+':'+Math.round(r.height)] = {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      aria: el.getAttribute('aria-label'),
      text: (el.innerText || '').trim().slice(0, 400),
    };
  }
  return out;
})()`

async function open(p: Page, name: string, tag: string, log: unknown[]) {
  console.log(`\n════ ${name} ════`)
  const before = (await p.evaluate(VISIBLE)) as Record<string, unknown>
  try {
    await p.getByRole('button', { name, exact: true }).first().click({ timeout: 4000 })
  } catch {
    console.log('  (could not click)')
    return
  }
  await p.waitForTimeout(900)
  const surfaces = (await p.evaluate(SURFACES)) as Array<{ text: string; items: unknown[] }>
  const after = (await p.evaluate(VISIBLE)) as Record<string, { tag: string; role: string; aria: string; text: string }>
  await p.screenshot({ path: join(OUT, 'shots', `settings-${tag}.png`) })

  const fresh = Object.entries(after).filter(([k]) => !(k in before))
  if (!surfaces.length) {
    if (!fresh.length) {
      console.log('  nothing appeared — a direct action, not a menu')
    } else {
      console.log(`  ${fresh.length} new elements (no menu role):`)
      // Widest first: the container of a popover is the interesting one.
      fresh
        .sort((a, b) => Number(b[0].split(':')[2]) - Number(a[0].split(':')[2]))
        .slice(0, 6)
        .forEach(([k, v]) => {
          const flat = v.text.split('\n').join(' | ').slice(0, 300)
          console.log(`    [${k}] <${v.tag}> ${v.aria ?? ''}`)
          console.log(`      ${flat}`)
        })
    }
  }
  for (const s of surfaces) {
    console.log(`  panel ${JSON.stringify({ ...s, text: undefined, items: undefined })}`)
    console.log(`  text:\n${s.text.split('\n').map((l) => '    ' + l).join('\n')}`)
    console.log(`  items: ${s.items.length}`)
    for (const it of s.items as Array<Record<string, unknown>>) {
      console.log(`    - ${JSON.stringify(it)}`)
    }
  }
  log.push({ name, surfaces })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
}

async function main() {
  mkdirSync(join(OUT, 'shots'), { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.goto(URL, { waitUntil: 'networkidle', timeout: 60_000 })
  await p.waitForTimeout(3000)

  const log: unknown[] = []
  for (const [name, tag] of [
    ['Settings', 'settings'],
    ['Newt', 'file'],
    ['Color', 'color'],
    ['Share', 'share'],
    ['Layers', 'layers'],
    ['Frames', 'frames'],
    ['Code', 'code'],
  ] as const) {
    await open(p, name, tag, log)
  }

  writeFileSync(join(OUT, 'settings-probe.json'), JSON.stringify(log, null, 2))
  console.log(`\nwritten docs/research/newt/settings-probe.json`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
