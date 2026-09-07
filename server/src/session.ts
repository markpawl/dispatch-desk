import { randomBytes } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { getRedisClient } from './redisClient.js'
import { getUser, type User } from './users.js'

// Opaque server-side sessions, not JWTs: a random token in a cookie, resolved
// against Redis on every request. The tradeoff is a Redis read per request,
// bought in exchange for logout that actually invalidates a session
// server-side (a stateless JWT can't be revoked before it expires).
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days
const SESSION_COOKIE = 'session'

function sessionKey(token: string): string {
  return `session:${token}`
}

export async function createSession(userId: string): Promise<string> {
  const redis = getRedisClient()
  if (!redis) {
    throw new Error('[session] REDIS_URL is not set -- nowhere to store sessions')
  }
  const token = randomBytes(32).toString('hex')
  await redis.set(sessionKey(token), userId, 'EX', SESSION_TTL_SECONDS)
  return token
}

export async function destroySession(token: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  await redis.del(sessionKey(token))
}

// Resolves the `session` cookie on a request to its User, or null if there's
// no cookie, no matching (or expired) session, or the user record is gone.
export async function getSessionUser(req: IncomingMessage): Promise<User | null> {
  const token = getSessionCookieToken(req)
  if (!token) return null
  const redis = getRedisClient()
  if (!redis) return null
  const userId = await redis.get(sessionKey(token))
  if (!userId) return null
  return getUser(userId)
}

export function getSessionCookieToken(req: IncomingMessage): string | undefined {
  return parseCookies(req.headers.cookie).get(SESSION_COOKIE)
}

// --- cookie helpers -------------------------------------------------------
// No framework here (same reason readJsonBody in requestHandler.ts is
// hand-rolled), so cookie parsing/serialization is too.

export function parseCookies(header: string | undefined): Map<string, string> {
  const jar = new Map<string, string>()
  if (!header) return jar
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (!name) continue
    jar.set(name, decodeURIComponent(part.slice(eq + 1).trim()))
  }
  return jar
}

export function serializeSessionCookie(token: string, opts: { secure: boolean }): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(opts: { secure: boolean }): string {
  const parts = [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0']
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}
