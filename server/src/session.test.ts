import type { IncomingMessage } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory Redis good enough for the get/set/del this module uses. The `set`
// stub ignores the trailing `'EX', ttl` args -- TTL expiry isn't exercised
// here.
const store = new Map<string, string>()
vi.mock('./redisClient.js', () => ({
  getRedisClient: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value)
    },
    del: async (key: string) => {
      store.delete(key)
    },
  }),
}))

vi.mock('./users.js', () => ({
  getUser: vi.fn(async (id: string) =>
    id === 'user-1'
      ? { id: 'user-1', email: 'a@example.com', name: 'Ada', createdAt: 'now' }
      : null,
  ),
}))

const {
  createSession,
  destroySession,
  getSessionUser,
  getSessionCookieToken,
  parseCookies,
  serializeSessionCookie,
  clearSessionCookie,
} = await import('./session.js')

function reqWithCookie(cookie?: string): IncomingMessage {
  return { headers: cookie ? { cookie } : {} } as IncomingMessage
}

describe('session', () => {
  beforeEach(() => {
    store.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('createSession stores a random token -> userId and returns the token', async () => {
    const token = await createSession('user-1')
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(store.get(`session:${token}`)).toBe('user-1')
  })

  it('getSessionUser resolves the cookie token to its user', async () => {
    const token = await createSession('user-1')
    const user = await getSessionUser(reqWithCookie(`session=${token}`))
    expect(user).toMatchObject({ id: 'user-1', email: 'a@example.com' })
  })

  it('getSessionUser returns null with no cookie, an unknown token, or a missing user', async () => {
    expect(await getSessionUser(reqWithCookie())).toBeNull()
    expect(await getSessionUser(reqWithCookie('session=bogus'))).toBeNull()
    store.set('session:orphan', 'user-gone') // session exists, user record doesn't
    expect(await getSessionUser(reqWithCookie('session=orphan'))).toBeNull()
  })

  it('destroySession removes the session so it no longer resolves', async () => {
    const token = await createSession('user-1')
    await destroySession(token)
    expect(store.has(`session:${token}`)).toBe(false)
    expect(await getSessionUser(reqWithCookie(`session=${token}`))).toBeNull()
  })

  it('getSessionCookieToken pulls just the session cookie out of the header', () => {
    expect(getSessionCookieToken(reqWithCookie('a=1; session=xyz; b=2'))).toBe('xyz')
    expect(getSessionCookieToken(reqWithCookie('other=1'))).toBeUndefined()
  })

  it('parseCookies handles multiple pairs, whitespace, and url-encoding', () => {
    const jar = parseCookies(' a=1;session=%20tok%20 ; b=hello ')
    expect(jar.get('a')).toBe('1')
    expect(jar.get('session')).toBe(' tok ')
    expect(jar.get('b')).toBe('hello')
    expect(parseCookies(undefined).size).toBe(0)
  })

  it('serializeSessionCookie / clearSessionCookie set the expected attributes', () => {
    const set = serializeSessionCookie('tok', { secure: true })
    expect(set).toContain('session=tok')
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Lax')
    expect(set).toContain('Path=/')
    expect(set).toContain('Secure')

    const insecure = serializeSessionCookie('tok', { secure: false })
    expect(insecure).not.toContain('Secure')

    const cleared = clearSessionCookie({ secure: false })
    expect(cleared).toContain('session=;')
    expect(cleared).toContain('Max-Age=0')
  })
})
