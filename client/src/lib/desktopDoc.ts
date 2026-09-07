import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

// A fixed name in the WebSocket URL. The Sync Server ignores it -- it routes
// each connection to a desktop by the authenticated user behind the session
// cookie (see server/src/syncServer.ts), not by anything the client sends --
// so this stays constant; there are no multiple/named desktops per user.
const ROOM_NAME = 'desktop'

// Same origin in production (the Sync Server serves the built client and the
// /sync WebSocket from one Fly.io app); in dev, Vite's proxy (vite.config.ts)
// forwards /sync to the standalone Sync Server.
function syncServerUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/sync`
}

export interface DesktopDoc {
  doc: Y.Doc
  fragment: Y.XmlFragment
  provider: WebsocketProvider
}

// Creates a fresh Yjs doc wired to the Sync Server over WebSocket. Call once
// per app instance (see main.tsx) -- each of the signed-in user's open
// browsers gets its own replica that the provider keeps merged with that
// user's other replicas via the CRDT (one private desktop per user).
//
// The desktop's content lives in a Y.XmlFragment (rich text -- see
// docs/REQUIREMENTS.md's Editor section), which Tiptap's Collaboration
// extension binds to directly, rather than the plain Y.Text used before rich
// formatting existed.
export function createDesktopDoc(): DesktopDoc {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(ROOM_NAME)
  const provider = new WebsocketProvider(syncServerUrl(), ROOM_NAME, doc)
  return { doc, fragment, provider }
}
