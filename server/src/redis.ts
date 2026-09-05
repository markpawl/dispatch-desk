import { Redis } from '@upstash/redis'

// The single shared desktop's CRDT state lives under one fixed key (see
// docs/REQUIREMENTS.md: one document, no multiple/named desktops for now).
const DESKTOP_STATE_KEY = 'desktop:state'

let client: Redis | undefined

function getClient(): Redis | undefined {
  if (client) return client
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn(
      '[redis] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set -- running with no ' +
        'persistence (desktop content will not survive a restart).',
    )
    return undefined
  }
  client = Redis.fromEnv()
  return client
}

// Yjs state is binary; Upstash's REST API is JSON-based, so it's stored as
// base64 rather than raw bytes.
export async function loadDesktopState(): Promise<Uint8Array | null> {
  const redis = getClient()
  if (!redis) return null
  const encoded = await redis.get<string>(DESKTOP_STATE_KEY)
  if (!encoded) return null
  return new Uint8Array(Buffer.from(encoded, 'base64'))
}

export async function persistDesktopState(state: Uint8Array): Promise<void> {
  const redis = getClient()
  if (!redis) return
  await redis.set(DESKTOP_STATE_KEY, Buffer.from(state).toString('base64'))
}
