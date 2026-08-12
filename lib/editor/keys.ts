/**
 * The one rule about when a keystroke belongs to the editor.
 *
 * Spec 17 §3: `⌘N`, `⌘O`, `⌘S` and `⌘V` are all the browser's own, so taking
 * them requires `preventDefault` — and doing that unconditionally would steal
 * them inside a text field. The header carries a filename input; stealing `⌘V`
 * there would be its own bug.
 *
 * Extracted from `app/page.tsx` in B2, where it had lived as a local closure.
 * The File menu's shortcuts are handled in `Chrome.tsx`, because that is where
 * the menu's own state lives — and §3 says to reuse this line rather than write
 * a second one, so it is a module now instead of being copied.
 */

/** True when the event's target is somewhere the user is typing. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  )
}

/** Ctrl on Windows and Linux, Cmd on a Mac. */
export const isMod = (e: KeyboardEvent): boolean => e.ctrlKey || e.metaKey
