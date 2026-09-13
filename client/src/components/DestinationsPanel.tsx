import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { type DestinationChannel, DestinationForm } from './DestinationForm'
import {
  destinationDescription,
  destinationLabel,
  sendErrorMessage,
  type SavedDestination,
} from '../lib/destinations'
import { sendSelectionToDestination } from '../lib/sendToDestination'

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
  // Lets a destination row send the current selection directly (see
  // docs/CURRENT-WORK.md's "Send-from-sidebar" plan) -- null in contexts
  // with no real editor (there are none today, but mirrors EditorToolbar/
  // SendMenu's own `editor: Editor | null` prop for consistency).
  editor: Editor | null
  // Signed out (App.tsx): no point fetching (the API requires a session
  // anyway), and nothing in the panel should be clickable -- see
  // docs/CURRENT-WORK.md's "sidebar always visible" plan.
  disabled?: boolean
}

// The right-side panel from docs/REQUIREMENTS.md's Destination sidebar flow,
// always visible (not a toggle) showing two lists -- channels (clicking one
// opens DestinationForm.tsx to create a destination of that type, per
// docs/CURRENT-WORK.md's Group D2) and destinations (the real, saved
// instances, deletable here per Group A, and sendable directly here per the
// Send-from-sidebar plan -- a destination row is enabled only with an
// active text selection, mirroring SendMenu.tsx's Send button).
export function DestinationsPanel({ editor, disabled = false }: DestinationsPanelProps) {
  const hasSelection = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? !editor.state.selection.empty : false),
  })

  const [destinations, setDestinations] = useState<SavedDestination[]>([])
  // The one destination (if any) currently showing its inline "delete this?"
  // confirmation in place of its normal row.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formChannel, setFormChannel] = useState<DestinationChannel | null>(null)
  // The destination (if any) a just-opened form should template itself from
  // -- set when the "create like this one?" confirm below is accepted.
  const [templateSourceId, setTemplateSourceId] = useState<string | null>(null)
  // The one destination (if any) currently showing its inline "create a new
  // destination like this one?" confirmation -- offered when its row is
  // clicked with no text selected (docs/IDEAS.md's Pending item 11).
  const [templatingId, setTemplatingId] = useState<string | null>(null)

  useEffect(() => {
    if (disabled) return
    fetch('/api/destinations')
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load destinations')
        return response.json() as Promise<{ destinations: SavedDestination[] }>
      })
      .then((body) => {
        setDestinations(body.destinations)
        setError(null)
      })
      .catch(() => setError('Failed to load destinations'))
  }, [disabled])

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
    setTemplateSourceId(null)
  }

  const cancelForm = () => {
    setFormChannel(null)
    setTemplateSourceId(null)
  }

  const sendTo = async (destination: SavedDestination) => {
    if (!editor) return
    setSendingId(destination.id)
    setError(null)
    const result = await sendSelectionToDestination(editor, destination.id)
    if (!result.ok) setError(sendErrorMessage(result.error, destination))
    setSendingId(null)
  }

  // A row click either sends (selection present) or offers to template a
  // new destination from it (no selection) -- see docs/IDEAS.md's Pending
  // item 11.
  const handleRowClick = (destination: SavedDestination) => {
    if (hasSelection) {
      sendTo(destination)
    } else {
      setConfirmingId(null)
      setTemplatingId(destination.id)
    }
  }

  const startTemplate = (destination: SavedDestination) => {
    setTemplatingId(null)
    setTemplateSourceId(destination.id)
    setFormChannel(destination.type)
  }

  if (formChannel) {
    return (
      <aside className="destinations-panel" aria-label="Create a destination">
        <h2>New {CHANNELS.find((channel) => channel.id === formChannel)?.name} destination</h2>
        <DestinationForm
          destinations={destinations}
          initialChannel={formChannel}
          initialTemplateId={templateSourceId ?? undefined}
          onCreated={handleCreated}
          onCancel={cancelForm}
        />
      </aside>
    )
  }

  return (
    <aside className="destinations-panel" aria-label="Channels and destinations">
      <section>
        <h2>Channels</h2>
        <ul className="destinations-panel-channels">
          {CHANNELS.map((channel) => (
            <li key={channel.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setFormChannel(channel.id)}
              >
                {channel.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Destinations</h2>
        {destinations.length === 0 && <div className="destinations-panel-empty">None yet</div>}
        <ul className="destinations-panel-destinations">
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
            ) : templatingId === destination.id ? (
              <li key={destination.id} className="destinations-panel-confirm">
                <span>Create a new destination like "{destinationLabel(destination)}"?</span>
                <div className="destinations-panel-confirm-actions">
                  <button type="button" onClick={() => startTemplate(destination)}>
                    Create
                  </button>
                  <button type="button" onClick={() => setTemplatingId(null)}>
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={destination.id}>
                <button
                  type="button"
                  disabled={disabled || sendingId === destination.id}
                  title={`${destinationDescription(destination)} — ${
                    hasSelection
                      ? 'send the selected text here'
                      : 'click to create a new destination like this one'
                  }`}
                  onClick={() => handleRowClick(destination)}
                >
                  {destinationLabel(destination)}
                </button>
                <button
                  type="button"
                  className="destinations-panel-delete"
                  aria-label={`Delete ${destinationLabel(destination)}`}
                  onClick={() => {
                    setTemplatingId(null)
                    setConfirmingId(destination.id)
                  }}
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
