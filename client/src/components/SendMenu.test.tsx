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

interface StubOptions {
  google?: boolean
  dropbox?: boolean
  destinations?: unknown[]
  googleDocs?: { id: string; name: string }[]
  dropboxFiles?: { path: string; name: string }[]
  send?: { ok: boolean; body?: unknown }
  onSend?: (init?: RequestInit) => void
}

// SendMenu now probes both /api/google/status and /api/dropbox/status on open
// (plus /api/destinations), and searches each connected provider separately.
function stubFetch(options: StubOptions = {}) {
  const {
    google = false,
    dropbox = false,
    destinations = [],
    googleDocs = [],
    dropboxFiles = [],
    send = { ok: true },
    onSend,
  } = options

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/google/status') {
        return Promise.resolve({ json: () => Promise.resolve({ connected: google }) })
      }
      if (url === '/api/dropbox/status') {
        return Promise.resolve({ json: () => Promise.resolve({ connected: dropbox }) })
      }
      if (url === '/api/destinations') {
        return Promise.resolve({ json: () => Promise.resolve({ destinations }) })
      }
      if (url.startsWith('/api/google-docs/search')) {
        return Promise.resolve({ json: () => Promise.resolve({ docs: googleDocs }) })
      }
      if (url.startsWith('/api/dropbox/search')) {
        return Promise.resolve({ json: () => Promise.resolve({ files: dropboxFiles }) })
      }
      if (url === '/api/send') {
        onSend?.(init)
        return Promise.resolve({
          ok: send.ok,
          json: () => Promise.resolve(send.body ?? { ok: send.ok, destination: {} }),
        })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }),
  )
}

async function openMenu() {
  render(<Harness />)
  const button = await screen.findByRole('button', { name: 'Send' })
  selectAll()
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
  return button
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

  it('shows connect prompts for both providers when neither is connected', async () => {
    stubFetch({ google: false, dropbox: false })
    await openMenu()

    expect(await screen.findByRole('link', { name: 'Connect Google to send' })).toHaveAttribute(
      'href',
      '/auth/connect/google',
    )
    expect(screen.getByRole('link', { name: 'Connect Dropbox to send' })).toHaveAttribute(
      'href',
      '/auth/connect/dropbox',
    )
  })

  it('lists saved destinations and sends + deletes the selection on click', async () => {
    const sent: RequestInit[] = []
    stubFetch({
      google: true,
      destinations: [
        { id: 'dest-1', type: 'google-doc', docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' },
      ],
      onSend: (init) => sent.push(init as RequestInit),
    })
    await openMenu()

    const destinationButton = await screen.findByRole('button', { name: 'Meeting Notes' })
    await userEvent.click(destinationButton)

    expect(JSON.parse(sent[0].body as string)).toEqual({
      text: 'hello world',
      docId: 'doc-1',
      docName: 'Meeting Notes',
    })
    await waitFor(() => expect(capturedEditor?.getText()).toBe(''))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Meeting Notes' })).not.toBeInTheDocument(),
    )
  })

  it('searches Google Docs and sends to a new (unsaved) doc', async () => {
    const sent: RequestInit[] = []
    stubFetch({
      google: true,
      googleDocs: [{ id: 'doc-2', name: 'Journal' }],
      onSend: (init) => sent.push(init as RequestInit),
    })
    await openMenu()

    const search = await screen.findByPlaceholderText('Search Google Docs…')
    await userEvent.type(search, 'Jour')

    const result = await screen.findByRole('button', { name: 'Journal' })
    await userEvent.click(result)

    expect(JSON.parse(sent[0].body as string)).toEqual({
      text: 'hello world',
      docId: 'doc-2',
      docName: 'Journal',
    })
    await waitFor(() => expect(capturedEditor?.getText()).toBe(''))
  })

  it('searches Dropbox and sends to a file (dropboxPath/dropboxName body)', async () => {
    const sent: RequestInit[] = []
    stubFetch({
      dropbox: true,
      dropboxFiles: [{ path: '/journal.md', name: 'journal.md' }],
      onSend: (init) => sent.push(init as RequestInit),
    })
    await openMenu()

    const search = await screen.findByPlaceholderText('Search Dropbox files…')
    await userEvent.type(search, 'jour')

    const result = await screen.findByRole('button', { name: 'journal.md' })
    await userEvent.click(result)

    expect(JSON.parse(sent[0].body as string)).toEqual({
      text: 'hello world',
      dropboxPath: '/journal.md',
      dropboxName: 'journal.md',
    })
    await waitFor(() => expect(capturedEditor?.getText()).toBe(''))
  })

  it('shows an error and keeps the selection when the send fails', async () => {
    stubFetch({
      google: true,
      destinations: [
        { id: 'dest-1', type: 'google-doc', docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' },
      ],
      send: { ok: false, body: { error: 'Google is not connected' } },
    })
    await openMenu()

    const destinationButton = await screen.findByRole('button', { name: 'Meeting Notes' })
    await userEvent.click(destinationButton)

    expect(await screen.findByText('Google is not connected')).toBeInTheDocument()
    expect(capturedEditor?.getText()).toBe('hello world')
  })
})
