/**
 * React exporter. See docs/specs/08-exporters.md §5.
 *
 * Reuses `horizontalRuns` from `lib/exporters/geometry.ts` — never `exportSvg`
 * — per §1's ban on one exporter importing another. A self-contained
 * component: no imports beyond `react`, no required props.
 */

import { flattenFrame, horizontalRuns } from './geometry'
import { formatPct, frameWindows, hardCutEpsilon } from './timeline'
import { splitColor, type ExportResult } from './types'
import { ok, err, type Doc } from '../artwork-core/schema'

export type ReactOptions = {
  frame?: number
  componentName?: string
  typescript?: boolean
  /** Phase 5 (§13.4): every frame as its own `<g>`, cycling `visibility` on a
   *  shared `@keyframes` timeline. Ignores `frame` — there is no single frame
   *  to pick once the whole document is animating. */
  animated?: boolean
}

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

function rectLinesForFrame(doc: Doc, frame: number, indent: string): string[] {
  const flat = flattenFrame(doc, frame)
  return horizontalRuns(flat, doc.w, doc.h).map((r) => {
    const { fill, opacity } = splitColor(doc.palette[r.i]!.c)
    const opacityAttr = opacity !== undefined ? ` fillOpacity={${opacity}}` : ''
    return `${indent}<rect x={${r.x}} y={${r.y}} width={${r.len}} height={1} fill="${fill}"${opacityAttr} />`
  })
}

/**
 * One `visibility` keyframe rule per frame — a hold at `visible` across the
 * frame's own share of the timeline, a hard cut (`hardCutEpsilon`) to
 * `hidden` at each edge shared with a neighbour, so nothing ever blends two
 * frames the document never drew as one.
 */
function keyframesFor(name: string, i: number, frames: readonly { ms: number }[]): string {
  const { start, end } = frameWindows(frames)[i]!
  const eps = hardCutEpsilon(end - start)
  const points: Array<[number, 'visible' | 'hidden']> = []
  if (start > 0) {
    points.push([0, 'hidden'])
    points.push([Math.max(0, start - eps), 'hidden'])
  }
  points.push([start, 'visible'])
  points.push([end, 'visible'])
  if (end < 100) {
    points.push([Math.min(100, end + eps), 'hidden'])
    points.push([100, 'hidden'])
  }
  const stops = points.map(([pct, v]) => `${formatPct(pct)}% { visibility: ${v}; }`).join(' ')
  return `@keyframes ${name}-f${i} { ${stops} }`
}

export function exportReact(doc: Doc, opts: ReactOptions = {}): ExportResult {
  const typescript = opts.typescript ?? true
  const name = sanitizeComponentName(opts.componentName)
  const props = typescript ? `{ size = ${doc.w} }: { size?: number }` : `{ size = ${doc.w} }`
  const height = doc.h === doc.w ? 'size' : `size * (${doc.h} / ${doc.w})`
  const ext = typescript ? 'tsx' : 'jsx'

  if (opts.animated) {
    if (doc.frames.length === 0) return err('document has no frames')
    const totalMs = doc.frames.reduce((sum, f) => sum + f.ms, 0)

    const keyframes = doc.frames.map((_, i) => keyframesFor(name, i, doc.frames)).join('\n')
    const groups = doc.frames.flatMap((_, i) => [
      `      <g style={{ animation: '${name}-f${i} ${totalMs}ms linear infinite' }}>`,
      ...rectLinesForFrame(doc, i, '        '),
      `      </g>`,
    ])

    const body = [
      `export function ${name}(${props}) {`,
      `  return (`,
      `    <svg viewBox="0 0 ${doc.w} ${doc.h}" width={size} height={${height}} shapeRendering="crispEdges">`,
      `      <style>{\`\n${keyframes}\n\`}</style>`,
      ...groups,
      `    </svg>`,
      `  )`,
      `}`,
      '',
    ].join('\n')

    return ok({ filename: `${name}.${ext}`, mime: 'text/plain', data: body })
  }

  const frame = opts.frame ?? 0
  if (!doc.frames[frame]) return err(`frame ${frame} does not exist`)

  const body = [
    `export function ${name}(${props}) {`,
    `  return (`,
    `    <svg viewBox="0 0 ${doc.w} ${doc.h}" width={size} height={${height}} shapeRendering="crispEdges">`,
    ...rectLinesForFrame(doc, frame, '      '),
    `    </svg>`,
    `  )`,
    `}`,
    '',
  ].join('\n')

  return ok({ filename: `${name}.${ext}`, mime: 'text/plain', data: body })
}
