/**
 * The logic behind the Canvas tab's size control. See docs/specs/16-settings.md §4.
 *
 * Pure and separate from the component for one reason: `npm test` runs in a
 * node environment, so a control that lives entirely inside a `.tsx` has no CI
 * guard at all (HANDOFF §11). Everything here — which preset a size is, whether
 * a typed dimension is usable, how many pixels a shrink costs, and the exact
 * words that says so — is a decision the panel makes, and every one of them is
 * testable without a browser. What is left in Settings.tsx is genuinely only
 * markup and one call to commit().
 *
 * The transform itself is not here. `resizeDoc` and `pixelsLostOnResize` live in
 * artwork-core, which imports nothing but zod; this module is allowed to know
 * about the editor and merely reads them.
 */

import { MAX_DIM, type Doc } from '../artwork-core/schema'
import { pixelsLostOnResize } from '../artwork-core/resize'

/** The schema's floor. A 1xN canvas is legal — spec 16 S-E3 assumes it. */
export const MIN_DIM = 1

export type PresetId =
  | '16' | '32' | '64' | '128' | '256'
  | '16:9' | 'banner' | 'portrait'
  | 'custom'

export type SizePreset = { id: Exclude<PresetId, 'custom'>; label: string; w: number; h: number }

/**
 * Eight sized presets, laid out three across with Custom as the ninth cell.
 *
 * The aspect three are ours rather than the reference's, sized to keep the
 * pixel count sane: 16:9 at 64x36 is a wallpaper you can still hand-place
 * pixels in, where a true 1920x1080 is not a pixel-art canvas at all. Banner
 * and Portrait follow the same reasoning. Spec 16 §4.1.
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: '16', label: '16', w: 16, h: 16 },
  { id: '32', label: '32', w: 32, h: 32 },
  { id: '64', label: '64', w: 64, h: 64 },
  { id: '128', label: '128', w: 128, h: 128 },
  { id: '256', label: '256', w: 256, h: 256 },
  { id: '16:9', label: '16:9', w: 64, h: 36 },
  { id: 'banner', label: 'Banner', w: 128, h: 32 },
  { id: 'portrait', label: 'Portrait', w: 48, h: 64 },
]

/**
 * Which preset a size is, or `custom` when it is none of them.
 *
 * This is what makes the presets and the inputs one mechanism rather than two
 * (spec 16 §4.1): the selected preset is *derived* from the pending numbers, so
 * typing 64 and 64 by hand lights up the `64` pill, and there is no second piece
 * of state that can disagree with the fields.
 */
export function presetFor(w: number, h: number): PresetId {
  return SIZE_PRESETS.find((p) => p.w === w && p.h === h)?.id ?? 'custom'
}

/** Whether a preset can be applied at all — S-E1, evaluated per preset. */
export const presetAllowed = (p: SizePreset): boolean =>
  p.w >= MIN_DIM && p.w <= MAX_DIM && p.h >= MIN_DIM && p.h <= MAX_DIM

/** The one sentence the panel says when a typed dimension is out of range. */
export const DIM_RANGE_HINT = `Width and height run from ${MIN_DIM} to ${MAX_DIM}.`

export type DimResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'range'; message: string }

/**
 * A typed width or height.
 *
 * `empty` is a distinct outcome from `range` because it is not an error: a field
 * being briefly blank is what backspacing over `16` looks like, and telling
 * someone off mid-keystroke is worse than the mistake. The panel disables apply
 * for both and only shows a message for `range`.
 *
 * Rejects anything non-integer outright rather than rounding — `16.5` typed into
 * a pixel canvas is a misunderstanding, and silently making it 16 hides that.
 */
export function parseDim(text: string): DimResult {
  const t = text.trim()
  if (t === '') return { ok: false, reason: 'empty', message: '' }
  if (!/^\d+$/.test(t)) return { ok: false, reason: 'range', message: DIM_RANGE_HINT }
  const n = Number(t)
  if (n < MIN_DIM || n > MAX_DIM) return { ok: false, reason: 'range', message: DIM_RANGE_HINT }
  return { ok: true, value: n }
}

export type Pending =
  /** Not applicable yet — a field is blank or out of range. */
  | { kind: 'invalid'; message: string }
  /** Valid, and equal to what the document already is. Apply is disabled. */
  | { kind: 'same'; w: number; h: number }
  /** Valid and different. `lost` is 0 unless the resize crops painted pixels. */
  | { kind: 'ready'; w: number; h: number; lost: number }

/**
 * What the apply button should say and whether it should be pressable.
 *
 * Takes the raw field text rather than numbers so that every state the control
 * can be in is reachable from a test — including the two that only exist
 * mid-keystroke.
 */
export function pendingSize(doc: Doc | null, wText: string, hText: string): Pending {
  const w = parseDim(wText)
  const h = parseDim(hText)
  if (!w.ok || !h.ok) {
    const message = (!w.ok && w.message) || (!h.ok && h.message) || ''
    return { kind: 'invalid', message }
  }
  if (!doc) return { kind: 'invalid', message: '' }
  if (w.value === doc.w && h.value === doc.h) return { kind: 'same', w: w.value, h: h.value }
  return { kind: 'ready', w: w.value, h: h.value, lost: pixelsLostOnResize(doc, w.value, h.value) }
}

/** `16×16`. The apply button's whole label — spec 16 §4.1 point 1. */
export const sizeLabel = (w: number, h: number): string => `${w}×${h}`

/**
 * S-E2, said before it happens.
 *
 * Rule 7 is that artwork is never silently discarded, and a crop is the one
 * operation in the editor that discards it on purpose. It stays allowed — it is
 * undoable and the command carries every lost byte — but the count is on screen
 * before the button is pressed, not in a toast after.
 */
export function lossWarning(lost: number, w: number, h: number): string | null {
  if (lost <= 0) return null
  const one = lost === 1
  const subject = one ? '1 painted pixel falls' : `${lost} painted pixels fall`
  return `${subject} outside ${sizeLabel(w, h)} and will be dropped. Undo restores ${one ? 'it' : 'them'}.`
}
