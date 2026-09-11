import { useEffect, useState } from 'react'
import { type DestinationChannel, DestinationForm } from './DestinationForm'
import { destinationLabel, type SavedDestination } from '../lib/destinations'

interface Channel {
  id: DestinationChannel
  name: string
}

const CHANNELS: Channel[] = [
  { id: 'email', name: 'Email' },
  { id: 'google-doc', name: 'Google Doc' },
  { id: 'dropbox-file', name: 'Dropbox File' },
]

interface DestinationsPanelProps {
  open: boolean
}

// The right-side panel from docs/REQUIREMENTS.md's Destination sidebar flow,
// showing two lists -- channels (clicking one opens DestinationForm.tsx to
// create a destination of that type, per docs/CURRENT-WORK.md's Group D2)
// and destinations (the real, saved instances, deletable here per Group A).
export function DestinationsPanel({ open }: DestinationsPanelProps) {
  const [destinations, setDestinations] = useState<SavedDestination[]>([])
  // The one destination (if any) currently showing its inline "delete this?"
  // confirmation in place of its normal row.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formChannel, setFormChannel] = useState<DestinationChannel | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/destinations')
      .then((response) => response.json())
      .then((body: { destinations: SavedDestination[] }) => {
        setDestinations(body.destinations)
        setError(null)
      })
      .catch(() => setError('Failed to load destinations'))
  }, [open])

  const confirmDelete = (id: string) => {
    setDeletingId(id)
    setError(null)
    fetch(`/api/destinations/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then((response) => {
        if (!response.ok) throw new Error('Delete failed')
        setDestinations((current) => current.filter((destination) => destination.id !== id))
      })
      .catch(() => setError('Failed to delete destination'))
      // Drop out of the confirm view either way -- on success the row is
      // gone anyway; on failure this lets the user see the row (and the
      // error message) rather than leaving it stuck showing the confirm.
      .finally(() => {
        setConfirmingId(null)
        setDeletingId(null)
      })
  }

  const handleCreated = (destination: SavedDestination) => {
    setDestinations((current) => [...current, destination])
    setFormChannel(null)
  }

  if (!open) return null

  if (formChannel) {
    return (
      <aside className="destinations-panel" aria-label="Create a destination">
        <h2>New {CHANNELS.find((channel) => channel.id === formChannel)?.name} destination</h2>
        <DestinationForm
          destinations={destinations}
          initialChannel={formChannel}
          onCreated={handleCreated}
          onCancel={() => setFormChannel(null)}
        />
      </aside>
    )
  }

  return (
    <aside className="destinations-panel" aria-label="Channels and destinations">
      <section>
        <h2>Channels</h2>
        <ul>
          {CHANNELS.map((channel) => (
            <li key={channel.id}>
              <button type="button" onClick={() => setFormChannel(channel.id)}>
                {channel.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Destinations</h2>
        {destinations.length === 0 && <div className="destinations-panel-empty">None yet</div>}
        <ul>
          {destinations.map((destination) =>
            confirmingId === destination.id ? (
              <li key={destination.id} className="destinations-panel-confirm">
                <span>Delete "{destinationLabel(destination)}"?</span>
                <div className="destinations-panel-confirm-actions">
                  <button
                    type="button"
                    disabled={deletingId === destination.id}
                    onClick={() => confirmDelete(destination.id)}
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmingId(null)}>
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={destination.id}>
                <span>{destinationLabel(destination)}</span>
                <button
                  type="button"
                  className="destinations-panel-delete"
                  aria-label={`Delete ${destinationLabel(destination)}`}
                  onClick={() => setConfirmingId(destination.id)}
                >
                  ×
                </button>
              </li>
            ),
          )}
        </ul>
        {error && <div className="send-menu-error">{error}</div>}
      </section>
    </aside>
  )
}
