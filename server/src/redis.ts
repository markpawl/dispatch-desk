import { getRedisClient } from './redisClient.js'

// Each signed-in user has their own private desktop (see
// docs/REQUIREMENTS.md's Auth/Identity section), persisted under its own key.
function desktopStateKey(userId: string): string {
  return `desktop:state:${userId}`
}

// A real Redis connection is binary-safe over the wire, unlike Upstash's
// JSON-based REST API (which needed base64) -- Yjs state stores and loads
// as a plain Buffer.
export async function loadDesktopState(userId: string): Promise<Uint8Array | null> {
  const redis = getRedisClient()
  if (!redis) return null
  const buffer = await redis.getBuffer(desktopStateKey(userId))
  if (!buffer) return null
  return new Uint8Array(buffer)
}

export async function persistDesktopState(userId: string, state: Uint8Array): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  await redis.set(desktopStateKey(userId), Buffer.from(state))
}
