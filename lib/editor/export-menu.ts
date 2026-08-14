/**
 * What the Export popover is, and what it says. See docs/specs/08-exporters.md §10.
 *
 * Same split as `file-menu.ts` and `code-panel.ts`, and for the same reason
 * (HANDOFF §11): `npm test` runs in node, every browser probe needs a dev
 * server, so a decision that lives only inside a `.tsx` has no CI guard.
 * `components/ExportPopover.tsx` is left with markup and the calls that
 * download.
 */

export type ExportFormat = 'png' | 'svg' | 'css' | 'react' | 'json' | 'ascii' | 'gif' | 'spritesheet'

export const EXPORT_FORMATS: readonly { id: ExportFormat; label: string }[] = [
  { id: 'png', label: 'PNG' },
  { id: 'svg', label: 'SVG' },
  { id: 'css', label: 'CSS' },
  { id: 'react', label: 'React' },
  // Grouped with JSON rather than with the pictures above it — both are the
  // document as text, §10's spec correction (§12.2).
  { id: 'json', label: 'JSON' },
  { id: 'ascii', label: 'ASCII' },
  // Phase 5 (§13): only meaningful with more than one frame — gated by
  // `visibleFormats`, never disabled-but-visible (`17-file-menu.md §7`'s own
  // rule: a control that looks live and is not is worse than no control).
  { id: 'gif', label: 'GIF' },
  { id: 'spritesheet', label: 'Sprite sheet' },
]

/** The rows §10's mockup actually shows for a document of this frame count —
 *  GIF and sprite sheet only mean something once there is more than one
 *  frame to animate or tile (§13). */
export function visibleFormats(frameCount: number): readonly { id: ExportFormat; label: string }[] {
  if (frameCount > 1) return EXPORT_FORMATS
  return EXPORT_FORMATS.filter((f) => f.id !== 'gif' && f.id !== 'spritesheet')
}

/** §10's mockup shows four; `PngOptions.scale` allows 16 too, for callers other than this popover. */
export const PNG_SCALES = [1, 2, 4, 8] as const

export const EXPORT_TITLE = 'Export'

// ─── DOM handles ─────────────────────────────────────────────────────────────

export const CODE_EXPORT_DOM_ID = 'code-export'
export const EXPORT_MENU_DOM_ID = 'code-export-menu'
export const exportRowDomId = (id: ExportFormat): string => `export-${id}`
export const exportScaleDomId = (scale: number): string => `export-png-${scale}x`
export const EXPORT_REACT_LANG_DOM_ID = 'export-react-lang'
/** React and CSS both grow an "Animated" toggle once there's more than one
 *  frame — one id per format so the two can be driven independently. */
export const exportAnimatedToggleDomId = (id: 'react' | 'css'): string => `export-${id}-animated`
export const EXPORT_GIF_PROGRESS_DOM_ID = 'export-gif-progress'

export function exportMenuDomHandles(): string[] {
  return [
    CODE_EXPORT_DOM_ID,
    EXPORT_MENU_DOM_ID,
    ...EXPORT_FORMATS.map((f) => exportRowDomId(f.id)),
    ...PNG_SCALES.map(exportScaleDomId),
    EXPORT_REACT_LANG_DOM_ID,
    exportAnimatedToggleDomId('react'),
    exportAnimatedToggleDomId('css'),
    EXPORT_GIF_PROGRESS_DOM_ID,
  ]
}
