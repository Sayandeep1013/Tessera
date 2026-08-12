import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * See docs/specs/15-feedback-and-input.md §5 and §7.3.
 *
 * Reported: "u have added tooltips but need to add more .. also the tooltip
 * looks like browsers not ours". Every hint was a native `title`, which the
 * browser draws in its own box, in its own font, with its own delay, and with
 * no idea the application has a dark theme.
 *
 * The risk once that migration starts is a half-finished one: a control that
 * carries BOTH our tooltip and a `title` shows ours immediately and then the
 * browser's underneath it a second later, which is worse than either alone.
 * This is the same shape as the token test next door — cheap, static, and it
 * catches the thing a screenshot would not.
 */

const COMPONENTS = join(process.cwd(), 'components')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => join(dir, f))
}

/**
 * `title` as a DOM attribute, not as a prop on one of our own components.
 * GlyphBtn/IconBtn/TextBtn all take a `title` prop that becomes an aria-label,
 * so matching the bare word would be all false positives. A DOM `title` is one
 * indented on its own line inside a lowercase JSX element.
 */
function nativeTitles(src: string): string[] {
  const found: string[] = []
  const lines = src.split(/\r?\n/)
  for (const [i, line] of lines.entries()) {
    if (!/^\s+title=/.test(line)) continue
    // Walk back to the opening tag this attribute belongs to.
    for (let j = i; j >= 0; j--) {
      const open = /<([A-Za-z][A-Za-z0-9]*)\s*$/.exec(lines[j]!) ?? /<([A-Za-z][A-Za-z0-9]*)\s/.exec(lines[j]!)
      if (!open) continue
      const tag = open[1]!
      // Lowercase first letter = a real DOM element. Uppercase = our component.
      if (tag[0] === tag[0]!.toLowerCase()) found.push(`${line.trim()} (on <${tag}>)`)
      break
    }
  }
  return found
}

describe('tooltips are ours, not the browser default', () => {
  it('no component renders a native title attribute', () => {
    const offenders: string[] = []
    for (const file of tsxFiles(COMPONENTS)) {
      for (const hit of nativeTitles(readFileSync(file, 'utf8'))) {
        offenders.push(`${file.slice(process.cwd().length + 1)}: ${hit}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the tooltip takes its colours from tokens', () => {
    const src = readFileSync(join(COMPONENTS, 'Tooltip.tsx'), 'utf8')
    // Rule 8. A tooltip is exactly the sort of small component where a #333
    // gets typed in and never noticed until someone opens the other theme.
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    for (const token of ['--panel', '--fg', '--shadow-lg', '--t-label-sm', '--r-md']) {
      expect(src).toContain(token)
    }
  })

  it('the trigger keeps an accessible name of its own', () => {
    // The tooltip is aria-hidden, so if it were the only name an icon button
    // would announce as nothing at all.
    const src = readFileSync(join(COMPONENTS, 'Tooltip.tsx'), 'utf8')
    expect(src).toContain('aria-hidden')
    expect(src).toContain('role="tooltip"')
  })

  it('every icon-only control still has an accessible name', () => {
    // Removing `title` removed a name as well as a tooltip on some buttons.
    // Any <button> with no text child needs an aria-label.
    const offenders: string[] = []
    for (const file of tsxFiles(COMPONENTS)) {
      const src = readFileSync(file, 'utf8')
      const buttons = src.split('<button').slice(1)
      for (const [i, b] of buttons.entries()) {
        const head = b.slice(0, b.indexOf('>'))
        const body = b.slice(b.indexOf('>'), b.indexOf('</button>'))
        const hasName = /aria-label/.test(head) || /[A-Za-z]{2,}/.test(body.replace(/<[^>]*>/g, ''))
        if (!hasName) offenders.push(`${file.slice(process.cwd().length + 1)} button #${i + 1}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
