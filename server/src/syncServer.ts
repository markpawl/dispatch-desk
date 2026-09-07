import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { WebSocketServer, type WebSocket } from 'ws'
import * as Y from 'yjs'
import { loadDesktopState, persistDesktopState } from './redis.js'
import { getSessionUser } from './session.js'

// Wire message types, matching the same convention y-websocket's own
// reference server/client use (so the client's off-the-shelf
// `WebsocketProvider` interoperates with this hand-rolled server).
const messageSync = 0
const messageAwareness = 1

// One live desktop per signed-in user (see docs/REQUIREMENTS.md's
// Auth/Identity section: each person gets their own private desktop, not one
// global shared document). A Desktop is the in-memory triple the server holds
// so that user's open browsers stay in sync: their CRDT doc, their current
// connections, and the pending debounced "write to Redis" timer.
interface Desktop {
  doc: Y.Doc
  clients: Set<WebSocket>
  persistTimer: ReturnType<typeof setTimeout> | undefined
}

// Keyed by userId. Holds a *promise* so two near-simultaneous first
// connections from the same user share one creation (and one Redis load)
// rather than racing to build two docs. Desktops are kept for the process
// lifetime -- for an invite-only app that's a handful of small docs;
// evicting an idle desktop from memory is a future optimization.
const desktops = new Map<string, Promise<Desktop>>()

const wss = new WebSocketServer({ noServer: true })

const PERSIST_DEBOUNCE_MS = 2000

function schedulePersist(desktop: Desktop, userId: string) {
  if (desktop.persistTimer) return
  desktop.persistTimer = setTimeout(() => {
    desktop.persistTimer = undefined
    persistDesktopState(userId, Y.encodeStateAsUpdate(desktop.doc)).catch((error: unknown) => {
      console.error(`[sync] failed to persist desktop state for ${userId}`, error)
    })
  }, PERSIST_DEBOUNCE_MS)
}

// Writes immediately instead of waiting out the debounce -- used when a
// desktop's last connection drops, so an edit made just before closing the
// tab isn't lost to a timer that never fires.
function flushPersist(desktop: Desktop, userId: string) {
  if (!desktop.persistTimer) return
  clearTimeout(desktop.persistTimer)
  desktop.persistTimer = undefined
  persistDesktopState(userId, Y.encodeStateAsUpdate(desktop.doc)).catch((error: unknown) => {
    console.error(`[sync] failed to flush desktop state for ${userId}`, error)
  })
}

async function createDesktop(userId: string): Promise<Desktop> {
  const doc = new Y.Doc()
  const state = await loadDesktopState(userId)
  if (state) Y.applyUpdate(doc, state, 'redis-load')

  const desktop: Desktop = { doc, clients: new Set(), persistTimer: undefined }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    schedulePersist(desktop, userId)
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeUpdate(encoder, update)
    const message = encoding.toUint8Array(encoder)
    for (const client of desktop.clients) {
      // Don't echo the update back to whichever connection sent it, and only
      // to this user's own connections -- never another user's desktop.
      if (client !== origin && client.readyState === client.OPEN) {
        client.send(message)
      }
    }
  })

  return desktop
}

function getDesktop(userId: string): Promise<Desktop> {
  let desktop = desktops.get(userId)
  if (!desktop) {
    desktop = createDesktop(userId)
    desktops.set(userId, desktop)
    // Don't leave a rejected promise cached (e.g. a transient Redis error on
    // the initial load) -- evict it so the next connection retries cleanly.
    // The rejection still propagates to this call's awaiter.
    desktop.catch(() => {
      if (desktops.get(userId) === desktop) desktops.delete(userId)
    })
  }
  return desktop
}

function send(ws: WebSocket, message: Uint8Array) {
  if (ws.readyState !== ws.OPEN) return
  try {
    ws.send(message)
  } catch (error) {
    console.error('[sync] failed to send to a client', error)
  }
}

function setupConnection(ws: WebSocket, desktop: Desktop, userId: string) {
  ws.binaryType = 'arraybuffer'
  desktop.clients.add(ws)

  // Greet the new client: send our current state and ask for theirs, per
  // the standard Yjs sync handshake (sync step 1).
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, desktop.doc)
  send(ws, encoding.toUint8Array(encoder))

  ws.on('message', (data: ArrayBuffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(data))
    const messageType = decoding.readVarUint(decoder)
    switch (messageType) {
      case messageSync: {
        const replyEncoder = encoding.createEncoder()
        encoding.writeVarUint(replyEncoder, messageSync)
        // Applies any incoming update to this desktop's doc (tagged with `ws`
        // as the transaction origin, so the broadcast above skips echoing it
        // back here) and, for a sync-step-1 request, writes our state as a
        // reply.
        syncProtocol.readSyncMessage(decoder, replyEncoder, desktop.doc, ws)
        if (encoding.length(replyEncoder) > 1) send(ws, encoding.toUint8Array(replyEncoder))
        break
      }
      case messageAwareness:
        // Presence/cursors aren't a requirement yet (see docs/IDEAS.md) --
        // acknowledge and ignore rather than error on an unknown type.
        break
      default:
        console.warn(`[sync] unknown message type ${messageType}`)
    }
  })

  ws.on('close', () => {
    desktop.clients.delete(ws)
    if (desktop.clients.size === 0) flushPersist(desktop, userId)
  })

  ws.on('error', (error) => {
    console.error('[sync] connection error', error)
  })
}

// Authenticates the connecting user from their `session` cookie (browsers
// send it on the WebSocket handshake automatically) *before* completing the
// upgrade, then routes them into their own desktop. An unauthenticated
// handshake is refused outright -- no anonymous access to any desktop.
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  void authenticateAndUpgrade(req, socket, head).catch((error: unknown) => {
    console.error('[sync] upgrade failed', error)
    socket.destroy()
  })
}

async function authenticateAndUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const user = await getSessionUser(req)
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  const desktop = await getDesktop(user.id)
  wss.handleUpgrade(req, socket, head, (ws) => {
    setupConnection(ws, desktop, user.id)
  })
}

// Kept for index.ts's startup sequence. There's nothing to preload now --
// each user's desktop loads from Redis lazily on their first connection
// (see createDesktop) rather than one global doc at boot.
export function waitUntilReady(): Promise<void> {
  return Promise.resolve()
}
