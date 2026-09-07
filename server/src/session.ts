import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getRedisClient } from './redisClient.js'
import { getUser, type User } from './users.js'

const SESSION_COOKIE = 'session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

function sessionKey(token: string): string {
  return `session:${token}`
}

export async function createSession(userId: string): Promise<string> {
  const redis = getRedisClient()
  if (!redis) throw new Error('[session] REDIS_URL is not set -- nowhere to store sessions')
  const token = randomBytes(32).toString('hex')
  await redis.set(sessionKey(token), userId, 'EX', SESSION_TTL_SECONDS)
  return token
}

export async function destroySession(token: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  await redis.del(sessionKey(token))
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key) cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

export function getSessionToken(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie)
  return cookies[SESSION_COOKIE] ?? null
}

export async function getSessionUser(req: IncomingMessage): Promise<User | null> {
  const token = getSessionToken(req)
  if (!token) return null
  const redis = getRedisClient()
  if (!redis) return null
  const userId = await redis.get(sessionKey(token))
  if (!userId) return null
  return getUser(userId)
}

export function setSessionCookie(res: ServerResponse, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  )
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
}
