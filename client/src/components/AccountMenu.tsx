import { useEffect, useRef, useState } from 'react'

type Provider = 'google' | 'dropbox'

interface AccountMenuProps {
  user: { name: string; email: string }
  googleConnected: boolean | null
  dropboxConnected: boolean | null
  onDisconnected: (provider: Provider) => void
  onSignedOut: () => void
}

const PROVIDER_LABEL: Record<Provider, string> = { google: 'Google', dropbox: 'Dropbox' }

// The header account menu: the signed-in identity, per-provider
// connect/disconnect, and sign-out. Replaces the ad-hoc "Connect Google"
// header link from before per-user accounts existed.
export function AccountMenu({
  user,
  googleConnected,
  dropboxConnected,
  onDisconnected,
  onSignedOut,
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onClickAway = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [isOpen])

  const disconnect = async (provider: Provider) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/${provider}/disconnect`, { method: 'POST' })
      if (response.ok) onDisconnected(provider)
    } catch {
      // Leave the row as-is; the user can retry.
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await fetch('/auth/logout', { method: 'POST' })
    } catch {
      // Clear local state regardless -- the cookie is likely gone and a
      // stale one just fails the next /api/me.
    }
    onSignedOut()
  }

  const providerRow = (provider: Provider, connected: boolean | null) => (
    <div className="account-menu-row">
      <span>{PROVIDER_LABEL[provider]}</span>
      {connected === null && <span className="account-menu-muted">…</span>}
      {connected === false && (
        <a className="account-menu-link" href={`/auth/connect/${provider}`}>
          Connect
        </a>
      )}
      {connected === true && (
        <button type="button" disabled={busy} onClick={() => disconnect(provider)}>
          Disconnect
        </button>
      )}
    </div>
  )

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        type="button"
        className="account-menu-button"
        onClick={() => setIsOpen((open) => !open)}
        title="Account and connections"
      >
        {user.name}
      </button>
      {isOpen && (
        <div className="account-menu-popover">
          <div className="account-menu-email">{user.email}</div>
          {providerRow('google', googleConnected)}
          {providerRow('dropbox', dropboxConnected)}
          <div className="account-menu-divider" />
          <button
            type="button"
            className="account-menu-signout"
            disabled={busy}
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
