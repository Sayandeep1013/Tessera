/**
 * Rule 8: colours come from tokens in app/globals.css, no hard-coded hex in any
 * .tsx. This enforces the half of that rule that was silently broken — a var()
 * pointing at a token that does not exist.
 *
 * Undefined custom properties do not warn, do not throw, and do not show up in a
 * typecheck. They resolve to nothing, so a background disappears and a shadow
 * never renders. Eight of these had accumulated in the AI proposal bar, which is
 * why it looked unfinished.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const CSS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8')

/** Supplied by next/font on the <html> element, not declared in globals.css. */
const EXTERNAL = new Set(['--font-geist-sans', '--font-geist-mono'])

function definedTokens(files: string[]): Set<string> {
  const out = new Set<string>(EXTERNAL)
  for (const m of CSS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) out.add(m[1]!)

  // Per-element custom properties set inline in JSX — `['--d' as string]: n` —
  // are genuinely defined, just not in the stylesheet. The loaders use them to
  // give each cell its own animation delay, which is the whole mechanism. Not an
  // allowlist: it reads the actual assignments, so a typo still fails.
  for (const file of files.filter((f) => f.endsWith('.tsx'))) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/\[\s*'(--[a-z0-9-]+)'\s+as\s+string\s*\]\s*:/g)) out.add(m[1]!)
  }
  return out
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (['.ts', '.tsx', '.css'].includes(extname(entry))) acc.push(full)
  }
  return acc
}

/** Shipped source only — tests talk *about* tokens and would flag themselves. */
const FILES = ['app', 'components', 'lib']
  .flatMap((d) => sourceFiles(join(ROOT, d)))
  .filter((f) => !f.includes('__tests__'))

/**
 * A `token-exempt:` comment covers its own line and the three that follow, so it
 * can sit above the code it justifies. Exemptions are meant to be rare, visible
 * and argued — the alternative is loosening the rule until it catches nothing.
 */
function exemptLines(lines: string[]): Set<number> {
  const out = new Set<number>()
  lines.forEach((text, i) => {
    if (!text.includes('token-exempt:')) return
    for (let n = i; n <= i + 3; n++) out.add(n)
  })
  return out
}

describe('design tokens', () => {
  it('every var(--token) reference resolves to a declared token', () => {
    const defined = definedTokens(FILES)
    const dangling: string[] = []

    for (const file of FILES) {
      const text = readFileSync(file, 'utf8')
      // `var(--x, fallback)` cannot fail — the fallback IS the definition.
      for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,?)/g)) {
        if (m[2] === ',') continue
        if (defined.has(m[1]!)) continue
        const line = text.slice(0, m.index).split('\n').length
        dangling.push(`${file.slice(ROOT.length + 1)}:${line} → ${m[1]}`)
      }
    }

    expect(dangling).toEqual([])
  })

  it('declares the same token set in both themes', () => {
    // A token defined only in dark renders as nothing in light, which is the same
    // silent failure one level up.
    const flat = CSS.replace(/\s+/g, ' ')
    const block = (selector: string) => {
      const at = flat.indexOf(selector)
      if (at === -1) return null
      const open = flat.indexOf('{', at)
      return flat.slice(open, flat.indexOf('}', open))
    }

    const dark = block(':root, .dark')
    const light = block('.light')
    expect(dark).not.toBeNull()
    expect(light).not.toBeNull()

    const names = (s: string) => [...s.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!)
    expect([...names(light!)].sort()).toEqual([...names(dark!)].sort())
  })

  it('no hard-coded hex colours in components', () => {
    // Genuine exceptions exist — a themeColor meta tag is read by the OS and
    // cannot be a CSS variable, and artwork colours are document data rather than
    // design tokens. Those get an explicit `token-exempt:` comment on the line so
    // the exception is visible and justified in review, instead of the rule being
    // watered down until it stops catching anything.
    const offenders: string[] = []
    for (const file of FILES.filter((f) => f.endsWith('.tsx'))) {
      const lines = readFileSync(file, 'utf8').split('\n')
      const exempt = exemptLines(lines)
      lines.forEach((text, i) => {
        if (exempt.has(i)) return
        for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1} → ${m[0]}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
