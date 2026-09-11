import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DestinationForm } from './DestinationForm'
import type { SavedDestination } from '../lib/destinations'

const EMAIL_TEMPLATE: SavedDestination = {
  id: 'e1',
  type: 'email',
  address: 'existing@example.com',
  shortLabel: 'Existing',
  emailSubjectLabel: 'Existing Subject',
  createdAt: '',
}
const GOOGLE_DOC_TEMPLATE: SavedDestination = {
  id: 'g1',
  type: 'google-doc',
  docId: 'doc-existing',
  docName: 'Existing Doc',
  shortLabel: 'Existing Doc Label',
  createdAt: '',
}

interface StubOptions {
  googleConnected?: boolean
  dropboxConnected?: boolean
  googleDocs?: { id: string; name: string }[]
  dropboxFiles?: { path: string; name: string }[]
  createOk?: boolean
  createdDestination?: SavedDestination
  onCreate?: (body: unknown) => void
}

function stubFetch(options: StubOptions = {}) {
  const {
    googleConnected = false,
    dropboxConnected = false,
    googleDocs = [],
    dropboxFiles = [],
    createOk = true,
    createdDestination,
    onCreate,
  } = options

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/google/status') {
        return Promise.resolve({ json: () => Promise.resolve({ connected: googleConnected }) })
      }
      if (url === '/api/dropbox/status') {
        return Promise.resolve({ json: () => Promise.resolve({ connected: dropboxConnected }) })
      }
      if (url.startsWith('/api/google-docs/search')) {
        return Promise.resolve({ json: () => Promise.resolve({ docs: googleDocs }) })
      }
      if (url.startsWith('/api/dropbox/search')) {
        return Promise.resolve({ json: () => Promise.resolve({ files: dropboxFiles }) })
      }
      if (url === '/api/destinations' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as { type: string }
        onCreate?.(body)
        return Promise.resolve({
          ok: createOk,
          json: () =>
            Promise.resolve(
              createOk
                ? { ok: true, destination: createdDestination ?? { id: 'new', ...body } }
                : { error: 'Failed to create destination' },
            ),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }),
  )
}

describe('DestinationForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a channel picker when no initialChannel is given', () => {
    stubFetch()
    render(<DestinationForm destinations={[]} onCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google Doc' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dropbox File' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()
  })

  it('clicking a channel in the picker reveals that channel\'s form', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<DestinationForm destinations={[]} onCreated={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Email' }))
    expect(screen.getByLabelText('Address')).toBeInTheDocument()
  })

  it('with an initialChannel, skips the picker and shows that form directly', () => {
    stubFetch()
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="email"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Google Doc' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Address')).toBeInTheDocument()
  })

  it('Save is disabled until address and shortLabel are filled, for email', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="email"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.type(screen.getByLabelText('Address'), 'to@example.com')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.type(screen.getByLabelText('Short label'), 'Weekly Notes')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('creates an email destination, omitting emailSubjectLabel when blank', async () => {
    const onCreate = vi.fn()
    const created: SavedDestination = {
      id: 'new-email',
      type: 'email',
      address: 'to@example.com',
      shortLabel: 'Weekly Notes',
      createdAt: '',
    }
    stubFetch({ onCreate, createdDestination: created })
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="email"
        onCreated={onCreated}
        onCancel={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText('Address'), 'to@example.com')
    await user.type(screen.getByLabelText('Short label'), 'Weekly Notes')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
    expect(onCreate).toHaveBeenCalledWith({
      type: 'email',
      address: 'to@example.com',
      shortLabel: 'Weekly Notes',
    })
  })

  it('includes emailSubjectLabel when filled in', async () => {
    const onCreate = vi.fn()
    stubFetch({ onCreate })
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="email"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText('Address'), 'to@example.com')
    await user.type(screen.getByLabelText('Short label'), 'Weekly Notes')
    await user.type(
      screen.getByLabelText('Email subject label (optional)'),
      'Notes',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        type: 'email',
        address: 'to@example.com',
        shortLabel: 'Weekly Notes',
        emailSubjectLabel: 'Notes',
      }),
    )
  })

  it('"start with existing" reveals a template dropdown that prefills the email form', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[EMAIL_TEMPLATE]}
        initialChannel="email"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Address')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Start with existing' }))
    await user.selectOptions(screen.getByLabelText('Start with existing'), 'e1')

    expect(screen.getByLabelText('Address')).toHaveValue('existing@example.com')
    expect(screen.getByLabelText('Short label')).toHaveValue('Existing')
    expect(screen.getByLabelText('Email subject label (optional)')).toHaveValue(
      'Existing Subject',
    )
  })

  it('a template\'s fields are still editable afterward (overwritable)', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[EMAIL_TEMPLATE]}
        initialChannel="email"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Start with existing' }))
    await user.selectOptions(screen.getByLabelText('Start with existing'), 'e1')
    await user.clear(screen.getByLabelText('Short label'))
    await user.type(screen.getByLabelText('Short label'), 'Renamed')
    expect(screen.getByLabelText('Short label')).toHaveValue('Renamed')
  })

  it('does not offer "start with existing" when there are no same-type destinations', () => {
    stubFetch()
    render(
      <DestinationForm
        destinations={[GOOGLE_DOC_TEMPLATE]}
        initialChannel="email"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Start with existing' })).not.toBeInTheDocument()
  })

  it('Google Doc channel: not connected shows a connect link, no search box', async () => {
    stubFetch({ googleConnected: false })
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="google-doc"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(await screen.findByRole('link', { name: /Connect Google/ })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search Google Docs…')).not.toBeInTheDocument()
  })

  it('Google Doc channel: connected, searches, picks a result, saves with a defaulted shortLabel', async () => {
    const onCreate = vi.fn()
    stubFetch({
      googleConnected: true,
      googleDocs: [{ id: 'doc-1', name: 'Meeting Notes' }],
      onCreate,
    })
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="google-doc"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await user.type(await screen.findByPlaceholderText('Search Google Docs…'), 'Meeting')
    const result = await screen.findByRole('button', { name: 'Meeting Notes' })
    await user.click(result)

    // shortLabel defaults to the picked doc's name, but stays editable.
    expect(screen.getByLabelText(/Short label/)).toHaveValue('Meeting Notes')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        type: 'google-doc',
        docId: 'doc-1',
        docName: 'Meeting Notes',
        shortLabel: 'Meeting Notes',
      }),
    )
  })

  it('Dropbox channel: connected, searches, picks a result, saves', async () => {
    const onCreate = vi.fn()
    stubFetch({
      dropboxConnected: true,
      dropboxFiles: [{ path: '/journal.md', name: 'journal.md' }],
      onCreate,
    })
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="dropbox-file"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await user.type(await screen.findByPlaceholderText('Search Dropbox files…'), 'journal')
    const result = await screen.findByRole('button', { name: 'journal.md' })
    await user.click(result)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        type: 'dropbox-file',
        path: '/journal.md',
        name: 'journal.md',
        shortLabel: 'journal.md',
      }),
    )
  })

  it('shows an error and does not call onCreated when the create request fails', async () => {
    stubFetch({ createOk: false })
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="email"
        onCreated={onCreated}
        onCancel={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText('Address'), 'to@example.com')
    await user.type(screen.getByLabelText('Short label'), 'Weekly Notes')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Failed to create destination')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('Cancel calls onCancel', async () => {
    stubFetch()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <DestinationForm
        destinations={[]}
        initialChannel="email"
        onCreated={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
