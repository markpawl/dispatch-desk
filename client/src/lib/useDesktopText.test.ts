import { describe, expect, it } from 'vitest'
import { diff } from './useDesktopText'

describe('diff', () => {
  it('finds an insertion in the middle', () => {
    expect(diff('hello world', 'hello brave world')).toEqual({
      start: 6,
      deleteLength: 0,
      insertedText: 'brave ',
    })
  })

  it('finds a deletion', () => {
    expect(diff('hello brave world', 'hello world')).toEqual({
      start: 6,
      deleteLength: 6,
      insertedText: '',
    })
  })

  it('finds an append at the end', () => {
    expect(diff('hello', 'hello!')).toEqual({
      start: 5,
      deleteLength: 0,
      insertedText: '!',
    })
  })

  it('reports no change for identical strings', () => {
    expect(diff('same', 'same')).toEqual({
      start: 4,
      deleteLength: 0,
      insertedText: '',
    })
  })

  it('handles a full replace when nothing is shared', () => {
    expect(diff('abc', 'xyz')).toEqual({
      start: 0,
      deleteLength: 3,
      insertedText: 'xyz',
    })
  })
})
