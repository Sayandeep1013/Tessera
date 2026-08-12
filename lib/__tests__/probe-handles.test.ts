/**
 * Every `#id` a probe reaches for must still exist in the app.
 *
 * **Why this file exists.** B1 renamed a File-menu item and silently broke
 * `tools/probe-layers.ts` and `tools/probe-zoom.ts` — neither of which is about
 * the File menu, and neither of which runs under `npm test`, because every
 * browser probe needs a dev server. Both failed only when somebody happened to
 * run them. That is the standing weakness recorded in HANDOFF §11: panel wiring
 * has no CI guard.
 *
 * This does not fix that in general — a probe can still be broken by a changed
 * label, a moved element or a new confirm step. What it fixes is the specific
 * and most common way a probe rots: it names an element that no longer has that
 * id. Those handles exist *for* the probes, so a test can hold both ends.
 *
 * It is a static scan, so it costs nothing and needs no browser.
 *
 * Adding a handle: give it an `id` literal in a component, or build it from a
 * function that also feeds `fileMenuDomHandles`. Do not silence this test by
 * widening the allow-list.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileMenuDomHandles } from '../editor/file-menu'
import { listStarters } from '../artwork-core/create'

const ROOT = process.cwd()
const TOOLS = join(ROOT, 'tools')
const COMPONENTS = join(ROOT, 'components')

/** `page.locator('#foo')` / `querySelector('#foo')`, and nothing else — a bare
 *  `'#ffffff'` in a palette fixture is a colour, not a selector. */
const SELECTOR = /(?:locator|querySelector|querySelectorAll)\(\s*['"`]#([A-Za-z][\w-]*)/g

function read(dir: string, ext: string): Array<[string, string]> {
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => [f, readFileSync(join(dir, f), 'utf8')] as [string, string])
}

/** Every id selector each probe uses, keyed by file. */
function selectorsByProbe(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const [file, src] of read(TOOLS, '.ts')) {
    const ids = new Set<string>()
    for (const m of src.matchAll(SELECTOR)) ids.add(m[1]!)
    if (ids.size) out.set(file, ids)
  }
  return out
}

/**
 * Ids a component renders. Literal `id="x"` / `id={'x'}` are read straight out
 * of the source; anything built from a template literal is contributed by the
 * module that builds it, so the component and the allow-list cannot drift.
 */
function renderedIds(): Set<string> {
  const ids = new Set<string>(fileMenuDomHandles(listStarters()))
  for (const [, src] of read(COMPONENTS, '.tsx')) {
    for (const m of src.matchAll(/\bid=(?:"([\w-]+)"|\{\s*['"`]([\w-]+)['"`]\s*\})/g)) {
      ids.add((m[1] ?? m[2])!)
    }
  }
  return ids
}

describe('probe DOM handles', () => {
  it('finds probes that use id selectors at all', () => {
    // A guard on the guard: if the scan silently matched nothing, every
    // assertion below would pass vacuously. That is the failure mode this whole
    // file exists to prevent, so it must not have it itself.
    const byProbe = selectorsByProbe()
    expect(byProbe.size).toBeGreaterThan(0)
    expect([...byProbe.values()].reduce((n, s) => n + s.size, 0)).toBeGreaterThan(4)
  })

  it('every id a probe reaches for is one the app renders', () => {
    const rendered = renderedIds()
    const orphans: string[] = []
    for (const [file, ids] of selectorsByProbe()) {
      for (const id of ids) if (!rendered.has(id)) orphans.push(`${file} → #${id}`)
    }
    expect(orphans, 'a probe names an element that no longer exists').toEqual([])
  })

  it('the File menu still renders every handle it declares', () => {
    const src = readFileSync(join(COMPONENTS, 'Chrome.tsx'), 'utf8')
    // The builders, not the strings — the point is that Chrome.tsx cannot hand-
    // write an id that fileMenuDomHandles does not know about.
    for (const fn of ['menuItemDomId(', 'exampleDomId(', 'CONFIRM_DOM_ID.']) {
      expect(src, `Chrome.tsx should build ids with ${fn}`).toContain(fn)
    }
    expect(fileMenuDomHandles(listStarters()).length).toBeGreaterThan(6)
  })
})
