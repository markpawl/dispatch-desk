import { EditorContent, useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { DestinationsPanel } from './components/DestinationsPanel'
import { EditorToolbar } from './components/EditorToolbar'
import type { LinkFollowMenuState } from './components/LinkFollowMenu'
import { LinkFollowMenu } from './components/LinkFollowMenu'
import { SendMenu } from './components/SendMenu'
import { createDesktopDoc } from './lib/desktopDoc'
import { LinkFollowMenu as LinkFollowMenuExtension } from './lib/linkFollowMenu'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

// Set by the Dockerfile's build stage; unset in local dev (see vite-env.d.ts
// and server/src/version.ts).
const buildTimestamp = import.meta.env.VITE_BUILD_TIMESTAMP
  ? new Date(Number(import.meta.env.VITE_BUILD_TIMESTAMP) * 1000)
  : null

function App() {
  const [{ fragment, provider }] = useState(() => createDesktopDoc())
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  // null while the initial /api/google/status check is in flight, so the
  // indicator doesn't flash "not connected" before it actually knows.
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  // Set by LinkFollowMenuExtension on right-click/long-press over a link;
  // cleared to close the popup. `setLinkMenu`'s identity is stable across
  // renders, so passing it into the memoized `extensions` below doesn't
  // require adding it to that memo's deps.
  const [linkMenu, setLinkMenu] = useState<LinkFollowMenuState | null>(null)
  // Toggles the right-side channels/destinations panel (docs/IDEAS.md's
  // Pending item 1) -- closed by default, same as the Destination sidebar
  // it extends (docs/REQUIREMENTS.md).
  const [destinationsPanelOpen, setDestinationsPanelOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/google/status')
      .then((response) => response.json())
      .then((body: { connected: boolean }) => {
        if (!cancelled) setGoogleConnected(body.connected)
      })
      .catch((error: unknown) => {
        console.error('failed to check Google connection status', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Memoized (and pinned to `fragment` via useEditor's deps below) so this
  // array -- and the extension instances in it -- keeps the same identity
  // across re-renders. Without that, useEditor's default (no deps) path
  // re-diffs `extensions` by reference on every render of App and, seeing a
  // "different" array each time (StarterKit.configure/Collaboration.configure
  // return fresh objects), calls editor.setOptions() to reconcile -- which
  // reinitializes the Yjs Collaboration binding. Harmless-looking locally
  // (status barely changes over a stable loopback connection), but on a real
  // network the WebSocket status flickers far more often, each flicker
  // re-renders App, and each of those resets mid-keystroke -- the typed
  // character disappears as fast as it was typed.
  const extensions = useMemo(
    () => [
      // Undo/redo comes from Collaboration's own Yjs-aware history instead,
      // so the two don't fight over the same keyboard shortcuts/state.
      // Underline and Link are already bundled in StarterKit (Tiptap v3) --
      // only Link's default (open-on-click, wrong for an editable surface)
      // needs overriding.
      StarterKit.configure({ undoRedo: false, link: { openOnClick: false } }),
      Collaboration.configure({ fragment }),
      TextStyle,
      Color,
      LinkFollowMenuExtension.configure({
        onRequestMenu: (href, x, y) => setLinkMenu({ href, x, y }),
      }),
    ],
    [fragment],
  )

  const editor = useEditor({ extensions, autofocus: true }, [fragment])

  useEffect(() => {
    const onStatus = ({ status }: { status: ConnectionStatus }) => setStatus(status)
    provider.on('status', onStatus)
    return () => {
      provider.off('status', onStatus)
      provider.destroy()
    }
  }, [provider])

  return (
    <div className="desktop">
      <header className="desktop-header">
        <h1>Dispatch Desk</h1>
        <div className="desktop-header-status">
          <span className="version" title="When this deployment was built">
            {buildTimestamp ? buildTimestamp.toLocaleString() : 'dev'}
          </span>
          {googleConnected === false && (
            <a className="google-connect" href="/auth/google">
              Connect Google
            </a>
          )}
          {googleConnected === true && <span className="google-connected">Google connected</span>}
          <span className={`status status-${status}`}>{status}</span>
        </div>
      </header>
      <div className="desktop-toolbar-row">
        <EditorToolbar editor={editor} />
        <SendMenu editor={editor} />
        <button
          type="button"
          className={destinationsPanelOpen ? 'destinations-toggle active' : 'destinations-toggle'}
          onClick={() => setDestinationsPanelOpen((open) => !open)}
          title="Toggle channels & destinations"
        >
          Destinations
        </button>
      </div>
      <div className="desktop-main">
        <EditorContent className="desktop-editor" editor={editor} />
        <DestinationsPanel open={destinationsPanelOpen} />
      </div>
      <LinkFollowMenu state={linkMenu} onClose={() => setLinkMenu(null)} />
    </div>
  )
}

export default App
