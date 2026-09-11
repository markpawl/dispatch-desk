import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { destinationLabel, type SavedDestination } from '../lib/destinations'
import { localDateKey, localTimeLabel } from '../lib/localSendTime'

interface FileSummary {
  // For Google Docs this is the doc id; for Dropbox it's the file path.
  ref: string
  name: string
}

// The three shapes /api/send accepts. A saved destination -- of any type,
// email included -- always sends by id; localDate/localTime are read only
// when it resolves to an email destination, but harmless to always include.
type SendBody =
  | { destinationId: string; localDate: string; localTime: string }
  | { docId: string; docName: string }
  | { dropboxPath: string; dropboxName: string }

interface SendMenuProps {
  editor: Editor | null
}

// The "select text -> send to a destination" flow (see docs/REQUIREMENTS.md's
// Send flow). Two provider types so far -- a Google Doc and a Dropbox file,
// both appended to directly rather than through the MCP Host (see
// docs/IDEAS.md's "send-helper plugin structure" idea).
export function SendMenu({ editor }: SendMenuProps) {
  const hasSelection = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? !editor.state.selection.empty : false),
  })

  const [isOpen, setIsOpen] = useState(false)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [dropboxConnected, setDropboxConnected] = useState<boolean | null>(null)
  const [destinations, setDestinations] = useState<SavedDestination[]>([])
  const [googleQuery, setGoogleQuery] = useState('')
  const [googleResults, setGoogleResults] = useState<FileSummary[]>([])
  const [googleSearching, setGoogleSearching] = useState(false)
  const [dropboxQuery, setDropboxQuery] = useState('')
  const [dropboxResults, setDropboxResults] = useState<FileSummary[]>([])
  const [dropboxSearching, setDropboxSearching] = useState(false)
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
      .then((body: { connected: boolean }) => setGoogleConnected(body.connected))
      .catch(() => setGoogleConnected(false))
    fetch('/api/dropbox/status')
      .then((response) => response.json())
      .then((body: { connected: boolean }) => setDropboxConnected(body.connected))
      .catch(() => setDropboxConnected(false))
    fetch('/api/destinations')
      .then((response) => response.json())
      .then((body: { destinations: SavedDestination[] }) => setDestinations(body.destinations))
      .catch(() => setDestinations([]))
  }

  const runGoogleSearch = (nextQuery: string) => {
    setGoogleQuery(nextQuery)
    setGoogleSearching(true)
    fetch(`/api/google-docs/search?q=${encodeURIComponent(nextQuery)}`)
      .then((response) => response.json())
      .then((body: { docs: { id: string; name: string }[] }) =>
        setGoogleResults(body.docs.map((doc) => ({ ref: doc.id, name: doc.name }))),
      )
      .catch(() => setGoogleResults([]))
      .finally(() => setGoogleSearching(false))
  }

  const runDropboxSearch = (nextQuery: string) => {
    setDropboxQuery(nextQuery)
    setDropboxSearching(true)
    fetch(`/api/dropbox/search?q=${encodeURIComponent(nextQuery)}`)
      .then((response) => response.json())
      .then((body: { files: { path: string; name: string }[] }) =>
        setDropboxResults(body.files.map((file) => ({ ref: file.path, name: file.name }))),
      )
      .catch(() => setDropboxResults([]))
      .finally(() => setDropboxSearching(false))
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

  if (!editor) return null

  const checking = googleConnected === null && dropboxConnected === null

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
          {checking && <div className="send-menu-status">Checking connections…</div>}

          {destinations.length > 0 && (
            <ul className="send-menu-destinations">
              {destinations.map((destination) => (
                <li key={destination.id}>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() =>
                      send({
                        destinationId: destination.id,
                        localDate: localDateKey(),
                        localTime: localTimeLabel(),
                      })
                    }
                  >
                    {destinationLabel(destination)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {googleConnected === false && (
            <a className="google-connect" href="/auth/connect/google">
              Connect Google to send
            </a>
          )}
          {googleConnected === true && (
            <>
              <input
                type="text"
                className="send-menu-search"
                placeholder="Search Google Docs…"
                value={googleQuery}
                disabled={sending}
                onChange={(event) => runGoogleSearch(event.target.value)}
              />
              {googleSearching && <div className="send-menu-status">Searching…</div>}
              {!googleSearching && googleQuery && googleResults.length === 0 && (
                <div className="send-menu-status">No matching Docs</div>
              )}
              <ul className="send-menu-results">
                {googleResults.map((doc) => (
                  <li key={doc.ref}>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => send({ docId: doc.ref, docName: doc.name })}
                    >
                      {doc.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {dropboxConnected === false && (
            <a className="google-connect" href="/auth/connect/dropbox">
              Connect Dropbox to send
            </a>
          )}
          {dropboxConnected === true && (
            <>
              <input
                type="text"
                className="send-menu-search"
                placeholder="Search Dropbox files…"
                value={dropboxQuery}
                disabled={sending}
                onChange={(event) => runDropboxSearch(event.target.value)}
              />
              {dropboxSearching && <div className="send-menu-status">Searching…</div>}
              {!dropboxSearching && dropboxQuery && dropboxResults.length === 0 && (
                <div className="send-menu-status">No matching files</div>
              )}
              <ul className="send-menu-results">
                {dropboxResults.map((file) => (
                  <li key={file.ref}>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => send({ dropboxPath: file.ref, dropboxName: file.name })}
                    >
                      {file.name}
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
