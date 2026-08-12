/**
 * A draft saved before layers shipped must still open. See docs/specs/14-layers.md §8.8.
 *
 * The fixture is a committed copy of exactly what `saveDraft` wrote — the string
 * form, not a reconstruction — so it keeps testing the OLD shape after the code
 * moves on. Regenerating it from today's `serializeDoc` would make this test
 * assert nothing.
 *
 * docs/specs/14-layers.md §0.1 explains why there is no migration to run: undo
 * history is never persisted and the serialized document shape did not change.
 * That is a claim, and this is the test that keeps it honest.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDoc, serializeDoc } from '../../artwork-core/codec'
import { clampLayer } from '../../artwork-core/layers'

const RAW = readFileSync(
  join(process.cwd(), 'lib/artwork-core/fixtures/legacy/pre-layers-draft.tessera.json'),
  'utf8',
)

describe('a pre-layers draft', () => {
  it('parses', () => {
    const r = parseDoc(RAW)
    expect(r.ok).toBe(true)
  })

  it('opens with exactly one layer, and that layer is selectable', () => {
    const r = parseDoc(RAW)
    if (!r.ok) throw new Error(r.error.message)
    expect(r.value.frames).toHaveLength(1)
    expect(r.value.frames[0]!.layers).toHaveLength(1)
    expect(clampLayer(r.value, 0, 0)).toBe(0)
    // Whatever the store held before, it lands somewhere valid.
    expect(clampLayer(r.value, 0, 7)).toBe(0)
  })

  it('still has its pixels', () => {
    const r = parseDoc(RAW)
    if (!r.ok) throw new Error(r.error.message)
    const px = r.value.frames[0]!.layers[0]!.px
    expect(px).toHaveLength(r.value.w * r.value.h)
    expect(px.some((v) => v !== 0)).toBe(true)
  })

  it('round-trips byte-for-byte through the current codec', () => {
    const r = parseDoc(RAW)
    if (!r.ok) throw new Error(r.error.message)
    expect(serializeDoc(r.value)).toBe(RAW)
  })

  it('is still at format version 1 — this unit added no field to the file', () => {
    expect(JSON.parse(RAW).v).toBe(1)
    expect(JSON.parse(RAW).frames[0].layers[0]).not.toHaveProperty('layer')
  })
})
