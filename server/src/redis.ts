import { getRedisClient } from './redisClient.js'

// The single shared desktop's CRDT state lives under one fixed key (see
// docs/REQUIREMENTS.md: one document, no multiple/named desktops for now).
const DESKTOP_STATE_KEY = 'desktop:state'

// A real Redis connection is binary-safe over the wire, unlike Upstash's
// JSON-based REST API (which needed base64) -- Yjs state stores and loads
// as a plain Buffer.
export async function loadDesktopState(): Promise<Uint8Array | null> {
  const redis = getRedisClient()
  if (!redis) return null
  const buffer = await redis.getBuffer(DESKTOP_STATE_KEY)
  if (!buffer) return null
  return new Uint8Array(buffer)
}

export async function persistDesktopState(state: Uint8Array): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  await redis.set(DESKTOP_STATE_KEY, Buffer.from(state))
}
