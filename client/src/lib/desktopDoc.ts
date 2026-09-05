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
  text: Y.Text
  provider: WebsocketProvider
}

// Creates a fresh Yjs doc wired to the Sync Server over WebSocket. Call once
// per app instance (see main.tsx) -- every open browser gets its own replica
// that the provider keeps merged with everyone else's via the CRDT.
export function createDesktopDoc(): DesktopDoc {
  const doc = new Y.Doc()
  const text = doc.getText(ROOM_NAME)
  const provider = new WebsocketProvider(syncServerUrl(), ROOM_NAME, doc)
  return { doc, text, provider }
}
