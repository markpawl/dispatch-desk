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
  destinations?: unknown[]
  createdDestination?: unknown
  send?: { ok: boolean; body?: unknown }
  onSend?: (init?: RequestInit) => void
}

// SendMenu itself only ever calls /api/destinations (list) and /api/send --
// the create-a-destination flow (google/dropbox status+search,
// POST /api/destinations) is DestinationForm.tsx's, exercised here only via
// the "no destinations yet" empty-state case.
function stubFetch(options: StubOptions = {}) {
  const { destinations = [], createdDestination, send = { ok: true }, onSend } = options

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/destinations' && (!init || !init.method)) {
        return Promise.resolve({ json: () => Promise.resolve({ destinations }) })
      }
      if (url === '/api/destinations' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, destination: createdDestination }),
        })
      }
      if (url === '/api/google/status') {
        return Promise.resolve({ json: () => Promise.resolve({ connected: false }) })
      }
      if (url === '/api/dropbox/status') {
        return Promise.resolve({ json: () => Promise.resolve({ connected: false }) })
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

  it('lists saved destinations and sends + deletes the selection on click', async () => {
    const sent: RequestInit[] = []
    stubFetch({
      destinations: [
        {
          id: 'dest-1',
          type: 'google-doc',
          docId: 'doc-1',
          docName: 'Meeting Notes',
          shortLabel: 'Meeting Notes',
          createdAt: 'now',
        },
      ],
      onSend: (init) => sent.push(init as RequestInit),
    })
    await openMenu()

    const destinationButton = await screen.findByRole('button', { name: 'Meeting Notes' })
    await userEvent.click(destinationButton)

    // Sends by id (regardless of destination type) -- localDate/localTime
    // ride along too (only read server-side for an email destination, but
    // harmless to always send).
    const body = JSON.parse(sent[0].body as string) as Record<string, unknown>
    expect(body).toMatchObject({ text: 'hello world', destinationId: 'dest-1' })
    expect(body.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.localTime).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    await waitFor(() => expect(capturedEditor?.getText()).toBe(''))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Meeting Notes' })).not.toBeInTheDocument(),
    )
  })

  it('shows an error and keeps the selection when the send fails', async () => {
    stubFetch({
      destinations: [
        {
          id: 'dest-1',
          type: 'google-doc',
          docId: 'doc-1',
          docName: 'Meeting Notes',
          shortLabel: 'Meeting Notes',
          createdAt: 'now',
        },
      ],
      send: { ok: false, body: { error: 'Google is not connected' } },
    })
    await openMenu()

    const destinationButton = await screen.findByRole('button', { name: 'Meeting Notes' })
    await userEvent.click(destinationButton)

    expect(await screen.findByText('Google is not connected')).toBeInTheDocument()
    expect(capturedEditor?.getText()).toBe('hello world')
  })

  it('with no destinations yet, opens the create-destination form instead of an empty list', async () => {
    stubFetch({ destinations: [] })
    await openMenu()

    expect(await screen.findByRole('button', { name: 'Email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google Doc' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dropbox File' })).toBeInTheDocument()
  })

  it('creating the first destination inline offers "Send from <label>", and sends', async () => {
    const sent: RequestInit[] = []
    const created = {
      id: 'new-email',
      type: 'email',
      address: 'to@example.com',
      shortLabel: 'Weekly Notes',
      createdAt: 'now',
    }
    stubFetch({ destinations: [], createdDestination: created, onSend: (init) => sent.push(init as RequestInit) })
    await openMenu()

    await userEvent.click(await screen.findByRole('button', { name: 'Email' }))
    await userEvent.type(screen.getByLabelText('Address'), 'to@example.com')
    await userEvent.type(screen.getByLabelText('Short label'), 'Weekly Notes')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const sendButton = await screen.findByRole('button', { name: 'Send from Weekly Notes' })
    await userEvent.click(sendButton)

    const body = JSON.parse(sent[0].body as string) as Record<string, unknown>
    expect(body).toMatchObject({ text: 'hello world', destinationId: 'new-email' })
  })

  it('canceling the create-destination form (no destinations yet) closes the popover', async () => {
    stubFetch({ destinations: [] })
    await openMenu()

    await userEvent.click(await screen.findByRole('button', { name: 'Email' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()
  })
})
