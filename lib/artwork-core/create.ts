/**
 * Document factories. See docs/specs/03-artwork-core.md §7.
 *
 * `artwork-core` does not generate IDs — they are injected, so this module stays
 * pure and testable.
 */

import { parseDoc } from './codec'
import { FORMAT_VERSION, type Doc, type PaletteEntry } from './schema'
import faceJson from './fixtures/starters/face.tessera.json'
import logoJson from './fixtures/logo.tessera.json'

/** Transparent plus a compact ramp that is immediately usable for drawing. */
export const DEFAULT_PALETTE: PaletteEntry[] = [
  { c: 'transparent' },
  { c: '#1a1c2c', n: 'ink' },
  { c: '#5d275d', n: 'plum' },
  { c: '#b13e53', n: 'wine' },
  { c: '#ef7d57', n: 'coral' },
  { c: '#ffcd75', n: 'sand' },
  { c: '#a7f070', n: 'lime' },
  { c: '#38b764', n: 'green' },
  { c: '#257179', n: 'teal' },
  { c: '#29366f', n: 'navy' },
  { c: '#3b5dc9', n: 'blue' },
  { c: '#41a6f6', n: 'sky' },
  { c: '#73eff7', n: 'ice' },
  { c: '#f4f4f4', n: 'white' },
  { c: '#94b0c2', n: 'grey' },
  { c: '#566c86', n: 'slate' },
]

export function createDoc(opts: {
  id: string
  w?: number
  h?: number
  name?: string
  palette?: PaletteEntry[]
  now?: string
}): Doc {
  const w = opts.w ?? 32
  const h = opts.h ?? 32
  const now = opts.now ?? new Date().toISOString()
  return {
    v: FORMAT_VERSION,
    id: opts.id,
    name: opts.name ?? '',
    w,
    h,
    palette: (opts.palette ?? DEFAULT_PALETTE).map((p) => ({ ...p })),
    frames: [{ ms: 100, layers: [{ n: 'base', px: new Uint8Array(w * h) }] }],
    meta: { createdAt: now, updatedAt: now },
  }
}

export type StarterName = 'face'

const STARTERS: Record<StarterName, unknown> = {
  face: faceJson,
}

/**
 * Returns a FRESH document each call — two loads must not share pixel buffers.
 * Throws if a fixture is malformed, because that is a build error, not user input.
 */
export function loadStarter(name: StarterName): Doc {
  const r = parseDoc(STARTERS[name])
  if (!r.ok) {
    throw new Error(`starter fixture "${name}" is invalid: ${r.error.code} ${r.error.message}`)
  }
  return r.value
}

export function listStarters(): StarterName[] {
  return Object.keys(STARTERS) as StarterName[]
}

/**
 * The Tessera mark, as a real document in our own format.
 *
 * Four tesserae, one lifted — the name means tile. It is deliberately not an SVG
 * of hand-placed rects: the logo is drawn in the editor's format, from the
 * editor's own default palette, so it can be opened and edited like any other
 * artwork and so the favicon and the header mark can never drift apart.
 * `tools/gen-icon.ts` renders app/icon.svg from this same file.
 */
export function loadLogo(): Doc {
  const r = parseDoc(logoJson)
  if (!r.ok) {
    throw new Error(`logo fixture is invalid: ${r.error.code} ${r.error.message}`)
  }
  return r.value
}
