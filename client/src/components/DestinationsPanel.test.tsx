import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationsPanel } from './DestinationsPanel'

const DESTINATIONS = [
  { id: 'd1', type: 'google-doc' as const, docId: 'g1', docName: 'Notes', createdAt: '' },
  { id: 'd2', type: 'dropbox-file' as const, path: '/x.md', name: 'x.md', createdAt: '' },
]

function stubFetch(destinations: unknown[] = DESTINATIONS, deleteOk = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/destinations') {
        return Promise.resolve({ json: () => Promise.resolve({ destinations }) })
      }
      if (url.startsWith('/api/destinations/') && init?.method === 'DELETE') {
        return Promise.resolve({ ok: deleteOk })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }),
  )
}

describe('DestinationsPanel', () => {
  beforeEach(() => {
    stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<DestinationsPanel open={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the placeholder Channels list and the real, fetched Destinations list', async () => {
    render(<DestinationsPanel open />)

    expect(screen.getByRole('heading', { name: 'Channels' })).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Google Drive folder')).toBeInTheDocument()
    expect(screen.getByText('Data store row')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Destinations' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())
    expect(screen.getByText('x.md')).toBeInTheDocument()
  })

  it('shows "None yet" when there are no saved destinations', async () => {
    stubFetch([])
    render(<DestinationsPanel open />)
    await waitFor(() => expect(screen.getByText('None yet')).toBeInTheDocument())
  })

  it('deletes a destination after an inline confirm', async () => {
    const user = userEvent.setup()
    render(<DestinationsPanel open />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Notes' }))
    expect(screen.getByText('Delete "Notes"?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Notes')).not.toBeInTheDocument())
    expect(screen.getByText('x.md')).toBeInTheDocument()
  })

  it('cancels the confirm without deleting', async () => {
    const user = userEvent.setup()
    render(<DestinationsPanel open />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Notes' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Delete "Notes"?')).not.toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('shows an error and keeps the row if the delete request fails', async () => {
    stubFetch(DESTINATIONS, false)
    const user = userEvent.setup()
    render(<DestinationsPanel open />)
    await waitFor(() => expect(screen.getByText('Notes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Notes' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(screen.getByText('Failed to delete destination')).toBeInTheDocument(),
    )
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })
})
