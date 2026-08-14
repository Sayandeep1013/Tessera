'use client'

/**
 * What every tab but Code shows. See docs/specs/08-exporters.md §14.4.
 *
 * Text formats (SVG/CSS/React/ASCII) are cheap, synchronous and pure — called
 * directly on render, memoised by the caller. PNG/GIF/sprite sheet need
 * `pngjs`, which stays out of the initial bundle (`08 §12.4`/`§13.3`) behind a
 * plain `import()` fired the moment their tab is actually shown, never at
 * module scope — the same discipline, just triggered by a tab click instead
 * of an Export click.
 */

import { useEffect, useRef, useState } from 'react'
import type { ExportResult } from '@/lib/exporters/types'

const TEXT_STYLE: React.CSSProperties = {
  margin: 0,
  padding: 12,
  font: 'var(--t-mono-sm)',
  color: 'var(--fg)',
  whiteSpace: 'pre',
  overflow: 'auto',
  height: '100%',
}

/** SVG/CSS/React/ASCII — a plain read-only rendering of the generated text.
 *  No line-number gutter and no palette-swatch colouring: `07 §9.8`'s
 *  colouring is aimed at the document's own bytes specifically and does not
 *  generalise to five different output grammars (`08 §14.4`). */
export function TextPreview({ result }: { result: ExportResult }) {
  if (!result.ok) {
    return <PreviewMessage kind="error" message={result.error} />
  }
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {result.value.warning && (
        <div
          role="alert"
          style={{
            padding: '6px 12px', font: 'var(--t-label-sm)', color: 'var(--diff-remove)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          {result.value.warning}
        </div>
      )}
      <pre style={TEXT_STYLE}>{String(result.value.data)}</pre>
    </div>
  )
}

/**
 * PNG, GIF and sprite sheet — a real `<img>` built from the same bytes the
 * download uses, not a second rendering path.
 *
 * `load` is re-run whenever `deps` changes; a stale response arriving after a
 * newer request started is dropped by the `current` guard, the same shape a
 * debounced fetch would use.
 */
export function ImagePreview({
  load, deps, caption,
}: {
  load: () => Promise<ExportResult>
  deps: readonly unknown[]
  caption?: string
}) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ok'; url: string } | { status: 'error'; message: string }>({ status: 'loading' })
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    void load().then((result) => {
      if (!current) return
      if (!result.ok) {
        setState({ status: 'error', message: result.error })
        return
      }
      const blob = new Blob([result.value.data as BlobPart], { type: result.value.mime })
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setState({ status: 'ok', url })
    })
    return () => {
      current = false
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  if (state.status === 'loading') return <PreviewMessage kind="muted" message="Rendering preview…" />
  if (state.status === 'error') return <PreviewMessage kind="error" message={state.message} />

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: 16,
    }}
    >
      <img
        src={state.url}
        alt=""
        style={{
          maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto',
          imageRendering: 'pixelated',
          background: 'var(--art-bg)', boxShadow: 'var(--shadow-lg)',
        }}
      />
      {caption && (
        <span style={{ font: 'var(--t-label-sm)', color: 'var(--muted)' }}>{caption}</span>
      )}
    </div>
  )
}

function PreviewMessage({ kind, message }: { kind: 'error' | 'muted'; message: string }) {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 16 }}>
      <p
        role={kind === 'error' ? 'alert' : undefined}
        style={{
          margin: 0, textAlign: 'center', font: 'var(--t-label)',
          color: kind === 'error' ? 'var(--diff-remove)' : 'var(--muted)',
        }}
      >
        {message}
      </p>
    </div>
  )
}
