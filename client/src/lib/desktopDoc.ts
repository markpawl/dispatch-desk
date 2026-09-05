import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

// The single shared desktop (see docs/REQUIREMENTS.md: one document, no
// multiple/named desktops for now) -- "desktop" is a fixed room name, not a
// per-user or per-session identifier.
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
// per app instance (see main.tsx) -- every open browser gets its own replica
// that the provider keeps merged with everyone else's via the CRDT.
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
