import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendSelectionToDestination } from './sendToDestination'

// Real (uncollaborated) Tiptap editors, destroyed after each test -- an
// undestroyed one leaves a DOMObserver timer running that fires after
// jsdom's torn down, an unhandled error that (harmlessly) pollutes later
// test output.
let editors: Editor[] = []
function makeEditor(content: string) {
  const editor = new Editor({ extensions: [StarterKit], content })
  editor.commands.selectAll()
  editors.push(editor)
  return editor
}

describe('sendSelectionToDestination', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const editor of editors) editor.destroy()
    editors = []
  })

  it('returns an error without touching the network when the selection is empty', async () => {
    const editor = makeEditor('<p></p>')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await sendSelectionToDestination(editor, 'dest-1')

    expect(result).toEqual({ ok: false, error: 'Select text first' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts the selection, deletes it, and reports ok on success', async () => {
    const editor = makeEditor('<p>hello world</p>')
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>
        expect(body).toMatchObject({ text: 'hello world', destinationId: 'dest-1' })
        expect(body.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(body.localTime).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }),
    )

    const result = await sendSelectionToDestination(editor, 'dest-1')

    expect(result).toEqual({ ok: true })
    expect(editor.getText()).toBe('')
  })

  it('reports the server error and leaves the selection alone on failure', async () => {
    const editor = makeEditor('<p>hello world</p>')
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Send failed' }) }),
      ),
    )

    const result = await sendSelectionToDestination(editor, 'dest-1')

    expect(result).toEqual({ ok: false, error: 'Send failed' })
    expect(editor.getText()).toBe('hello world')
  })

  it('falls back to a generic error when fetch itself rejects', async () => {
    const editor = makeEditor('<p>hello world</p>')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    )

    const result = await sendSelectionToDestination(editor, 'dest-1')

    expect(result).toEqual({ ok: false, error: 'Send failed' })
  })
})
