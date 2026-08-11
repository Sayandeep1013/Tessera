/**
 * Render the favicon from the logo sprite.
 *
 *   npx tsx tools/gen-icon.ts
 *
 * Writes app/icon.svg, which the App Router picks up automatically as the tab
 * icon. Generated rather than hand-drawn so the tab icon and the header mark are
 * literally the same document — see lib/artwork-core/fixtures/logo.tessera.json.
 *
 * SVG rather than PNG on purpose: the mark is 16 pixels wide, so an SVG of flat
 * rects with shape-rendering="crispEdges" is both smaller than a PNG and exact at
 * every size a browser asks for.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadLogo } from '../lib/artwork-core/create'
import { spriteToSvg } from '../lib/renderer/sprite-svg'

const doc = loadLogo()
const svg = spriteToSvg(doc)
const out = join(process.cwd(), 'app', 'icon.svg')

writeFileSync(out, svg + '\n', 'utf8')
console.log(`app/icon.svg  ${doc.w}x${doc.h}  ${svg.length} bytes`)
