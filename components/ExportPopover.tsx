'use client'

/**
 * The Export popover. See docs/specs/08-exporters.md §10.
 *
 * One click per row downloads at default options; PNG's scale and React's
 * language are the two options worth a control rather than a chevron and a
 * second screen (§10: "nothing here is a multi-step wizard"). The CSS pixel
 * cap is the one failure this file can produce, and it stays inline in the
 * popover rather than becoming a toast, per §10's rule.
 */

import { useEffect, useRef, useState } from 'react'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { exportSvg } from '@/lib/exporters/svg'
import { exportCss } from '@/lib/exporters/css'
import { exportReact } from '@/lib/exporters/react'
import { exportJson } from '@/lib/exporters/json'
import { exportAscii } from '@/lib/exporters/ascii'
import type { ExportResult } from '@/lib/exporters/types'
import { saveExport } from '@/lib/editor/save-export'
import {
  EXPORT_FORMATS, EXPORT_MENU_DOM_ID, EXPORT_REACT_LANG_DOM_ID, EXPORT_TITLE,
  PNG_SCALES, exportRowDomId, exportScaleDomId, type ExportFormat,
} from '@/lib/editor/export-menu'

export function ExportPopover({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc)
  const frame = useDocStore((s) => s.frame)
  const setNotice = useEditorStore((s) => s.setNotice)
  const [typescript, setTypescript] = useState(true)
  const [cssError, setCssError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // mousedown, not click — HANDOFF §5: the click that opened this popover is
  // still propagating when the effect registers.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const run = (result: ExportResult) => {
    setCssError(null)
    const message = saveExport(result)
    if (!result.ok) {
      setCssError(message)
      return
    }
    if (message) setNotice(message)
  }

  /**
   * Loaded only on the click that needs it. `exportPng` pulls in `pngjs`
   * (docs/specs/08-exporters.md §12.4) — big enough that every other row in
   * this popover would otherwise pay to have it sit in the same chunk. A
   * plain `import()` at the point of use, not `next/dynamic` on the whole
   * popover: on this app's single static route, a `next/dynamic`-wrapped
   * component was still reachable from the page's initial script graph and
   * downloaded up front regardless — measured in the production build, not
   * assumed.
   */
  const runPng = (scale: 1 | 2 | 4 | 8) => {
    if (!doc) return
    void import('@/lib/exporters/png').then((m) => run(m.exportPng(doc, { frame, scale })))
  }

  const handlers: Record<ExportFormat, () => void> = {
    png: () => runPng(1),
    svg: () => doc && run(exportSvg(doc, { frame })),
    css: () => doc && run(exportCss(doc, { frame })),
    react: () => doc && run(exportReact(doc, { frame, typescript })),
    json: () => doc && run(exportJson(doc)),
    ascii: () => doc && run(exportAscii(doc, { frame })),
  }

  return (
    <div
      ref={ref}
      id={EXPORT_MENU_DOM_ID}
      role="dialog"
      aria-label={EXPORT_TITLE}
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60,
        width: 260, padding: 8, display: 'grid', gap: 2,
        background: 'var(--panel)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div style={{ padding: '4px 6px 8px', font: 'var(--t-label-sm)', color: 'var(--muted)' }}>
        {EXPORT_TITLE.toUpperCase()}
      </div>

      {EXPORT_FORMATS.map((f) => (
        <div key={f.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              id={exportRowDomId(f.id)}
              onClick={handlers[f.id]}
              disabled={!doc}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', height: 32,
                padding: '0 8px', borderRadius: 'var(--r-md)',
                font: 'var(--t-label)', color: doc ? 'var(--fg)' : 'var(--disabled)',
                textAlign: 'left',
              }}
            >
              {f.label}
            </button>

            {f.id === 'png' && (
              <div style={{ display: 'flex', gap: 2 }}>
                {PNG_SCALES.map((scale) => (
                  <button
                    key={scale}
                    id={exportScaleDomId(scale)}
                    onClick={() => runPng(scale)}
                    disabled={!doc}
                    style={{
                      height: 24, minWidth: 24, padding: '0 4px', borderRadius: 'var(--r-sm)',
                      font: 'var(--t-label-sm)', color: 'var(--muted)',
                      background: 'var(--panel2)',
                    }}
                  >
                    {scale}×
                  </button>
                ))}
              </div>
            )}

            {f.id === 'react' && (
              <button
                id={EXPORT_REACT_LANG_DOM_ID}
                onClick={(e) => {
                  e.stopPropagation()
                  setTypescript((v) => !v)
                }}
                aria-label={typescript ? 'TypeScript — click for JavaScript' : 'JavaScript — click for TypeScript'}
                style={{
                  height: 24, padding: '0 8px', borderRadius: 'var(--r-pill)',
                  font: 'var(--t-label-sm)', color: 'var(--muted)', background: 'var(--panel2)',
                }}
              >
                {typescript ? 'TS' : 'JS'}
              </button>
            )}
          </div>

          {f.id === 'css' && cssError && (
            <p
              role="alert"
              style={{
                margin: '2px 8px 6px', font: 'var(--t-label-sm)', color: 'var(--diff-remove)',
              }}
            >
              {cssError}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
