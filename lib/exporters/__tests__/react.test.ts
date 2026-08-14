import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { exportReact, sanitizeComponentName } from '../react'
import { horizontalRuns, flattenFrame } from '../geometry'
import { loadStarter, loadLogo } from '../../artwork-core/create'
import { docFrom } from './helpers'
import type { Doc } from '../../artwork-core/schema'

function threeFrameDoc(): Doc {
  const base = docFrom(['1'], ['transparent', '#ff0000'])
  return {
    ...base,
    palette: [{ c: 'transparent' }, { c: '#ff0000' }, { c: '#00ff00' }],
    frames: [
      { ms: 100, layers: [{ n: 'L0', px: new Uint8Array([1]) }] },
      { ms: 100, layers: [{ n: 'L0', px: new Uint8Array([2]) }] },
      { ms: 100, layers: [{ n: 'L0', px: new Uint8Array([1]) }] },
    ],
  }
}

function transpiles(source: string, jsx = true): boolean {
  const result = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      jsx: jsx ? ts.JsxEmit.React : ts.JsxEmit.None,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  })
  return (result.diagnostics ?? []).length === 0
}

describe('sanitizeComponentName', () => {
  it('PascalCases a hostile "1 bad-name"', () => {
    const name = sanitizeComponentName('1 bad-name')
    expect(name).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/)
  })

  it('falls back to PixelArt for an empty name', () => {
    expect(sanitizeComponentName('')).toBe('PixelArt')
    expect(sanitizeComponentName(undefined)).toBe('PixelArt')
  })

  it('"class" becomes a valid, non-reserved identifier', () => {
    const name = sanitizeComponentName('class')
    expect(name).toBe('Class')
    expect(name).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/)
  })

  it('a name that is already clean is left alone', () => {
    expect(sanitizeComponentName('Knight')).toBe('Knight')
  })
})

describe('exportReact', () => {
  it('output is valid TypeScript (.tsx)', () => {
    const r = exportReact(loadStarter('face'))
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename.endsWith('.tsx')).toBe(true)
    expect(transpiles(r.value.data as string)).toBe(true)
  })

  it('typescript:false drops the type annotation and emits .jsx', () => {
    const r = exportReact(loadStarter('face'), { typescript: false })
    if (!r.ok) throw new Error(r.error)
    expect(r.value.filename.endsWith('.jsx')).toBe(true)
    expect(r.value.data).not.toContain(': { size?: number }')
    expect(transpiles(r.value.data as string)).toBe(true)
  })

  it('one <rect> per horizontal run, same geometry as the SVG exporter reuses', () => {
    const doc = loadStarter('bird')
    const r = exportReact(doc)
    if (!r.ok) throw new Error(r.error)
    const rectCount = [...(r.value.data as string).matchAll(/<rect /g)].length
    expect(rectCount).toBe(horizontalRuns(flattenFrame(doc, 0), doc.w, doc.h).length)
  })

  it('componentName sanitisation reaches the output', () => {
    const r = exportReact(loadStarter('face'), { componentName: '' })
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toContain('export function PixelArt(')
  })

  it('an all-transparent document exports a component with no rects', () => {
    const doc = loadStarter('face')
    doc.frames[0]!.layers[0]!.px.fill(0)
    const r = exportReact(doc)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).not.toContain('<rect')
    expect(transpiles(r.value.data as string)).toBe(true)
  })

  it('rejects a frame that does not exist', () => {
    expect(exportReact(loadStarter('face'), { frame: 9 }).ok).toBe(false)
  })

  it('golden: face (tsx), bird (jsx), logo (tsx)', () => {
    const face = exportReact(loadStarter('face'))
    const bird = exportReact(loadStarter('bird'), { typescript: false })
    const logo = exportReact(loadLogo(), { componentName: 'Logo' })
    if (!face.ok || !bird.ok || !logo.ok) throw new Error('export failed')
    expect(face.value.data).toMatchSnapshot()
    expect(bird.value.data).toMatchSnapshot()
    expect(logo.value.data).toMatchSnapshot()
  })
})

describe('exportReact animated', () => {
  it('emits one <g> per frame and one @keyframes rule per <g>', () => {
    const r = exportReact(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    const src = r.value.data as string
    expect([...src.matchAll(/<g style=/g)]).toHaveLength(3)
    expect([...src.matchAll(/@keyframes PixelArt-f\d/g)]).toHaveLength(3)
  })

  it('is still valid TypeScript', () => {
    const r = exportReact(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    expect(transpiles(r.value.data as string)).toBe(true)
  })

  it('the animation duration is the sum of every frame\'s ms', () => {
    const r = exportReact(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toContain('300ms linear infinite')
  })

  it('ignores `frame` — the whole document animates', () => {
    const r = exportReact(threeFrameDoc(), { animated: true, frame: 1 })
    if (!r.ok) throw new Error(r.error)
    expect([...(r.value.data as string).matchAll(/<g style=/g)]).toHaveLength(3)
  })

  it('every frame\'s keyframes hold visible across its own share and hidden elsewhere', () => {
    const r = exportReact(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    const src = r.value.data as string
    // The middle frame (index 1) owns [33.33%, 66.67%) — it should be hidden
    // at both 0% and 100%, and visible somewhere strictly inside its window.
    const f1 = src.split('\n').find((l) => l.includes('@keyframes PixelArt-f1')) ?? ''
    expect(f1).toContain('0% { visibility: hidden; }')
    expect(f1).toContain('100% { visibility: hidden; }')
    expect(f1).toMatch(/33\.3\d+% \{ visibility: visible; \}/)
  })

  it('golden: an animated three-frame export', () => {
    const r = exportReact(threeFrameDoc(), { animated: true })
    if (!r.ok) throw new Error(r.error)
    expect(r.value.data).toMatchSnapshot()
  })

  it('rejects a document with no frames', () => {
    const doc = { ...threeFrameDoc(), frames: [] }
    expect(exportReact(doc, { animated: true }).ok).toBe(false)
  })
})
