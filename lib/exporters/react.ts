/**
 * React exporter. See docs/specs/08-exporters.md §5.
 *
 * Reuses `horizontalRuns` from `lib/exporters/geometry.ts` — never `exportSvg`
 * — per §1's ban on one exporter importing another. A self-contained
 * component: no imports beyond `react`, no required props.
 */

import { flattenFrame, horizontalRuns } from './geometry'
import { splitColor, type ExportResult } from './types'
import { ok, err, type Doc } from '../artwork-core/schema'

export type ReactOptions = { frame?: number; componentName?: string; typescript?: boolean }

const FALLBACK_NAME = 'PixelArt'

/**
 * Sanitised to a valid PascalCase identifier. Capitalising every word is what
 * keeps a hostile `"class"` safe: JS keywords are lowercase-only, so a name
 * that is never left lowercase can never collide with one.
 */
export function sanitizeComponentName(raw: string | undefined): string {
  const words = (raw ?? '').split(/[^a-zA-Z0-9]+/).filter(Boolean)
  let name = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('')
  name = name.replace(/^[0-9]+/, '')
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : FALLBACK_NAME
}

export function exportReact(doc: Doc, opts: ReactOptions = {}): ExportResult {
  const frame = opts.frame ?? 0
  const typescript = opts.typescript ?? true
  const name = sanitizeComponentName(opts.componentName)
  if (!doc.frames[frame]) return err(`frame ${frame} does not exist`)

  const flat = flattenFrame(doc, frame)
  const runs = horizontalRuns(flat, doc.w, doc.h)

  const rectLines = runs.map((r) => {
    const { fill, opacity } = splitColor(doc.palette[r.i]!.c)
    const opacityAttr = opacity !== undefined ? ` fillOpacity={${opacity}}` : ''
    return `      <rect x={${r.x}} y={${r.y}} width={${r.len}} height={1} fill="${fill}"${opacityAttr} />`
  })

  const props = typescript ? `{ size = ${doc.w} }: { size?: number }` : `{ size = ${doc.w} }`
  const height = doc.h === doc.w ? 'size' : `size * (${doc.h} / ${doc.w})`

  const body = [
    `export function ${name}(${props}) {`,
    `  return (`,
    `    <svg viewBox="0 0 ${doc.w} ${doc.h}" width={size} height={${height}} shapeRendering="crispEdges">`,
    ...rectLines,
    `    </svg>`,
    `  )`,
    `}`,
    '',
  ].join('\n')

  const ext = typescript ? 'tsx' : 'jsx'
  return ok({ filename: `${name}.${ext}`, mime: 'text/plain', data: body })
}
