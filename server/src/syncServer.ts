import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { WebSocketServer, type WebSocket } from 'ws'
import * as Y from 'yjs'
import { loadDesktopState, persistDesktopState } from './redis.js'

// Wire message types, matching the same convention y-websocket's own
// reference server/client use (so the client's off-the-shelf
// `WebsocketProvider` interoperates with this hand-rolled server).
const messageSync = 0
const messageAwareness = 1

// The single shared desktop (see docs/REQUIREMENTS.md: one document, no
// multiple/named desktops for now) -- every connection, regardless of the
// room name in its URL, joins this one doc.
const doc = new Y.Doc()

const wss = new WebSocketServer({ noServer: true })

const PERSIST_DEBOUNCE_MS = 2000
let persistTimer: ReturnType<typeof setTimeout> | undefined

function schedulePersist() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = undefined
    persistDesktopState(Y.encodeStateAsUpdate(doc)).catch((error: unknown) => {
      console.error('[sync] failed to persist desktop state', error)
    })
  }, PERSIST_DEBOUNCE_MS)
}

doc.on('update', (update: Uint8Array, origin: unknown) => {
  schedulePersist()
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeUpdate(encoder, update)
  const message = encoding.toUint8Array(encoder)
  for (const client of wss.clients) {
    // Don't echo the update back to whichever connection sent it.
    if (client !== origin && client.readyState === client.OPEN) {
      client.send(message)
    }
  }
})

const ready: Promise<void> = loadDesktopState().then((state) => {
  if (state) Y.applyUpdate(doc, state, 'redis-load')
})

function send(ws: WebSocket, message: Uint8Array) {
  if (ws.readyState !== ws.OPEN) return
  try {
    ws.send(message)
  } catch (error) {
    console.error('[sync] failed to send to a client', error)
  }
}

function setupConnection(ws: WebSocket) {
  ws.binaryType = 'arraybuffer'

  // Greet the new client: send our current state and ask for theirs, per
  // the standard Yjs sync handshake (sync step 1).
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, doc)
  send(ws, encoding.toUint8Array(encoder))

  ws.on('message', (data: ArrayBuffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(data))
    const messageType = decoding.readVarUint(decoder)
    switch (messageType) {
      case messageSync: {
        const replyEncoder = encoding.createEncoder()
        encoding.writeVarUint(replyEncoder, messageSync)
        // Applies any incoming update to `doc` (tagged with `ws` as the
        // transaction origin, so the broadcast above skips echoing it back
        // here) and, for a sync-step-1 request, writes our state as a reply.
        syncProtocol.readSyncMessage(decoder, replyEncoder, doc, ws)
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

  ws.on('error', (error) => {
    console.error('[sync] connection error', error)
  })
}

wss.on('connection', (ws) => setupConnection(ws))

export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
}

// Awaited once at startup so the server doesn't accept connections against
// an empty doc while a persisted snapshot is still loading from Redis.
export async function waitUntilReady(): Promise<void> {
  await ready
}
