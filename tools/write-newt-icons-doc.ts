/**
 * Renders docs/research/newt/icons.md from icons.json + icons-390.json.
 *   npx tsx tools/write-newt-icons-doc.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'docs', 'research', 'newt')

type Icon = {
  index: number
  box: { x: number; y: number; w: number; h: number }
  viewBox: string | null
  classes?: string
  computed: Record<string, string>
  outerHTML: string
  shapes?: Array<Record<string, string>>
  host?: {
    tag: string
    sel?: string
    title?: string
    text?: string
    box: { x: number; y: number; w: number; h: number }
    background: string
    color: string
    borderRadius: string
    boxShadow?: string
    pressed?: string
    disabled?: boolean
  }
}

const desktop: Icon[] = JSON.parse(readFileSync(join(OUT, 'icons.json'), 'utf8'))
const mobile: Icon[] = JSON.parse(readFileSync(join(OUT, 'icons-390.json'), 'utf8'))

function radius(r: string) {
  return r.startsWith('3.35') ? '9999px (pill)' : r
}

function section(icons: Icon[], label: string, seen: Set<string>) {
  const lines: string[] = []
  for (const ic of icons) {
    const key = ic.outerHTML.replace(/ class="[^"]*"/, '')
    const dup = seen.has(key)
    seen.add(key)
    const h = ic.host
    lines.push(`### ${label} #${ic.index} — ${h?.title ?? h?.text ?? '(no label)'}`)
    lines.push('')
    lines.push(`| field | value |`)
    lines.push(`| --- | --- |`)
    lines.push(`| icon box (page px) | x ${ic.box.x}, y ${ic.box.y}, ${ic.box.w}×${ic.box.h} |`)
    lines.push(`| rendered size | ${ic.computed.width} × ${ic.computed.height} |`)
    lines.push(`| viewBox | \`${ic.viewBox}\` |`)
    lines.push(`| svg class | \`${ic.classes ?? '—'}\` |`)
    lines.push(`| fill (computed) | ${ic.computed.fill} |`)
    lines.push(`| stroke (computed) | ${ic.computed.stroke} · width ${ic.computed.strokeWidth} |`)
    lines.push(`| opacity | ${ic.computed.opacity} |`)
    if (h) {
      lines.push(`| host element | \`<${h.tag}>\` ${h.pressed ? `aria-pressed=${h.pressed}` : ''} ${h.disabled ? '**disabled**' : ''} |`)
      lines.push(`| host box (page px) | x ${h.box.x}, y ${h.box.y}, ${h.box.w}×${h.box.h} |`)
      lines.push(`| host background | ${h.background} |`)
      lines.push(`| host color | ${h.color} |`)
      lines.push(`| host radius | ${radius(h.borderRadius)} |`)
      if (h.text) lines.push(`| host text | "${h.text}" |`)
    }
    lines.push('')
    if (dup) lines.push('_Same artwork as an earlier entry in this file._\n')
    lines.push('```html')
    lines.push(ic.outerHTML)
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}

const seen = new Set<string>()
const md: string[] = []
md.push('# newt.sh — icon inventory')
md.push('')
md.push('Captured from the live public page at 1440×900 (desktop) and 390×844 (mobile).')
md.push('Every `<svg>` on the page, verbatim `outerHTML`, with the button it sits in.')
md.push('')
md.push('**Family:** all UI glyphs are [Phosphor Icons](https://phosphoricons.com/) *Regular*')
md.push('weight — `viewBox="0 0 256 256"`, single `<path>`, `fill="currentColor"`, **no stroke**')
md.push('(computed `stroke: none`, so `stroke-width` / `stroke-linecap` / `stroke-linejoin` are')
md.push('irrelevant — these are filled silhouettes, not stroked outlines).')
md.push('Every glyph is authored `width="1em" height="1em"` and sized by Tailwind classes')
md.push('(`h-3 w-3` = 12px, `h-4 w-4` = 16px, `h-5 w-5` = 20px, `h-6 w-6` = 24px).')
md.push('')
md.push('The **only** exception is the Newt logo, which is hand-authored pixel art on a')
md.push('16×16 grid built from `<rect>` elements with `shape-rendering="crispEdges"`.')
md.push('')
md.push('---')
md.push('')
md.push('## Desktop (1440×900) — 25 SVGs')
md.push('')
md.push(section(desktop, 'D', seen))
md.push('---')
md.push('')
md.push('## Mobile (390×844) — 20 SVGs')
md.push('')
md.push('Only the icons that do **not** appear in the desktop list are new here (Undo, Redo,')
md.push('“More”); the rest are the same artwork at different positions.')
md.push('')
md.push(section(mobile, 'M', new Set()))

writeFileSync(join(OUT, 'icons.md'), md.join('\n'), 'utf8')
console.log('wrote icons.md')
