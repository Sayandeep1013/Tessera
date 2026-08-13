/**
 * What the Export popover is, and what it says. See docs/specs/08-exporters.md §10.
 *
 * Same split as `file-menu.ts` and `code-panel.ts`, and for the same reason
 * (HANDOFF §11): `npm test` runs in node, every browser probe needs a dev
 * server, so a decision that lives only inside a `.tsx` has no CI guard.
 * `components/ExportPopover.tsx` is left with markup and the calls that
 * download.
 */

export type ExportFormat = 'png' | 'svg' | 'css' | 'react' | 'json' | 'ascii'

export const EXPORT_FORMATS: readonly { id: ExportFormat; label: string }[] = [
  { id: 'png', label: 'PNG' },
  { id: 'svg', label: 'SVG' },
  { id: 'css', label: 'CSS' },
  { id: 'react', label: 'React' },
  // Grouped with JSON rather than with the pictures above it — both are the
  // document as text, §10's spec correction (§12.2).
  { id: 'json', label: 'JSON' },
  { id: 'ascii', label: 'ASCII' },
]

/** §10's mockup shows four; `PngOptions.scale` allows 16 too, for callers other than this popover. */
export const PNG_SCALES = [1, 2, 4, 8] as const

export const EXPORT_TITLE = 'Export'

// ─── DOM handles ─────────────────────────────────────────────────────────────

export const CODE_EXPORT_DOM_ID = 'code-export'
export const EXPORT_MENU_DOM_ID = 'code-export-menu'
export const exportRowDomId = (id: ExportFormat): string => `export-${id}`
export const exportScaleDomId = (scale: number): string => `export-png-${scale}x`
export const EXPORT_REACT_LANG_DOM_ID = 'export-react-lang'

export function exportMenuDomHandles(): string[] {
  return [
    CODE_EXPORT_DOM_ID,
    EXPORT_MENU_DOM_ID,
    ...EXPORT_FORMATS.map((f) => exportRowDomId(f.id)),
    ...PNG_SCALES.map(exportScaleDomId),
    EXPORT_REACT_LANG_DOM_ID,
  ]
}
