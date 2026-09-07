import { getRedisClient } from './redisClient.js'

export interface User {
  id: string // Google's `sub` -- stable per Google account, unlike email
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

// Upserts by id (Google's `sub`) -- refreshes email/name in case they
// changed at Google's end, but keeps the original createdAt.
export async function upsertUser(profile: { id: string; email: string; name: string }): Promise<User> {
  const redis = getRedisClient()
  if (!redis) {
    throw new Error('[users] REDIS_URL is not set -- nowhere to store user records')
  }
  const existing = await getUser(profile.id)
  const user: User = {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  await redis.set(userKey(profile.id), JSON.stringify(user))
  return user
}
