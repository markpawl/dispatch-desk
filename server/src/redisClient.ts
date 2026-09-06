import { Redis } from 'ioredis'

// Shared across every module that needs Redis (desktop-state persistence,
// Google OAuth tokens, the destinations registry, the send log) -- one
// connection, one "not configured" warning, not one per module.
let client: Redis | undefined
let warned = false

export function getRedisClient(): Redis | undefined {
  if (client) return client
  if (!process.env.REDIS_URL) {
    if (!warned) {
      console.warn(
        '[redis] REDIS_URL not set -- running with no persistence (desktop content will not ' +
          'survive a restart, and Google-related features that need it will error).',
      )
      warned = true
    }
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
