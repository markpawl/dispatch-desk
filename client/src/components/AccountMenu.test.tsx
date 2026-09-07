import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountMenu } from './AccountMenu'

const user = { name: 'Ada Lovelace', email: 'ada@example.com' }

function renderMenu(overrides: Partial<Parameters<typeof AccountMenu>[0]> = {}) {
  const onDisconnected = vi.fn()
  const onSignedOut = vi.fn()
  render(
    <AccountMenu
      user={user}
      googleConnected={false}
      dropboxConnected={false}
      onDisconnected={onDisconnected}
      onSignedOut={onSignedOut}
      {...overrides}
    />,
  )
  return { onDisconnected, onSignedOut }
}

describe('AccountMenu', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens on click and shows the signed-in email', async () => {
    renderMenu()
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }))
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('shows a Connect link per disconnected provider', async () => {
    renderMenu({ googleConnected: false, dropboxConnected: false })
    await userEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }))

    const links = screen.getAllByRole('link', { name: 'Connect' })
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/auth/connect/google',
      '/auth/connect/dropbox',
    ])
  })

  it('disconnects a connected provider and notifies the parent', async () => {
    const { onDisconnected } = renderMenu({ googleConnected: true, dropboxConnected: false })
    await userEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }))

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    expect(fetch).toHaveBeenCalledWith('/api/google/disconnect', { method: 'POST' })
    await waitFor(() => expect(onDisconnected).toHaveBeenCalledWith('google'))
  })

  it('signs out: posts logout then calls onSignedOut', async () => {
    const { onSignedOut } = renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(fetch).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled())
  })
})
