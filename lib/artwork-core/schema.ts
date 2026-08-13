/**
 * Document schema — the single source of truth for a Tessera artwork.
 *
 * Two shapes exist for the same document:
 *   - Serialized: `px` is `string[]`, one character per pixel. This is what goes
 *     on disk, on the wire, into the code panel, and into the AI's text grid.
 *   - Runtime: `px` is a flat `Uint8Array` of length w*h. This is what the editor
 *     and renderer operate on.
 *
 * See docs/SPEC.md §2.
 */

import { z } from 'zod'

export const FORMAT_VERSION = 1 as const

/** Palette index 0 is always transparent and is not user-removable. */
export const TRANSPARENT_INDEX = 0
export const TRANSPARENT_CHAR = '.'

/** 1 (transparent) + 9 (digits 1-9) + 26 (a-z) = 36. */
export const MAX_PALETTE = 36
export const MAX_DIM = 256
/** Artwork name. Named rather than inlined because `copyName` has to fit inside it. */
export const MAX_NAME = 128
export const MIN_FRAME_MS = 10
export const MAX_FRAME_MS = 10_000

// ---------------------------------------------------------------------------
// Runtime types
// ---------------------------------------------------------------------------

export type PaletteEntry = { c: string; n?: string }

/**
 * The eight supported blend modes. Names match the CSS Compositing spec, which
 * `GlobalCompositeOperation` also speaks — the renderer needs no translation
 * table beyond an identity cast. The six non-separable HSL modes (hue,
 * saturation, color, luminosity) are a deliberate cut: rare in pixel art, and
 * each one is a row in a dropdown nobody asked for. See 14-layers.md §12.2.1.
 */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
  'exclusion',
] as const
export type BlendMode = (typeof BLEND_MODES)[number]
export const DEFAULT_BLEND_MODE: BlendMode = 'normal'
/** Percent, 0-100. Omitted on a layer means fully opaque. */
export const DEFAULT_OPACITY = 100

export type Layer = {
  n: string
  hidden?: boolean
  /** Opacity, percent 0-100. Omitted means DEFAULT_OPACITY (opaque). */
  o?: number
  /** Omitted means DEFAULT_BLEND_MODE ('normal'). */
  mode?: BlendMode
  /** Flat, row-major, length w*h. Each value is a palette index. */
  px: Uint8Array
}

export type Frame = { ms: number; layers: Layer[] }

export type Doc = {
  v: typeof FORMAT_VERSION
  id: string
  name: string
  w: number
  h: number
  palette: PaletteEntry[]
  frames: Frame[]
  meta: { createdAt: string; updatedAt: string }
}

// ---------------------------------------------------------------------------
// Result — parsing and op application never throw
// ---------------------------------------------------------------------------

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export type DocError = { code: string; message: string; path?: string }

// ---------------------------------------------------------------------------
// Serialized schema (zod)
// ---------------------------------------------------------------------------

/** `transparent`, `#rrggbb`, or `#rrggbbaa` — lowercase, long form only. */
const colorSchema = z
  .string()
  .refine((s) => s === 'transparent' || /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(s), {
    message: 'color must be "transparent", "#rrggbb", or "#rrggbbaa" (lowercase)',
  })

export const paletteEntrySchema = z.object({
  c: colorSchema,
  n: z.string().max(32).optional(),
})

export const serializedLayerSchema = z.object({
  n: z.string().max(32),
  hidden: z.boolean().optional(),
  o: z.number().int().min(0).max(100).optional(),
  mode: z.enum(BLEND_MODES).optional(),
  px: z.array(z.string()).min(1),
})

export const serializedFrameSchema = z.object({
  ms: z.number().int().min(MIN_FRAME_MS).max(MAX_FRAME_MS),
  layers: z.array(serializedLayerSchema).min(1),
})

export const serializedDocSchema = z.object({
  v: z.literal(FORMAT_VERSION),
  id: z.string().min(1).max(64),
  name: z.string().max(MAX_NAME),
  w: z.number().int().min(1).max(MAX_DIM),
  h: z.number().int().min(1).max(MAX_DIM),
  palette: z.array(paletteEntrySchema).min(1).max(MAX_PALETTE),
  frames: z.array(serializedFrameSchema).min(1),
  meta: z.object({ createdAt: z.string(), updatedAt: z.string() }),
})

export type SerializedDoc = z.infer<typeof serializedDocSchema>
export type SerializedLayer = z.infer<typeof serializedLayerSchema>
