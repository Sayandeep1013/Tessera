'use client'

/**
 * The Export popover. See docs/specs/08-exporters.md §10 and §13.
 *
 * One click per row downloads at default options; PNG's scale, React's
 * language and now the Animated toggle (React/CSS, once there is more than
 * one frame) are the controls worth a chevron-free button rather than a
 * second screen (§10: "nothing here is a multi-step wizard"). Failures — the
 * CSS pixel cap, a GIF worker error — stay inline in the popover rather than
 * becoming a toast, per §10's rule; `rowError` is generic across every row
 * that can fail, not CSS-specific, so GIF gets the same treatment for free.
 */

import { useEffect, useRef, useState } from 'react'
import { useDocStore, useEditorStore } from '@/lib/store/editor'
import { exportSvg } from '@/lib/exporters/svg'
import { exportCss } from '@/lib/exporters/css'
import { exportReact } from '@/lib/exporters/react'
import { exportJson } from '@/lib/exporters/json'
import { exportAscii } from '@/lib/exporters/ascii'
import { exportSpriteSheet, exportSpriteSheetAtlas } from '@/lib/exporters/spritesheet'
import { runGifExport } from '@/lib/editor/gif-export'
import type { ExportResult } from '@/lib/exporters/types'
import { saveExport } from '@/lib/editor/save-export'
import {
  EXPORT_GIF_PROGRESS_DOM_ID, EXPORT_MENU_DOM_ID, EXPORT_REACT_LANG_DOM_ID, EXPORT_TITLE,
  PNG_SCALES, exportAnimatedToggleDomId, exportRowDomId, exportScaleDomId, visibleFormats,
  type ExportFormat,
} from '@/lib/editor/export-menu'

export function ExportPopover({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc)
  const frame = useDocStore((s) => s.frame)
  const setNotice = useEditorStore((s) => s.setNotice)
  const [typescript, setTypescript] = useState(true)
  const [animated, setAnimated] = useState({ react: false, css: false })
  const [gifProgress, setGifProgress] = useState<{ done: number; total: number } | null>(null)
  const [rowError, setRowError] = useState<{ id: ExportFormat; message: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const frameCount = doc?.frames.length ?? 1
  const formats = visibleFormats(frameCount)

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

  const run = (result: ExportResult, id: ExportFormat) => {
    setRowError(null)
    const message = saveExport(result)
    if (!result.ok) {
      setRowError({ id, message: message ?? result.error })
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
    void import('@/lib/exporters/png').then((m) => run(m.exportPng(doc, { frame, scale }), 'png'))
  }

  const runSpritesheet = () => {
    if (!doc) return
    // Two files from one click — §13.1: the shared `ExportOk` shape carries
    // exactly one, and a sprite sheet is genuinely two, so the PNG and its
    // atlas fire as two downloads rather than bending the contract for one
    // format.
    run(exportSpriteSheet(doc), 'spritesheet')
    run(exportSpriteSheetAtlas(doc), 'spritesheet')
  }

  const runGif = () => {
    if (!doc || gifProgress) return
    setRowError(null)
    setGifProgress({ done: 0, total: doc.frames.length })
    runGifExport(doc, (done, total) => setGifProgress({ done, total }))
      .then((result) => run(result, 'gif'))
      .catch((e: unknown) => {
        setRowError({ id: 'gif', message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => setGifProgress(null))
  }

  const handlers: Record<ExportFormat, () => void> = {
    png: () => runPng(1),
    svg: () => doc && run(exportSvg(doc, { frame }), 'svg'),
    css: () => doc && run(exportCss(doc, { frame, animated: animated.css }), 'css'),
    react: () => doc && run(exportReact(doc, { frame, typescript, animated: animated.react }), 'react'),
    json: () => doc && run(exportJson(doc), 'json'),
    ascii: () => doc && run(exportAscii(doc, { frame }), 'ascii'),
    gif: runGif,
    spritesheet: runSpritesheet,
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

      {formats.map((f) => {
        const disabled = !doc || (f.id === 'gif' && !!gifProgress)
        return (
        <div key={f.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              id={exportRowDomId(f.id)}
              onClick={handlers[f.id]}
              disabled={disabled}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', height: 32,
                padding: '0 8px', borderRadius: 'var(--r-md)',
                font: 'var(--t-label)', color: !disabled ? 'var(--fg)' : 'var(--disabled)',
                textAlign: 'left',
              }}
            >
              {f.id === 'gif' && gifProgress ? `Encoding… ${gifProgress.done}/${gifProgress.total}` : f.label}
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

            {(f.id === 'react' || f.id === 'css') && frameCount > 1 && (
              <button
                id={exportAnimatedToggleDomId(f.id)}
                onClick={(e) => {
                  e.stopPropagation()
                  setAnimated((a) => ({ ...a, [f.id]: !a[f.id as 'react' | 'css'] }))
                }}
                aria-pressed={animated[f.id as 'react' | 'css']}
                aria-label={animated[f.id as 'react' | 'css'] ? 'Animated — click for one frame' : 'One frame — click to animate'}
                style={{
                  height: 24, padding: '0 8px', borderRadius: 'var(--r-pill)',
                  font: 'var(--t-label-sm)',
                  color: animated[f.id as 'react' | 'css'] ? 'var(--onsolid)' : 'var(--muted)',
                  background: animated[f.id as 'react' | 'css'] ? 'var(--solid)' : 'var(--panel2)',
                }}
              >
                Animated
              </button>
            )}
          </div>

          {f.id === 'gif' && gifProgress && (
            <div
              id={EXPORT_GIF_PROGRESS_DOM_ID}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={gifProgress.total}
              aria-valuenow={gifProgress.done}
              style={{
                margin: '2px 8px 6px', height: 4, borderRadius: 'var(--r-sm)',
                background: 'var(--panel2)', overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(gifProgress.done / gifProgress.total) * 100}%`, height: '100%',
                  background: 'var(--accent)',
                }}
              />
            </div>
          )}

          {rowError?.id === f.id && (
            <p
              role="alert"
              style={{
                margin: '2px 8px 6px', font: 'var(--t-label-sm)', color: 'var(--diff-remove)',
              }}
            >
              {rowError.message}
            </p>
          )}
        </div>
        )
      })}
    </div>
  )
}
