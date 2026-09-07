import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

type MockUser = { id: string; email: string; name: string }

const { users } = vi.hoisted(() => ({
  users: {
    'session=alice': { id: 'alice', email: 'alice@example.com', name: 'Alice' },
    'session=bob': { id: 'bob', email: 'bob@example.com', name: 'Bob' },
  } as Record<string, MockUser | undefined>,
}))

// Resolve the connecting user straight from the Cookie header the test sets
// on each client -- stands in for the real Redis-backed session lookup.
vi.mock('./session.js', () => ({
  getSessionUser: vi.fn(async (req: { headers: { cookie?: string } }) => {
    return users[req.headers.cookie ?? ''] ?? null
  }),
}))

// Fresh, empty desktops; persistence is a no-op we don't assert on here.
vi.mock('./redis.js', () => ({
  loadDesktopState: vi.fn(async () => null),
  persistDesktopState: vi.fn(async () => undefined),
}))

const { handleUpgrade } = await import('./syncServer.js')

const messageSync = 0

// A minimal Yjs-over-WebSocket client mirroring the server's own protocol
// handling (sync step 1 on open, apply incoming updates, forward local ones)
// -- enough to exercise the handshake and cross-connection propagation
// without pulling in y-websocket's provider.
function connectClient(port: number, cookie: string) {
  const doc = new Y.Doc()
  const ws = new WebSocket(`ws://127.0.0.1:${port}/sync`, { headers: { cookie } })
  ws.binaryType = 'arraybuffer'

  ws.on('open', () => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeSyncStep1(encoder, doc)
    ws.send(encoding.toUint8Array(encoder))
  })

  ws.on('message', (data: ArrayBuffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(data))
    if (decoding.readVarUint(decoder) !== messageSync) return
    const replyEncoder = encoding.createEncoder()
    encoding.writeVarUint(replyEncoder, messageSync)
    syncProtocol.readSyncMessage(decoder, replyEncoder, doc, 'remote')
    if (encoding.length(replyEncoder) > 1) ws.send(encoding.toUint8Array(replyEncoder))
  })

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeUpdate(encoder, update)
    ws.send(encoding.toUint8Array(encoder))
  })

  return { doc, ws }
}

function text(client: { doc: Y.Doc }): string {
  return client.doc.getText('t').toString()
}

function waitFor(condition: () => boolean, timeout = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (condition()) return resolve()
      if (Date.now() - started > timeout) return reject(new Error('waitFor timed out'))
      setTimeout(tick, 10)
    }
    tick()
  })
}

function opened(client: { ws: WebSocket }): Promise<void> {
  return new Promise((resolve, reject) => {
    client.ws.on('open', () => resolve())
    client.ws.on('error', reject)
  })
}

describe('syncServer', () => {
  let server: Server
  let port: number
  const sockets: WebSocket[] = []

  beforeAll(async () => {
    server = createServer()
    server.on('upgrade', (req, socket, head) => handleUpgrade(req, socket, head))
    await new Promise<void>((resolve) => server.listen(0, resolve))
    port = (server.address() as AddressInfo).port
  })

  afterEach(() => {
    for (const ws of sockets.splice(0)) ws.close()
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('refuses the upgrade when the handshake carries no valid session', async () => {
    const client = connectClient(port, 'session=nobody')
    sockets.push(client.ws)

    const outcome = await new Promise<string>((resolve) => {
      client.ws.on('open', () => resolve('open'))
      client.ws.on('unexpected-response', () => resolve('unexpected-response'))
      client.ws.on('error', () => resolve('error'))
    })

    expect(outcome).not.toBe('open')
  })

  it('syncs a user across their own connections but never into another user\'s desktop', async () => {
    const alice1 = connectClient(port, 'session=alice')
    const alice2 = connectClient(port, 'session=alice')
    const bob = connectClient(port, 'session=bob')
    sockets.push(alice1.ws, alice2.ws, bob.ws)
    await Promise.all([opened(alice1), opened(alice2), opened(bob)])

    alice1.doc.getText('t').insert(0, 'from-alice')
    await waitFor(() => text(alice2) === 'from-alice')

    // Alice's edit reached her other tab, not Bob's desktop.
    expect(text(bob)).toBe('')

    bob.doc.getText('t').insert(0, 'from-bob')
    await waitFor(() => text(bob) === 'from-bob')
    // Give any errant cross-desktop broadcast time to (not) show up.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(text(alice1)).toBe('from-alice')
    expect(text(alice2)).toBe('from-alice')
  })
})
