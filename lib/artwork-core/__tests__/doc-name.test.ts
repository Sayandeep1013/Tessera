import { describe, expect, it } from 'vitest'
import { UNTITLED, cleanDocName, copyName, renameCommand } from '../doc-name'
import { applyCommand, invertCommand } from '../commands'
import { createDoc } from '../create'
import { parseDoc, serializeDoc } from '../codec'
import { MAX_NAME } from '../schema'

const docNamed = (name: string) => createDoc({ id: 'a', w: 4, h: 4, name })

describe('cleanDocName', () => {
  it('trims', () => {
    expect(cleanDocName('  gull  ')).toBe('gull')
  })

  it('collapses whitespace, so a name cannot contain a newline', () => {
    expect(cleanDocName('sea\n\ngull')).toBe('sea gull')
    expect(cleanDocName('sea   gull')).toBe('sea gull')
  })

  /**
   * Empty stays empty. `untitled` is a placeholder the header draws, not a
   * value — substituting it here would write the placeholder into the document
   * and every unnamed drawing would become genuinely called "untitled".
   */
  it('leaves an empty name empty', () => {
    expect(cleanDocName('')).toBe('')
    expect(cleanDocName('   ')).toBe('')
  })

  it('cuts to the schema length, so the next load still parses', () => {
    expect(cleanDocName('x'.repeat(MAX_NAME + 50))).toHaveLength(MAX_NAME)
  })
})

describe('renameCommand', () => {
  it('is null when the name has not changed', () => {
    // The common case: the field commits on blur, and clicking away from a
    // field you did not touch must not consume an undo step.
    expect(renameCommand(docNamed('gull'), 'gull')).toBeNull()
  })

  it('is null when only whitespace differs', () => {
    expect(renameCommand(docNamed('gull'), '  gull ')).toBeNull()
  })

  it('renames', () => {
    const doc = docNamed('gull')
    const cmd = renameCommand(doc, 'tern')!
    expect(applyCommand(doc, cmd).name).toBe('tern')
  })

  it('can clear a name', () => {
    const doc = docNamed('gull')
    const cmd = renameCommand(doc, '')!
    expect(cmd).not.toBeNull()
    expect(applyCommand(doc, cmd).name).toBe('')
  })

  it('undo puts the old name back', () => {
    const doc = docNamed('gull')
    const cmd = renameCommand(doc, 'tern')!
    const back = applyCommand(applyCommand(doc, cmd), invertCommand(cmd))
    expect(back.name).toBe('gull')
  })

  it('changes nothing but the name', () => {
    const doc = docNamed('gull')
    doc.frames[0]!.layers[0]!.px[3] = 2
    const after = applyCommand(doc, renameCommand(doc, 'tern')!)
    expect([after.w, after.h, after.id]).toEqual([doc.w, doc.h, doc.id])
    expect(Array.from(after.frames[0]!.layers[0]!.px))
      .toEqual(Array.from(doc.frames[0]!.layers[0]!.px))
  })

  it('does not mutate the document it was given', () => {
    const doc = docNamed('gull')
    applyCommand(doc, renameCommand(doc, 'tern')!)
    expect(doc.name).toBe('gull')
  })

  it('produces a document that still parses, even from an over-long name', () => {
    const doc = docNamed('gull')
    const after = applyCommand(doc, renameCommand(doc, 'y'.repeat(MAX_NAME + 20))!)
    expect(parseDoc(serializeDoc(after)).ok).toBe(true)
  })

  it('labels itself with the name it produces, and says untitled for a cleared one', () => {
    expect(renameCommand(docNamed('gull'), 'tern')!.label).toContain('tern')
    expect(renameCommand(docNamed('gull'), '')!.label).toContain(UNTITLED)
  })
})

describe('copyName still behaves after moving here', () => {
  it('appends and then counts', () => {
    expect(copyName('face')).toBe('face copy')
    expect(copyName('face copy')).toBe('face copy 2')
  })

  it('names an unnamed document', () => {
    expect(copyName('')).toBe(`${UNTITLED} copy`)
  })
})
