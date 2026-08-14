/**
 * Rule 08§1.2: no exporter imports another exporter. A static scan of the
 * import specifiers in each `lib/exporters/*.ts` module, not a runtime trace —
 * an exporter importing another one would be exactly the "one exporter's bug
 * fix silently changes another's output" the rule exists to prevent.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(process.cwd(), 'lib', 'exporters')
const EXPORTER_FILES = [
  'png.ts', 'svg.ts', 'css.ts', 'react.ts', 'json.ts', 'ascii.ts', 'spritesheet.ts', 'gif.ts',
]

function importSpecifiers(src: string): string[] {
  return [...src.matchAll(/from ['"](\.[^'"]+)['"]/g)].map((m) => m[1]!)
}

describe('no exporter imports another', () => {
  it('every exporter file exists, so this test cannot pass vacuously', () => {
    const found = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    for (const f of EXPORTER_FILES) expect(found).toContain(f)
  })

  it.each(EXPORTER_FILES)('%s imports no other exporter', (file) => {
    const src = readFileSync(join(DIR, file), 'utf8')
    const others = EXPORTER_FILES.filter((f) => f !== file).map((f) => f.replace(/\.ts$/, ''))
    for (const spec of importSpecifiers(src)) {
      if (!spec.startsWith('./')) continue // only a same-directory import can be another exporter
      expect(others, `${file} imports ${spec}`).not.toContain(spec.slice(2))
    }
  })
})
