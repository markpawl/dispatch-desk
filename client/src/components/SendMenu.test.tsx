import type { Editor } from '@tiptap/react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SendMenu } from './SendMenu'

// SendMenu doesn't render the editable content itself (App.tsx does, via
// EditorContent) so there's no visible textbox to type/select through --
// this harness exposes the real editor instance so tests can drive its
// content/selection directly instead. A real Tiptap editor (not a hand-
// rolled fake) so `useEditorState`'s selection selector behaves exactly as
// it does in the app; no Yjs/Collaboration needed since SendMenu never
// touches that part of the editor.
let capturedEditor: Editor | null = null
function Harness() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>hello world</p>',
    onCreate: ({ editor }) => {
      capturedEditor = editor
    },
  })
  return <SendMenu editor={editor} />
}

function selectAll() {
  act(() => {
    capturedEditor?.commands.selectAll()
  })
}

describe('SendMenu', () => {
  beforeEach(() => {
    capturedEditor = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('disables the Send button until text is selected', async () => {
    render(<Harness />)
    const button = await screen.findByRole('button', { name: 'Send' })
    expect(button).toBeDisabled()

    selectAll()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('shows a Connect Google prompt when not connected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/google/status') {
          return Promise.resolve({ json: () => Promise.resolve({ connected: false }) })
        }
        return Promise.resolve({ json: () => Promise.resolve({ destinations: [] }) })
      }),
    )
    render(<Harness />)
    const button = await screen.findByRole('button', { name: 'Send' })
    selectAll()
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)

    const link = await screen.findByRole('link', { name: 'Connect Google to send' })
    expect(link).toHaveAttribute('href', '/auth/google')
  })

  it('lists saved destinations and sends + deletes the selection on click', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/google/status') {
          return Promise.resolve({ json: () => Promise.resolve({ connected: true }) })
        }
        if (url === '/api/destinations') {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                destinations: [
                  { id: 'dest-1', type: 'google-doc', docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' },
                ],
              }),
          })
        }
        if (url === '/api/send') {
          const body = JSON.parse(init?.body as string)
          expect(body).toEqual({ text: 'hello world', docId: 'doc-1', docName: 'Meeting Notes' })
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, destination: {} }),
          })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
    render(<Harness />)
    const button = await screen.findByRole('button', { name: 'Send' })
    selectAll()
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)

    const destinationButton = await screen.findByRole('button', { name: 'Meeting Notes' })
    await userEvent.click(destinationButton)

    // Sent text is deleted from the desktop (the Send flow's default
    // post-send action) and the popover closes.
    await waitFor(() => expect(capturedEditor?.getText()).toBe(''))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Meeting Notes' })).not.toBeInTheDocument(),
    )
  })

  it('searches Google Docs and can send to a new (unsaved) doc', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/google/status') {
          return Promise.resolve({ json: () => Promise.resolve({ connected: true }) })
        }
        if (url === '/api/destinations') {
          return Promise.resolve({ json: () => Promise.resolve({ destinations: [] }) })
        }
        if (url.startsWith('/api/google-docs/search')) {
          return Promise.resolve({
            json: () => Promise.resolve({ docs: [{ id: 'doc-2', name: 'Journal' }] }),
          })
        }
        if (url === '/api/send') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, destination: {} }) })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
    render(<Harness />)
    const button = await screen.findByRole('button', { name: 'Send' })
    selectAll()
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)

    const search = await screen.findByPlaceholderText('Search Google Docs…')
    await userEvent.type(search, 'Jour')

    const result = await screen.findByRole('button', { name: 'Journal' })
    await userEvent.click(result)

    await waitFor(() => expect(capturedEditor?.getText()).toBe(''))
  })

  it('shows an error and keeps the selection when the send fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/google/status') {
          return Promise.resolve({ json: () => Promise.resolve({ connected: true }) })
        }
        if (url === '/api/destinations') {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                destinations: [
                  { id: 'dest-1', type: 'google-doc', docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' },
                ],
              }),
          })
        }
        if (url === '/api/send') {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Google is not connected' }),
          })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
    render(<Harness />)
    const button = await screen.findByRole('button', { name: 'Send' })
    selectAll()
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)

    const destinationButton = await screen.findByRole('button', { name: 'Meeting Notes' })
    await userEvent.click(destinationButton)

    expect(await screen.findByText('Google is not connected')).toBeInTheDocument()
    expect(capturedEditor?.getText()).toBe('hello world')
  })
})
