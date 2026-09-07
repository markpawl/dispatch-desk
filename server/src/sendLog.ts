import { getRedisClient } from './redisClient.js'

// One send log per signed-in user.
function sendLogKey(userId: string): string {
  return `send-log:${userId}`
}
// Unbounded growth isn't acceptable for a key meant to live in Redis
// indefinitely -- trimmed to the most recent N sends after every write.
const MAX_ENTRIES = 200
const PREVIEW_LENGTH = 100

export interface SendLogEntry {
  timestamp: string
  destinationId: string
  docName: string
  textPreview: string
}

export function truncateForPreview(text: string): string {
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text
}

export async function appendSendLogEntry(
  userId: string,
  entry: Omit<SendLogEntry, 'timestamp'>,
): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  const full: SendLogEntry = { ...entry, timestamp: new Date().toISOString() }
  const key = sendLogKey(userId)
  await redis.rpush(key, JSON.stringify(full))
  await redis.ltrim(key, -MAX_ENTRIES, -1)
}
