/**
 * The format tabs, and what the single Export action does. See
 * docs/specs/08-exporters.md §14 and docs/specs/07-code-panel.md §9.11.
 *
 * Same split as `file-menu.ts` and `code-panel.ts`, and for the same reason
 * (HANDOFF §11): `npm test` runs in node, every browser probe needs a dev
 * server, so a decision that lives only inside a `.tsx` has no CI guard.
 * `components/CodePanel.tsx` is left with markup and the calls that download.
 */

export type FormatTabId = 'code' | 'svg' | 'css' | 'react' | 'png' | 'ascii' | 'gif' | 'spritesheet'

export const FORMAT_TABS: readonly { id: FormatTabId; label: string }[] = [
  // The document itself, editable — everything else on this row is a
  // read-only rendering of it. §14.1: JSON was never a different tab, it was
  // this one under another name.
  { id: 'code', label: 'Code' },
  { id: 'svg', label: 'SVG' },
  { id: 'css', label: 'CSS' },
  { id: 'react', label: 'React' },
  { id: 'png', label: 'PNG' },
  { id: 'ascii', label: 'ASCII' },
  // Phase 5 (§13): only meaningful with more than one frame — gated by
  // `visibleTabs`, never disabled-but-visible (`17-file-menu.md §7`'s own
  // rule: a control that looks live and is not is worse than no control).
  { id: 'gif', label: 'GIF' },
  { id: 'spritesheet', label: 'Sprite sheet' },
]

/** The tabs a document of this frame count actually shows — GIF and sprite
 *  sheet only mean something once there is more than one frame (§13). */
export function visibleTabs(frameCount: number): readonly { id: FormatTabId; label: string }[] {
  if (frameCount > 1) return FORMAT_TABS
  return FORMAT_TABS.filter((f) => f.id !== 'gif' && f.id !== 'spritesheet')
}

/**
 * Falls back to `'code'` the instant the active tab stops being reachable.
 *
 * A document can lose its second frame from underneath an open GIF tab —
 * undo, `frame_delete` — and the panel must not go on showing a tab that no
 * longer exists. The same shape `clampLayer`/`clampFrame` already use for the
 * document's own indices (`14-layers.md`, `10-animation.md`), applied to UI
 * state instead.
 */
export function clampTab(tab: FormatTabId, frameCount: number): FormatTabId {
  return visibleTabs(frameCount).some((f) => f.id === tab) ? tab : 'code'
}

/** §10's mockup shows four; `PngOptions.scale` allows 16 too, for callers other than this panel. */
export const PNG_SCALES = [1, 2, 4, 8] as const

// ─── DOM handles ─────────────────────────────────────────────────────────────

export const CODE_EXPORT_DOM_ID = 'code-export'
export const formatTabDomId = (id: FormatTabId): string => `format-tab-${id}`
export const exportScaleDomId = (scale: number): string => `export-png-${scale}x`
export const EXPORT_REACT_LANG_DOM_ID = 'export-react-lang'
/** React and CSS both grow an "Animated" toggle once there's more than one
 *  frame — one id per format so the two can be driven independently. */
export const exportAnimatedToggleDomId = (id: 'react' | 'css'): string => `export-${id}-animated`
export const EXPORT_GIF_PROGRESS_DOM_ID = 'export-gif-progress'

export function formatTabDomHandles(): string[] {
  return [
    CODE_EXPORT_DOM_ID,
    ...FORMAT_TABS.map((f) => formatTabDomId(f.id)),
    ...PNG_SCALES.map(exportScaleDomId),
    EXPORT_REACT_LANG_DOM_ID,
    exportAnimatedToggleDomId('react'),
    exportAnimatedToggleDomId('css'),
    EXPORT_GIF_PROGRESS_DOM_ID,
  ]
}
