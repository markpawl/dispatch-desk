import type { IncomingMessage } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const { upsertUser } = await import('./users.js')
const { createSession, destroySession, getSessionToken, getSessionUser } = await import(
  './session.js'
)

function fakeRequest(cookieHeader?: string): IncomingMessage {
  return { headers: { cookie: cookieHeader } } as IncomingMessage
}

describe('session', () => {
  beforeEach(() => {
    store.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getSessionToken', () => {
    it('returns null when there is no cookie header', () => {
      expect(getSessionToken(fakeRequest())).toBeNull()
    })

    it('returns null when the session cookie is absent', () => {
      expect(getSessionToken(fakeRequest('other=1'))).toBeNull()
    })

    it('parses the session cookie out of a multi-cookie header', () => {
      expect(getSessionToken(fakeRequest('a=1; session=abc123; b=2'))).toBe('abc123')
    })

    it('URL-decodes the cookie value', () => {
      expect(getSessionToken(fakeRequest('session=a%2Fb'))).toBe('a/b')
    })
  })

  describe('createSession / getSessionUser / destroySession', () => {
    it('round-trips a session to the user it was created for', async () => {
      const user = await upsertUser({ id: 'sub-1', email: 'a@example.com', name: 'A' })
      const token = await createSession(user.id)
      expect(token).toBeTruthy()

      const found = await getSessionUser(fakeRequest(`session=${token}`))
      expect(found).toEqual(user)
    })

    it('getSessionUser returns null with no cookie', async () => {
      expect(await getSessionUser(fakeRequest())).toBeNull()
    })

    it('getSessionUser returns null for an unknown session token', async () => {
      expect(await getSessionUser(fakeRequest('session=does-not-exist'))).toBeNull()
    })

    it('destroySession invalidates the session', async () => {
      const user = await upsertUser({ id: 'sub-1', email: 'a@example.com', name: 'A' })
      const token = await createSession(user.id)
      await destroySession(token)
      expect(await getSessionUser(fakeRequest(`session=${token}`))).toBeNull()
    })
  })
})
