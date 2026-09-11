import { getRedisClient } from './redisClient.js'

function sequenceKey(destinationId: string, localDateKey: string): string {
  return `email-seq:${destinationId}:${localDateKey}`
}

// Auto-expire so a day's counter key doesn't live in Redis forever -- it's
// only ever needed while that day (in whichever timezone the sending
// browser is in) is still "today" or very recently was.
const SEQUENCE_TTL_SECONDS = 36 * 60 * 60 // 36h

// The zero-based sequence number for this destination's Nth email sent on
// `localDateKey` (a "yyyy-mm-dd" string in the sending browser's local
// timezone, not the server's) -- 0 for the first send that day, 1 for the
// second, and so on. Scoped per destination, per day, per
// docs/CURRENT-WORK.md's Group C. Falls back to 0 (no persistence, no
// dedup) if Redis isn't configured, same as the rest of this app's
// degrade-without-Redis behavior.
export async function nextEmailSequenceNumber(
  destinationId: string,
  localDateKey: string,
): Promise<number> {
  const redis = getRedisClient()
  if (!redis) return 0
  const key = sequenceKey(destinationId, localDateKey)
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, SEQUENCE_TTL_SECONDS)
  return count - 1
}
