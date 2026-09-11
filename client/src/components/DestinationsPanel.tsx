import { useEffect, useState } from 'react'
import { destinationLabel, type SavedDestination } from '../lib/destinations'

interface Channel {
  id: string
  name: string
}

// Placeholder -- clicking a channel to open a creation form is
// docs/CURRENT-WORK.md's Group D, not built yet.
const DUMMY_CHANNELS: Channel[] = [
  { id: 'email', name: 'Email' },
  { id: 'gdrive-folder', name: 'Google Drive folder' },
  { id: 'data-store-row', name: 'Data store row' },
]

interface DestinationsPanelProps {
  open: boolean
}

// The right-side panel from docs/REQUIREMENTS.md's Destination sidebar flow,
// showing two lists -- channels (the available destination types, still
// placeholder per the comment above) and destinations (the real, saved
// instances, deletable here). See docs/CURRENT-WORK.md's Group A.
export function DestinationsPanel({ open }: DestinationsPanelProps) {
  const [destinations, setDestinations] = useState<SavedDestination[]>([])
  // The one destination (if any) currently showing its inline "delete this?"
  // confirmation in place of its normal row.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  if (!open) return null

  return (
    <aside className="destinations-panel" aria-label="Channels and destinations">
      <section>
        <h2>Channels</h2>
        <ul>
          {DUMMY_CHANNELS.map((channel) => (
            <li key={channel.id}>{channel.name}</li>
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
