import { Redis } from 'ioredis'

// The single shared desktop's CRDT state lives under one fixed key (see
// docs/REQUIREMENTS.md: one document, no multiple/named desktops for now).
const DESKTOP_STATE_KEY = 'desktop:state'

let client: Redis | undefined

function getClient(): Redis | undefined {
  if (client) return client
  if (!process.env.REDIS_URL) {
    console.warn(
      '[redis] REDIS_URL not set -- running with no persistence (desktop content will not ' +
        'survive a restart).',
    )
    return undefined
  }
  client = new Redis(process.env.REDIS_URL)
  // Without a listener, ioredis's own retry/reconnect errors are unhandled
  // EventEmitter errors and crash the process; log instead -- a transient
  // connection blip shouldn't take down the Sync Server.
  client.on('error', (error: Error) => {
    console.error('[redis] connection error', error)
  })
  return client
}

// A real Redis connection is binary-safe over the wire, unlike Upstash's
// JSON-based REST API (which needed base64) -- Yjs state stores and loads
// as a plain Buffer.
export async function loadDesktopState(): Promise<Uint8Array | null> {
  const redis = getClient()
  if (!redis) return null
  const buffer = await redis.getBuffer(DESKTOP_STATE_KEY)
  if (!buffer) return null
  return new Uint8Array(buffer)
}

export async function persistDesktopState(state: Uint8Array): Promise<void> {
  const redis = getClient()
  if (!redis) return
  await redis.set(DESKTOP_STATE_KEY, Buffer.from(state))
}
