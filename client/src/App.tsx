import { EditorContent, useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { AccountMenu } from './components/AccountMenu'
import { DestinationsPanel } from './components/DestinationsPanel'
import { EditorToolbar } from './components/EditorToolbar'
import type { LinkFollowMenuState } from './components/LinkFollowMenu'
import { LinkFollowMenu } from './components/LinkFollowMenu'
import { LoginDialog } from './components/LoginDialog'
import { SendMenu } from './components/SendMenu'
import { createDesktopDoc } from './lib/desktopDoc'
import { LinkFollowMenu as LinkFollowMenuExtension } from './lib/linkFollowMenu'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface Me {
  id: string
  email: string
  name: string
}

// Set by the Dockerfile's build stage; unset in local dev (see vite-env.d.ts
// and server/src/version.ts).
const buildTimestamp = import.meta.env.VITE_BUILD_TIMESTAMP
  ? new Date(Number(import.meta.env.VITE_BUILD_TIMESTAMP) * 1000)
  : null

// Gates the whole app behind sign-in. `me === undefined` while the initial
// /api/me check is in flight (render nothing rather than flash a screen).
// Signed out, `SignedOut` renders the *same* desktop shell as `Desktop`
// (header, toolbar, editor area) rather than a different screen -- just
// with everything in it disabled/non-interactive except the header's
// "Log In" button (see docs/CURRENT-WORK.md). Its editor is a real Tiptap
// instance for visual parity, but a local, throwaway, non-editable one with
// no Collaboration extension and no WebSocket -- a signed-out visitor still
// never opens a real sync connection.
function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then((response) => response.json())
      .then((body: { user: Me | null }) => {
        if (!cancelled) setMe(body.user)
      })
      .catch((error: unknown) => {
        console.error('failed to check sign-in status', error)
        if (!cancelled) setMe(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (me === undefined) return null
  if (me === null) return <SignedOut />
  return <Desktop user={me} onSignedOut={() => setMe(null)} />
}

function SignedOut() {
  // No Collaboration/fragment -- this editor is never synced anywhere, just
  // rendered non-editable for the same visual shape the real one has.
  const extensions = useMemo(
    () => [StarterKit.configure({ link: { openOnClick: false } }), TextStyle, Color],
    [],
  )
  const editor = useEditor({ extensions, editable: false }, [])

  return (
    <div className="desktop">
      <header className="desktop-header">
        <h1>Dispatch Desktop</h1>
        <div className="desktop-header-status">
          <span className="version" title="When this deployment was built">
            {buildTimestamp ? buildTimestamp.toLocaleString() : 'dev'}
          </span>
          <LoginDialog />
        </div>
      </header>
      <div className="desktop-toolbar-row">
        <EditorToolbar editor={editor} disabled />
        <SendMenu editor={editor} disabled />
      </div>
      <div className="desktop-main">
        <EditorContent className="desktop-editor" editor={editor} />
        <DestinationsPanel editor={editor} disabled />
      </div>
    </div>
  )
}

function Desktop({ user, onSignedOut }: { user: Me; onSignedOut: () => void }) {
  const [{ fragment, provider }] = useState(() => createDesktopDoc())
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  // null while each provider's initial status check is in flight, so the
  // account menu doesn't flash "not connected" before it actually knows.
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [dropboxConnected, setDropboxConnected] = useState<boolean | null>(null)
  // Set by LinkFollowMenuExtension on right-click/long-press over a link;
  // cleared to close the popup. `setLinkMenu`'s identity is stable across
  // renders, so passing it into the memoized `extensions` below doesn't
  // require adding it to that memo's deps.
  const [linkMenu, setLinkMenu] = useState<LinkFollowMenuState | null>(null)

  useEffect(() => {
    let cancelled = false
    const probe = (path: string, set: (connected: boolean) => void) => {
      fetch(path)
        .then((response) => response.json())
        .then((body: { connected: boolean }) => {
          if (!cancelled) set(body.connected)
        })
        .catch((error: unknown) => {
          console.error(`failed to check connection status: ${path}`, error)
        })
    }
    probe('/api/google/status', setGoogleConnected)
    probe('/api/dropbox/status', setDropboxConnected)
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
        <h1>Dispatch Desktop</h1>
        <div className="desktop-header-status">
          <span className="version" title="When this deployment was built">
            {buildTimestamp ? buildTimestamp.toLocaleString() : 'dev'}
          </span>
          <span className={`status status-${status}`}>{status}</span>
          <AccountMenu
            user={user}
            googleConnected={googleConnected}
            dropboxConnected={dropboxConnected}
            onDisconnected={(provider) =>
              (provider === 'google' ? setGoogleConnected : setDropboxConnected)(false)
            }
            onSignedOut={onSignedOut}
          />
        </div>
      </header>
      <div className="desktop-toolbar-row">
        <EditorToolbar editor={editor} />
        <SendMenu editor={editor} />
      </div>
      <div className="desktop-main">
        <EditorContent className="desktop-editor" editor={editor} />
        <DestinationsPanel editor={editor} />
      </div>
      <LinkFollowMenu state={linkMenu} onClose={() => setLinkMenu(null)} />
    </div>
  )
}

export default App
