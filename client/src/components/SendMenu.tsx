import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { DestinationForm } from './DestinationForm'
import { destinationLabel, type SavedDestination } from '../lib/destinations'
import { localDateKey, localTimeLabel } from '../lib/localSendTime'

// Sends by id -- localDate/localTime are read only when it resolves to an
// email destination, but harmless to always include.
interface SendBody {
  destinationId: string
  localDate: string
  localTime: string
}

interface SendMenuProps {
  editor: Editor | null
}

// The "select text -> send to a destination" flow (see docs/REQUIREMENTS.md's
// Send flow). A plain picker over your saved destinations -- creating one
// (any of the three channels) happens in DestinationsPanel.tsx via
// DestinationForm.tsx, except for the very first one: with none saved yet,
// this opens that same form itself rather than showing an empty list (see
// docs/CURRENT-WORK.md's Group D3).
export function SendMenu({ editor }: SendMenuProps) {
  const hasSelection = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? !editor.state.selection.empty : false),
  })

  const [isOpen, setIsOpen] = useState(false)
  const [destinations, setDestinations] = useState<SavedDestination[]>([])
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  // The destination created in this popover session, if any -- its button
  // reads "Send from <label>" instead of just "<label>" (see
  // docs/CURRENT-WORK.md's Group D3), so it's clear it's ready to send to.
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const openMenu = () => {
    setIsOpen(true)
    setError(null)
    setLoaded(false)
    setCreating(false)
    setNewlyCreatedId(null)
    fetch('/api/destinations')
      .then((response) => response.json())
      .then((body: { destinations: SavedDestination[] }) => {
        setDestinations(body.destinations)
        setCreating(body.destinations.length === 0)
      })
      .catch(() => setDestinations([]))
      .finally(() => setLoaded(true))
  }

  const handleCreated = (destination: SavedDestination) => {
    setDestinations((current) => [...current, destination])
    setNewlyCreatedId(destination.id)
    setCreating(false)
  }

  const send = async (target: SendBody) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, '\n')
    if (!text.trim()) return

    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ...target }),
      })
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(errorBody?.error ?? 'Send failed')
      }
      // The Send flow's default post-send action (see docs/REQUIREMENTS.md):
      // write a log entry (done server-side, above), then delete the sent
      // text from the desktop -- the desktop stays a transient working
      // surface, not an archive.
      editor.chain().focus().deleteSelection().run()
      setIsOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const sendTo = (destination: SavedDestination) =>
    send({
      destinationId: destination.id,
      localDate: localDateKey(),
      localTime: localTimeLabel(),
    })

  if (!editor) return null

  return (
    <div className="send-menu" ref={containerRef}>
      <button
        type="button"
        disabled={!hasSelection}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        title={hasSelection ? 'Send selected text to a destination' : 'Select text first'}
      >
        Send
      </button>
      {isOpen && (
        <div className="send-menu-popover">
          {!loaded && <div className="send-menu-status">Loading destinations…</div>}

          {creating && (
            <DestinationForm
              destinations={destinations}
              onCreated={handleCreated}
              onCancel={() => setIsOpen(false)}
            />
          )}

          {!creating && destinations.length > 0 && (
            <ul className="send-menu-destinations">
              {destinations.map((destination) => (
                <li key={destination.id}>
                  <button type="button" disabled={sending} onClick={() => sendTo(destination)}>
                    {destination.id === newlyCreatedId
                      ? `Send from ${destinationLabel(destination)}`
                      : destinationLabel(destination)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <div className="send-menu-error">{error}</div>}
        </div>
      )}
    </div>
  )
}
