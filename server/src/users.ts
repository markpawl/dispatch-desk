import { getRedisClient } from './redisClient.js'

// Redis-backed user records. Keyed by Google's `sub` (a stable per-account
// identifier -- unlike email, which a user can change on Google's side), and
// that same `sub` doubles as our own `id`: it's what sessions, the per-user
// desktop (Group B) and per-user connections (Group C) are all keyed by.
export interface User {
  id: string
  email: string
  name: string
  createdAt: string
}

function userKey(id: string): string {
  return `user:${id}`
}

export async function getUser(id: string): Promise<User | null> {
  const redis = getRedisClient()
  if (!redis) return null
  const raw = await redis.get(userKey(id))
  if (!raw) return null
  return JSON.parse(raw) as User
}

// Upserts by `sub`: a first login creates the record (stamping `createdAt`),
// a later one refreshes `email`/`name` in case they changed on Google's side
// while preserving the original `createdAt`.
export async function upsertUser(profile: {
  sub: string
  email: string
  name: string
}): Promise<User> {
  const redis = getRedisClient()
  if (!redis) {
    throw new Error('[users] REDIS_URL is not set -- nowhere to store user records')
  }
  const existing = await getUser(profile.sub)
  const user: User = existing
    ? { ...existing, email: profile.email, name: profile.name }
    : {
        id: profile.sub,
        email: profile.email,
        name: profile.name,
        createdAt: new Date().toISOString(),
      }
  await redis.set(userKey(user.id), JSON.stringify(user))
  return user
}
