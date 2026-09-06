import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

interface GoogleDocSummary {
  id: string
  name: string
}

interface SavedDestination {
  id: string
  type: 'google-doc'
  docId: string
  docName: string
  createdAt: string
}

interface SendMenuProps {
  editor: Editor | null
}

// The "select text -> send to a destination" flow (see docs/REQUIREMENTS.md's
// Send flow). Only one destination type exists yet (a Google Doc, appended
// to directly rather than through the MCP Host -- see docs/IDEAS.md's
// Pending item 1), so this is deliberately not a generic destination-type
// picker.
export function SendMenu({ editor }: SendMenuProps) {
  const hasSelection = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? !editor.state.selection.empty : false),
  })

  const [isOpen, setIsOpen] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [destinations, setDestinations] = useState<SavedDestination[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GoogleDocSummary[]>([])
  const [searching, setSearching] = useState(false)
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
    fetch('/api/google/status')
      .then((response) => response.json())
      .then((body: { connected: boolean }) => setConnected(body.connected))
      .catch(() => setConnected(false))
    fetch('/api/destinations')
      .then((response) => response.json())
      .then((body: { destinations: SavedDestination[] }) => setDestinations(body.destinations))
      .catch(() => setDestinations([]))
  }

  const runSearch = (nextQuery: string) => {
    setQuery(nextQuery)
    setSearching(true)
    fetch(`/api/google-docs/search?q=${encodeURIComponent(nextQuery)}`)
      .then((response) => response.json())
      .then((body: { docs: GoogleDocSummary[] }) => setResults(body.docs))
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }

  const send = async (docId: string, docName: string) => {
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
        body: JSON.stringify({ text, docId, docName }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Send failed')
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
          {connected === null && <div className="send-menu-status">Checking Google connection…</div>}
          {connected === false && (
            <a className="google-connect" href="/auth/google">
              Connect Google to send
            </a>
          )}
          {connected === true && (
            <>
              {destinations.length > 0 && (
                <ul className="send-menu-destinations">
                  {destinations.map((destination) => (
                    <li key={destination.id}>
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => send(destination.docId, destination.docName)}
                      >
                        {destination.docName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                type="text"
                className="send-menu-search"
                placeholder="Search Google Docs…"
                value={query}
                disabled={sending}
                onChange={(event) => runSearch(event.target.value)}
              />
              {searching && <div className="send-menu-status">Searching…</div>}
              {!searching && query && results.length === 0 && (
                <div className="send-menu-status">No matching Docs</div>
              )}
              <ul className="send-menu-results">
                {results.map((doc) => (
                  <li key={doc.id}>
                    <button type="button" disabled={sending} onClick={() => send(doc.id, doc.name)}>
                      {doc.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && <div className="send-menu-error">{error}</div>}
        </div>
      )}
    </div>
  )
}
