import { useEffect, useState } from 'react'
import { destinationLabel, type SavedDestination } from '../lib/destinations'

export type DestinationChannel = 'email' | 'google-doc' | 'dropbox-file'

interface PickedFile {
  // For Google Docs this is the doc id; for Dropbox it's the file path.
  ref: string
  name: string
}

interface DestinationFormProps {
  // The full saved-destinations list -- filtered internally by channel for
  // the "start with existing" template picker.
  destinations: SavedDestination[]
  // Preset from DestinationsPanel's channel click -- skips the channel
  // picker below and goes straight to that channel's form. Omitted for
  // SendMenu's "no destinations yet" flow, which shows the picker first.
  initialChannel?: DestinationChannel
  onCreated: (destination: SavedDestination) => void
  onCancel: () => void
}

// The channel-picker -> per-channel form -> "start with existing" template
// -> save flow for creating a destination (see docs/CURRENT-WORK.md's Group
// D2). Google Doc/Dropbox reuse the search-and-pick pattern SendMenu.tsx
// uses today (SendMenu's own copy goes away in Group D3, once this is the
// only way to create a destination) as their way of setting docId/path;
// shortLabel is a separately editable display label on every channel.
export function DestinationForm({
  destinations,
  initialChannel,
  onCreated,
  onCancel,
}: DestinationFormProps) {
  const [channel, setChannel] = useState<DestinationChannel | null>(initialChannel ?? null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [shortLabel, setShortLabel] = useState('')
  const [address, setAddress] = useState('')
  const [emailSubjectLabel, setEmailSubjectLabel] = useState('')
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickedFile[]>([])
  const [searching, setSearching] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only fires for a preset initialChannel -- selectChannel below handles
  // the connection check for the picker's own channel buttons directly, in
  // the click handler rather than a same-render effect.
  useEffect(() => {
    if (initialChannel === 'google-doc') {
      fetch('/api/google/status')
        .then((response) => response.json())
        .then((body: { connected: boolean }) => setConnected(body.connected))
        .catch(() => setConnected(false))
    } else if (initialChannel === 'dropbox-file') {
      fetch('/api/dropbox/status')
        .then((response) => response.json())
        .then((body: { connected: boolean }) => setConnected(body.connected))
        .catch(() => setConnected(false))
    }
  }, [initialChannel])

  const selectChannel = (next: DestinationChannel) => {
    setChannel(next)
    setShowTemplates(false)
    setTemplateId('')
    setShortLabel('')
    setAddress('')
    setEmailSubjectLabel('')
    setPicked(null)
    setQuery('')
    setResults([])
    setError(null)
    setConnected(null)
    if (next === 'google-doc') {
      fetch('/api/google/status')
        .then((response) => response.json())
        .then((body: { connected: boolean }) => setConnected(body.connected))
        .catch(() => setConnected(false))
    } else if (next === 'dropbox-file') {
      fetch('/api/dropbox/status')
        .then((response) => response.json())
        .then((body: { connected: boolean }) => setConnected(body.connected))
        .catch(() => setConnected(false))
    }
  }

  const templatesForChannel = channel
    ? destinations.filter((destination) => destination.type === channel)
    : []

  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const template = templatesForChannel.find((destination) => destination.id === id)
    if (!template) return
    setShortLabel(template.shortLabel)
    if (template.type === 'email') {
      setAddress(template.address)
      setEmailSubjectLabel(template.emailSubjectLabel ?? '')
    } else if (template.type === 'google-doc') {
      setPicked({ ref: template.docId, name: template.docName })
    } else if (template.type === 'dropbox-file') {
      setPicked({ ref: template.path, name: template.name })
    }
  }

  const runGoogleSearch = (nextQuery: string) => {
    setQuery(nextQuery)
    setSearching(true)
    fetch(`/api/google-docs/search?q=${encodeURIComponent(nextQuery)}`)
      .then((response) => response.json())
      .then((body: { docs: { id: string; name: string }[] }) =>
        setResults(body.docs.map((doc) => ({ ref: doc.id, name: doc.name }))),
      )
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }

  const runDropboxSearch = (nextQuery: string) => {
    setQuery(nextQuery)
    setSearching(true)
    fetch(`/api/dropbox/search?q=${encodeURIComponent(nextQuery)}`)
      .then((response) => response.json())
      .then((body: { files: { path: string; name: string }[] }) =>
        setResults(body.files.map((file) => ({ ref: file.path, name: file.name }))),
      )
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }

  const pick = (file: PickedFile) => {
    setPicked(file)
    setShortLabel(file.name)
  }

  const canSave =
    shortLabel.trim() !== '' && (channel === 'email' ? address.trim() !== '' : picked !== null)

  const save = async () => {
    if (!channel || !canSave) return
    const body =
      channel === 'email'
        ? {
            type: 'email',
            address,
            shortLabel,
            ...(emailSubjectLabel.trim() ? { emailSubjectLabel } : {}),
          }
        : channel === 'google-doc'
          ? { type: 'google-doc', docId: picked?.ref, docName: picked?.name, shortLabel }
          : { type: 'dropbox-file', path: picked?.ref, name: picked?.name, shortLabel }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/destinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(errorBody?.error ?? 'Failed to create destination')
      }
      const created = (await response.json()) as { destination: SavedDestination }
      onCreated(created.destination)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create destination')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="destination-form">
      {!initialChannel && !channel && (
        <div className="destination-form-channels">
          <button type="button" onClick={() => selectChannel('email')}>
            Email
          </button>
          <button type="button" onClick={() => selectChannel('google-doc')}>
            Google Doc
          </button>
          <button type="button" onClick={() => selectChannel('dropbox-file')}>
            Dropbox File
          </button>
        </div>
      )}

      {channel && (
        <div className="destination-form-fields">
          {templatesForChannel.length > 0 && !showTemplates && (
            <button type="button" onClick={() => setShowTemplates(true)}>
              Start with existing
            </button>
          )}
          {showTemplates && (
            <label className="destination-form-field">
              Start with existing
              <select value={templateId} onChange={(event) => applyTemplate(event.target.value)}>
                <option value="">— choose —</option>
                {templatesForChannel.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destinationLabel(destination)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {channel === 'email' && (
            <>
              <label className="destination-form-field">
                Address
                <input
                  type="email"
                  value={address}
                  disabled={saving}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </label>
              <label className="destination-form-field">
                Short label
                <input
                  type="text"
                  value={shortLabel}
                  disabled={saving}
                  onChange={(event) => setShortLabel(event.target.value)}
                />
              </label>
              <label className="destination-form-field">
                Email subject label (optional)
                <input
                  type="text"
                  value={emailSubjectLabel}
                  disabled={saving}
                  onChange={(event) => setEmailSubjectLabel(event.target.value)}
                />
              </label>
            </>
          )}

          {(channel === 'google-doc' || channel === 'dropbox-file') && (
            <>
              {connected === null && (
                <div className="send-menu-status">Checking connection…</div>
              )}
              {connected === false && (
                <a
                  className="google-connect"
                  href={channel === 'google-doc' ? '/auth/connect/google' : '/auth/connect/dropbox'}
                >
                  Connect {channel === 'google-doc' ? 'Google' : 'Dropbox'} to pick a{' '}
                  {channel === 'google-doc' ? 'doc' : 'file'}
                </a>
              )}
              {connected === true && (
                <>
                  <input
                    type="text"
                    className="send-menu-search"
                    placeholder={
                      channel === 'google-doc' ? 'Search Google Docs…' : 'Search Dropbox files…'
                    }
                    value={query}
                    disabled={saving}
                    onChange={(event) =>
                      channel === 'google-doc'
                        ? runGoogleSearch(event.target.value)
                        : runDropboxSearch(event.target.value)
                    }
                  />
                  {searching && <div className="send-menu-status">Searching…</div>}
                  {!searching && query && results.length === 0 && (
                    <div className="send-menu-status">No matches</div>
                  )}
                  <ul className="send-menu-results">
                    {results.map((file) => (
                      <li key={file.ref}>
                        <button type="button" disabled={saving} onClick={() => pick(file)}>
                          {file.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {picked && (
                    <label className="destination-form-field">
                      Short label (picked: {picked.name})
                      <input
                        type="text"
                        value={shortLabel}
                        disabled={saving}
                        onChange={(event) => setShortLabel(event.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
            </>
          )}

          {error && <div className="send-menu-error">{error}</div>}

          <div className="destination-form-actions">
            <button type="button" disabled={!canSave || saving} onClick={save}>
              Save
            </button>
            <button type="button" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
