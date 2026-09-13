import type { Editor } from '@tiptap/react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationsPanel } from './DestinationsPanel'

const DESTINATIONS = [
  {
    id: 'd1',
    type: 'google-doc' as const,
    docId: 'g1',
    docName: 'Notes',
    shortLabel: 'Notes',
    createdAt: '',
  },
  {
    id: 'd2',
    type: 'dropbox-file' as const,
    path: '/x.md',
    name: 'x.md',
    shortLabel: 'x.md',
    createdAt: '',
  },
]

const CREATED_EMAIL_DESTINATION = {
  id: 'd3',
  type: 'email' as const,
  address: 'to@example.com',
  shortLabel: 'Weekly Notes',
  createdAt: '',
}

function stubFetch(destinations: unknown[] = DESTINATIONS, deleteOk = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/destinations' && (!init || !init.method)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ destinations }) })
      }
      if (url === '/api/destinations' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, destination: CREATED_EMAIL_DESTINATION }),
        })
      }
      if (url.startsWith('/api/destinations/') && init?.method === 'DELETE') {
        return Promise.resolve({ ok: deleteOk })
      }
      if (url === '/api/send' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (url === '/api/google/status') {
        return Promise.resolve({ json: () => Promise.resolve({ connected: false }) })
      }
      if (url === '/api/dropbox/status') {
        return Promise.resolve({ json: () => Promise.resolve({ connected: false }) })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }),
  )
}

// A real Tiptap editor (not a hand-rolled fake), same rationale as
// SendMenu.test.tsx's harness -- useEditorState's selectors need one.
let capturedEditor: Editor | null = null
function Harness() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>hello world</p>',
    onCreate: ({ editor }) => {
      capturedEditor = editor
    },
  })
  return <DestinationsPanel editor={editor} />
}

function selectAll() {
  act(() => {
    capturedEditor?.commands.selectAll()
  })
}

describe('DestinationsPanel', () => {
  beforeEach(() => {
    stubFetch()
    capturedEditor = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('disabled: renders without fetching, channel buttons disabled', () => {
    const fetchSpy = vi.mocked(fetch)
    render(<DestinationsPanel editor={null} disabled />)

    expect(screen.getByRole('heading', { name: 'Channels' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Google Doc' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Dropbox File' })).toBeDisabled()
    expect(screen.getByText('None yet')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows the Channels list and the real, fetched Destinations list', async () => {
    render(<DestinationsPanel editor={null} />)

    expect(screen.getByRole('heading', { name: 'Channels' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google Doc' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dropbox File' })).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Destinations' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())
    expect(screen.getByText('x.md')).toBeInTheDocument()
  })

  it('shows "None yet" when there are no saved destinations', async () => {
    stubFetch([])
    render(<DestinationsPanel editor={null} />)
    await waitFor(() => expect(screen.getByText('None yet')).toBeInTheDocument())
  })

  it('a destination row is disabled with no text selection', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())
    const row = screen.getByRole('button', { name: 'Notes' })
    expect(row).toBeDisabled()
    // The hover tooltip (docs/IDEAS.md's Pending item 11) combines the
    // computed description with the selection hint.
    expect(row).toHaveAttribute('title', 'Google Doc, Notes — select text first')
  })

  it('selecting text enables a destination row; clicking it sends and clears the selection', async () => {
    const sent: RequestInit[] = []
    stubFetch(DESTINATIONS)
    vi.mocked(fetch).mockImplementation((url, init) => {
      const urlStr = String(url)
      if (urlStr === '/api/send' && init?.method === 'POST') {
        sent.push(init)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }) as never
      }
      if (urlStr === '/api/destinations' && (!init || !init.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ destinations: DESTINATIONS }),
        }) as never
      }
      return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`)) as never
    })

    const user = userEvent.setup()
    render(<Harness />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())
    selectAll()

    const row = await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Notes' })
      expect(button).toBeEnabled()
      return button
    })
    await user.click(row)

    expect(JSON.parse(sent[0].body as string)).toMatchObject({
      text: 'hello world',
      destinationId: 'd1',
    })
    await waitFor(() => expect(capturedEditor?.getText()).toBe(''))
  })

  it('shows an inline error and keeps the selection if sending fails', async () => {
    vi.mocked(fetch).mockImplementation((url, init) => {
      const urlStr = String(url)
      if (urlStr === '/api/send' && init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Send failed' }),
        }) as never
      }
      if (urlStr === '/api/destinations' && (!init || !init.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ destinations: DESTINATIONS }),
        }) as never
      }
      return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`)) as never
    })

    const user = userEvent.setup()
    render(<Harness />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())
    selectAll()

    await user.click(await waitFor(() => screen.getByRole('button', { name: 'Notes' })))

    expect(await screen.findByText('Send failed')).toBeInTheDocument()
    expect(capturedEditor?.getText()).toBe('hello world')
  })

  it('deletes a destination after an inline confirm', async () => {
    const user = userEvent.setup()
    render(<DestinationsPanel editor={null} />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Notes' }))
    expect(screen.getByText('Delete "Notes"?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Notes')).not.toBeInTheDocument())
    expect(screen.getByText('x.md')).toBeInTheDocument()
  })

  it('cancels the confirm without deleting', async () => {
    const user = userEvent.setup()
    render(<DestinationsPanel editor={null} />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Notes' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Delete "Notes"?')).not.toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('shows an error and keeps the row if the delete request fails', async () => {
    stubFetch(DESTINATIONS, false)
    const user = userEvent.setup()
    render(<DestinationsPanel editor={null} />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Notes' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(screen.getByText('Failed to delete destination')).toBeInTheDocument(),
    )
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('clicking a channel opens DestinationForm for it; saving inserts the new destination', async () => {
    const user = userEvent.setup()
    render(<DestinationsPanel editor={null} />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Email' }))
    expect(screen.getByRole('heading', { name: 'New Email destination' })).toBeInTheDocument()
    // The normal channels/destinations lists are replaced while the form is open.
    expect(screen.queryByRole('button', { name: 'Google Doc' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Address'), 'to@example.com')
    await user.type(screen.getByLabelText('Short label'), 'Weekly Notes')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New Email destination' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { name: 'Channels' })).toBeInTheDocument()
    expect(screen.getByText('Weekly Notes')).toBeInTheDocument()
  })
})
