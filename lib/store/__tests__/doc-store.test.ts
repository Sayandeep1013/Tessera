/**
 * The document store's active-layer invariant. See docs/specs/14-layers.md §8.7.
 *
 * The point of keeping `layer` beside `frame` in this store is that ONE clamp in
 * commit() covers every path that can invalidate it. These tests exercise those
 * paths rather than the clamp function, which has its own tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDoc } from '../../artwork-core/create'
import type { EditorCommand } from '../../artwork-core/commands'
import type { Doc } from '../../artwork-core/schema'

// IndexedDB does not exist in the node environment and autosave fires on a
// timer, so the real module would throw somewhere nothing is looking.
vi.mock('../../persist/idb', () => ({ saveDraft: vi.fn(async () => {}) }))

const { useDocStore } = await import('../editor')

function threeLayers(): Doc {
  const doc = createDoc({ id: 'three', w: 2, h: 2, now: '2026-08-11T00:00:00.000Z' })
  doc.frames[0]!.layers.push({ n: 'over', px: new Uint8Array(4) })
  doc.frames[0]!.layers.push({ n: 'top', px: new Uint8Array(4) })
  return doc
}

const del = (at: number, doc: Doc): EditorCommand => ({
  type: 'layer_delete',
  label: 'Delete layer',
  frame: 0,
  at,
  layer: { ...doc.frames[0]!.layers[at]!, px: new Uint8Array(doc.frames[0]!.layers[at]!.px) },
})

beforeEach(() => {
  useDocStore.setState({ doc: null, frame: 0, layer: 0, past: [], future: [], agentDepth: 0 })
})

describe('setDoc', () => {
  it('resets the active layer — another document\'s indices mean nothing', () => {
    useDocStore.getState().setDoc(threeLayers())
    useDocStore.getState().setLayer(2)
    expect(useDocStore.getState().layer).toBe(2)

    useDocStore.getState().setDoc(createDoc({ id: 'fresh', w: 2, h: 2 }))
    expect(useDocStore.getState().layer).toBe(0)
  })
})

describe('setLayer', () => {
  it('clamps rather than rejecting — nothing is lost by correcting it', () => {
    useDocStore.getState().setDoc(threeLayers())
    useDocStore.getState().setLayer(99)
    expect(useDocStore.getState().layer).toBe(2)
    useDocStore.getState().setLayer(-4)
    expect(useDocStore.getState().layer).toBe(0)
  })
})

describe('commit clamps the active layer', () => {
  it('deleting the active top layer moves the selection into range', () => {
    const s = useDocStore.getState()
    s.setDoc(threeLayers())
    s.setLayer(2)
    useDocStore.getState().commit(del(2, useDocStore.getState().doc!))

    expect(useDocStore.getState().doc!.frames[0]!.layers).toHaveLength(2)
    expect(useDocStore.getState().layer).toBe(1)
  })

  it('undo of that delete leaves the selection in range', () => {
    const s = useDocStore.getState()
    s.setDoc(threeLayers())
    s.setLayer(2)
    useDocStore.getState().commit(del(2, useDocStore.getState().doc!))
    useDocStore.getState().undo()

    expect(useDocStore.getState().doc!.frames[0]!.layers).toHaveLength(3)
    expect(useDocStore.getState().layer).toBeLessThan(3)
  })

  it('redo also clamps', () => {
    const s = useDocStore.getState()
    s.setDoc(threeLayers())
    s.setLayer(2)
    useDocStore.getState().commit(del(2, useDocStore.getState().doc!))
    useDocStore.getState().undo()
    useDocStore.getState().setLayer(2)
    useDocStore.getState().redo()

    expect(useDocStore.getState().layer).toBe(1)
  })

  it('clamps on the agent-session path too, where nothing is pushed to history', () => {
    const s = useDocStore.getState()
    s.setDoc(threeLayers())
    s.setLayer(2)
    useDocStore.getState().beginAgentSession()
    useDocStore.getState().commit(del(2, useDocStore.getState().doc!))

    expect(useDocStore.getState().past).toHaveLength(0)
    expect(useDocStore.getState().layer).toBe(1)
    useDocStore.getState().endAgentSession()
  })

  it('a replace_doc that shrinks the stack still clamps', () => {
    const s = useDocStore.getState()
    s.setDoc(threeLayers())
    s.setLayer(2)
    const before = useDocStore.getState().doc!
    useDocStore.getState().commit({
      type: 'replace_doc',
      label: 'AI: start over',
      before,
      after: createDoc({ id: 'three', w: 2, h: 2 }),
    })
    expect(useDocStore.getState().layer).toBe(0)
  })
})

/** 10-animation.md §0.1 — the frame index gets the same one-clamp treatment
 *  layer already had, plus the "active layer follows the new frame" rule. */
function threeFrames(): Doc {
  const doc = createDoc({ id: 'frames', w: 2, h: 2, now: '2026-08-11T00:00:00.000Z' })
  doc.frames[0]!.layers.push({ n: 'over', px: new Uint8Array(4) })
  doc.frames.push({ ms: 100, layers: [{ n: 'a', px: new Uint8Array(4) }] })
  doc.frames.push({ ms: 100, layers: [{ n: 'a', px: new Uint8Array(4) }] })
  return doc
}

const delFrame = (at: number, doc: Doc): EditorCommand => ({
  type: 'frame_delete',
  label: 'Delete frame',
  at,
  frame: doc.frames[at]!,
})

describe('setDoc resets the active frame', () => {
  it("another document's frame index means nothing", () => {
    useDocStore.getState().setDoc(threeFrames())
    useDocStore.getState().setFrame(2)
    expect(useDocStore.getState().frame).toBe(2)

    useDocStore.getState().setDoc(createDoc({ id: 'fresh', w: 2, h: 2 }))
    expect(useDocStore.getState().frame).toBe(0)
  })
})

describe('setFrame', () => {
  it('clamps rather than rejecting', () => {
    useDocStore.getState().setDoc(threeFrames())
    useDocStore.getState().setFrame(99)
    expect(useDocStore.getState().frame).toBe(2)
    useDocStore.getState().setFrame(-4)
    expect(useDocStore.getState().frame).toBe(0)
  })

  it('keeps the active layer index when it still exists in the new frame', () => {
    useDocStore.getState().setDoc(threeFrames()) // frame 0 has 2 layers, frames 1-2 have 1
    useDocStore.getState().setLayer(1)
    useDocStore.getState().setFrame(0)
    expect(useDocStore.getState().layer).toBe(1)
  })

  it('clamps the active layer to the new frame\'s last one when it does not', () => {
    useDocStore.getState().setDoc(threeFrames())
    useDocStore.getState().setLayer(1) // valid on frame 0 (2 layers)
    useDocStore.getState().setFrame(1) // frame 1 has only 1 layer
    expect(useDocStore.getState().layer).toBe(0)
  })
})

describe('commit clamps the active frame', () => {
  it('deleting the active last frame moves the selection into range', () => {
    useDocStore.getState().setDoc(threeFrames())
    useDocStore.getState().setFrame(2)
    useDocStore.getState().commit(delFrame(2, useDocStore.getState().doc!))

    expect(useDocStore.getState().doc!.frames).toHaveLength(2)
    expect(useDocStore.getState().frame).toBe(1)
  })

  it('undo of that delete leaves the selection in range', () => {
    useDocStore.getState().setDoc(threeFrames())
    useDocStore.getState().setFrame(2)
    useDocStore.getState().commit(delFrame(2, useDocStore.getState().doc!))
    useDocStore.getState().undo()

    expect(useDocStore.getState().doc!.frames).toHaveLength(3)
    expect(useDocStore.getState().frame).toBeLessThan(3)
  })

  it('redo also clamps', () => {
    useDocStore.getState().setDoc(threeFrames())
    useDocStore.getState().setFrame(2)
    useDocStore.getState().commit(delFrame(2, useDocStore.getState().doc!))
    useDocStore.getState().undo()
    useDocStore.getState().setFrame(2)
    useDocStore.getState().redo()

    expect(useDocStore.getState().frame).toBe(1)
  })
})

describe('paint commands still record their own layer', () => {
  it('undo writes back to the recorded layer, not the active one', () => {
    const s = useDocStore.getState()
    s.setDoc(threeLayers())
    useDocStore.getState().commit({
      type: 'paint', label: 'Brush', frame: 0, layer: 1, cells: [[0, 0, 0, 1]],
    })
    expect(useDocStore.getState().doc!.frames[0]!.layers[1]!.px[0]).toBe(1)

    // Move the selection somewhere else before undoing — the command must not care.
    useDocStore.getState().setLayer(2)
    useDocStore.getState().undo()

    const layers = useDocStore.getState().doc!.frames[0]!.layers
    expect(Array.from(layers[1]!.px)).toEqual([0, 0, 0, 0])
    expect(Array.from(layers[2]!.px)).toEqual([0, 0, 0, 0])
  })
})

/**
 * Coalescing — spec 07 §5 and §9.4.
 *
 * The code panel debounces at 300ms, so a paragraph of typing is several
 * commits. Without this each one is an undo step and getting back to before you
 * started is a dozen presses.
 */
describe('commit(cmd, coalesce)', () => {
  const named = (name: string, base: Doc): EditorCommand => ({
    type: 'replace_doc',
    label: 'Edit code',
    before: base,
    after: { ...base, name },
  })

  it('pushes a step when it is not asked to coalesce', () => {
    const start = createDoc({ id: 'a', w: 2, h: 2 })
    useDocStore.getState().setDoc(start)
    useDocStore.getState().commit(named('one', start))
    useDocStore.getState().commit(named('two', useDocStore.getState().doc!))
    expect(useDocStore.getState().past).toHaveLength(2)
  })

  it('replaces the top step when it is', () => {
    const start = createDoc({ id: 'a', w: 2, h: 2 })
    useDocStore.getState().setDoc(start)
    useDocStore.getState().commit(named('one', start))
    useDocStore.getState().commit(named('two', useDocStore.getState().doc!), true)
    expect(useDocStore.getState().past).toHaveLength(1)
    expect(useDocStore.getState().doc!.name).toBe('two')
  })

  /**
   * The half that is easy to get wrong: keeping the NEW command's `before`
   * would undo to the previous keystroke, which is a coalesce that saves
   * nothing. Ten edits must undo to where the typing started.
   */
  it('keeps the original before, so one undo goes back to the start of the burst', () => {
    const start = createDoc({ id: 'a', w: 2, h: 2, name: 'original' })
    useDocStore.getState().setDoc(start)
    for (const n of ['one', 'two', 'three', 'four']) {
      useDocStore.getState().commit(named(n, useDocStore.getState().doc!), n !== 'one')
    }
    expect(useDocStore.getState().doc!.name).toBe('four')
    expect(useDocStore.getState().past).toHaveLength(1)

    useDocStore.getState().undo()
    expect(useDocStore.getState().doc!.name).toBe('original')
  })

  it('redoes to the end of the burst, not into the middle of it', () => {
    const start = createDoc({ id: 'a', w: 2, h: 2, name: 'original' })
    useDocStore.getState().setDoc(start)
    useDocStore.getState().commit(named('one', start))
    useDocStore.getState().commit(named('two', useDocStore.getState().doc!), true)
    useDocStore.getState().undo()
    useDocStore.getState().redo()
    expect(useDocStore.getState().doc!.name).toBe('two')
  })

  /** It must not swallow a brush stroke that happens to be on top. */
  it('refuses to merge into a command that is not its own', () => {
    const start = createDoc({ id: 'a', w: 2, h: 2 })
    useDocStore.getState().setDoc(start)
    useDocStore.getState().commit({
      type: 'paint', label: 'Brush', frame: 0, layer: 0, cells: [[0, 0, 0, 1]],
    })
    useDocStore.getState().commit(named('one', useDocStore.getState().doc!), true)
    expect(useDocStore.getState().past).toHaveLength(2)

    // …and the stroke is still there to undo separately.
    useDocStore.getState().undo()
    useDocStore.getState().undo()
    expect(useDocStore.getState().doc!.frames[0]!.layers[0]!.px[0]).toBe(0)
  })

  it('refuses to merge across labels, so two features cannot collide', () => {
    const start = createDoc({ id: 'a', w: 2, h: 2 })
    useDocStore.getState().setDoc(start)
    useDocStore.getState().commit({ ...named('one', start), label: 'Something else' })
    useDocStore.getState().commit(named('two', useDocStore.getState().doc!), true)
    expect(useDocStore.getState().past).toHaveLength(2)
  })

  it('starts a step when there is nothing on the stack to merge into', () => {
    const start = createDoc({ id: 'a', w: 2, h: 2 })
    useDocStore.getState().setDoc(start)
    useDocStore.getState().commit(named('one', start), true)
    expect(useDocStore.getState().past).toHaveLength(1)
  })
})
