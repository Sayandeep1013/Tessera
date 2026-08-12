'use client'

/**
 * The only part of Paste image that touches the browser.
 * See docs/specs/17-file-menu.md §9.5.
 *
 * Deliberately thin. Everything that decides anything — where the image lands,
 * how it is resampled, which palette entry it becomes, what the result says —
 * is pure and lives in `artwork-core` and `paste.ts`, so the feature is
 * testable in node. What is left here is "get me some RGBA", which cannot be,
 * and which is therefore kept to functions with one job each.
 *
 * **§2's fallback ladder is upside down and this module is the measurement.**
 * The spec says to use `navigator.clipboard.read()` and fall back to the paste
 * event. It is the other way round: the paste event carries `clipboardData` on
 * the gesture itself, so it needs no permission, no prompt and no user-agent
 * exceptions, while `clipboard.read()` needs a permission the user has to grant
 * and is the half that is missing in Firefox. The event is the good path; the
 * API is what the *menu item* has to use, because nobody pressed a key.
 */

import type { Rgba } from '../artwork-core/fit-image'
import type { PasteFailure } from './paste'

/**
 * The long edge a decoded image is capped at before its pixels are read back.
 *
 * A 6000×4000 photo is 96MB of `ImageData` and a `getImageData` big enough to
 * fail on a phone. The destination is at most 256, so 1024 is four times more
 * detail than the box average can use — the cap costs nothing measurable and
 * removes the failure. `pasteImageCommand` is told the original size separately
 * so the message still quotes what the user actually copied.
 */
export const MAX_SOURCE_EDGE = 1024

const IMAGE = /^image\//

export type Decoded = {
  rgba: Rgba
  /** The image's own size, before the cap above. What the message quotes. */
  source: { w: number; h: number }
}

/**
 * `cancelled` is not a failure with a message: the user closed a file dialog
 * they opened, so they already know what happened, and "No image on the
 * clipboard" about a picker they just dismissed would be actively misleading.
 * It is the one outcome that says nothing.
 */
export type ImageResult =
  | { ok: true; image: Decoded }
  | { ok: false; reason: PasteFailure | 'cancelled' }

// ─── getting a blob ──────────────────────────────────────────────────────────

/**
 * An image off a paste event, or null. Never throws.
 *
 * Both `files` and `items` are checked: browsers disagree about which one an
 * image lands in, and a screenshot pasted from the system clipboard is not
 * always a `File`.
 */
export function imageFromPasteEvent(e: ClipboardEvent): Blob | null {
  const dt = e.clipboardData
  if (!dt) return null
  for (const f of Array.from(dt.files ?? [])) if (IMAGE.test(f.type)) return f
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && IMAGE.test(item.type)) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  return null
}

/**
 * The menu item's path: ask the Clipboard API directly.
 *
 * `unsupported` covers both "this browser has no `read()`" and "the user said
 * no", because the answer to each is the same and it is the one F-M5 names: a
 * file picker, which always works. Distinguishing them would give the user a
 * more accurate sentence and no more choices.
 */
export async function readClipboardImage(): Promise<{ ok: true; blob: Blob } | { ok: false; reason: PasteFailure }> {
  const clip = (navigator as Navigator & { clipboard?: Clipboard }).clipboard
  if (!clip || typeof clip.read !== 'function') return { ok: false, reason: 'unsupported' }
  try {
    for (const item of await clip.read()) {
      const type = item.types.find((t) => IMAGE.test(t))
      if (type) return { ok: true, blob: await item.getType(type) }
    }
    return { ok: false, reason: 'none' }
  } catch {
    return { ok: false, reason: 'unsupported' }
  }
}

/**
 * F-M5's floor: a file picker. It always works, in every browser, with no
 * permission — which is why it is the last rung and not an error message.
 *
 * Resolves null when the dialog is dismissed. `cancel` is listened for as well
 * as `change` because without it the promise never settles and the caller waits
 * forever for a decision the user already made.
 */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

// ─── turning it into pixels ──────────────────────────────────────────────────

/** `createImageBitmap`, falling back to an `<img>` for what it will not take. */
async function drawable(blob: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; free: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      return { img: bitmap, w: bitmap.width, h: bitmap.height, free: () => bitmap.close() }
    } catch {
      // Falls through. Firefox refuses SVG blobs here, and older Safari refuses
      // several things; an <img> takes everything the browser can render.
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = url
    })
    return {
      img,
      w: img.naturalWidth,
      h: img.naturalHeight,
      free: () => URL.revokeObjectURL(url),
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

/**
 * Blob → RGBA, bounded.
 *
 * Smoothing is on only when the cap is actually reducing something, so an image
 * that arrives under 1024 comes through byte-exact and an integer enlargement
 * downstream stays exact. When the cap does bite, smoothing is the right
 * choice: the pure resampler box-averages a reduction anyway (§9.2), so a
 * smooth pre-reduction is the same kind of operation done by the same maths.
 */
export async function decodeImage(blob: Blob): Promise<Decoded | null> {
  let d: Awaited<ReturnType<typeof drawable>>
  try {
    d = await drawable(blob)
  } catch {
    return null
  }

  try {
    if (!d.w || !d.h) return null
    const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(d.w, d.h))
    const w = Math.max(1, Math.round(d.w * scale))
    const h = Math.max(1, Math.round(d.h * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.imageSmoothingEnabled = scale < 1
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(d.img, 0, 0, w, h)

    // A cross-origin image taints the canvas and this throws. It is the one
    // reason a decode fails late rather than early, and "that image could not
    // be read" is the honest thing to say about it.
    const data = ctx.getImageData(0, 0, w, h)
    return { rgba: { w, h, data: data.data }, source: { w: d.w, h: d.h } }
  } catch {
    return null
  } finally {
    d.free()
  }
}

// ─── the two entry points, whole ─────────────────────────────────────────────

/** `⌘V`: read the event, decode it. No permission, no prompt, no fallback needed. */
export async function imageFromPaste(e: ClipboardEvent): Promise<ImageResult> {
  const blob = imageFromPasteEvent(e)
  if (!blob) return { ok: false, reason: 'none' }
  const image = await decodeImage(blob)
  return image ? { ok: true, image } : { ok: false, reason: 'unreadable' }
}

/**
 * The menu item: ask the Clipboard API, and if it will not answer, ask the user
 * for a file instead. §9.5's ladder, in one function.
 *
 * `onFallback` fires immediately before the picker opens, so the caller can say
 * *why* a file dialog just appeared. A picker that arrives unannounced when the
 * user asked for a paste is the browser looking broken; F-M5 is a sentence
 * precisely so it does not have to be.
 *
 * A dismissed file dialog returns `cancelled` and says nothing at all.
 */
export async function imageFromClipboardOrFile(onFallback?: () => void): Promise<ImageResult> {
  const read = await readClipboardImage()
  let blob: Blob
  if (read.ok) {
    blob = read.blob
  } else {
    // The clipboard was readable and simply had no image in it. That is F-M2,
    // and a file picker is not the answer to it — the user asked to paste, not
    // to open.
    if (read.reason === 'none') return { ok: false, reason: 'none' }
    onFallback?.()
    const file = await pickImageFile()
    if (!file) return { ok: false, reason: 'cancelled' }
    blob = file
  }

  const image = await decodeImage(blob)
  return image ? { ok: true, image } : { ok: false, reason: 'unreadable' }
}
