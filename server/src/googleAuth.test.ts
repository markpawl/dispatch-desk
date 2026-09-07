import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A fake in-memory Redis good enough for the get/set this module actually
// uses -- avoids needing a real Redis instance for these tests, matching
// redis.test.ts's "no REDIS_URL" style but for the "REDIS_URL is set" path.
const store = new Map<string, string>()
vi.mock('./redisClient.js', () => ({
  getRedisClient: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value)
    },
  }),
}))

const generateAuthUrl = vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1')
// A JWT-shaped id_token: header.payload.signature, payload base64url-encoding
// the claims handleLoginCallback reads. Only the payload segment is inspected
// (see decodeIdToken -- no signature check), so header/signature are dummies.
const idTokenClaims = { sub: 'sub-xyz', email: 'invited@example.com', name: 'Invited User' }
const idToken = `h.${Buffer.from(JSON.stringify(idTokenClaims)).toString('base64url')}.s`
const getToken = vi.fn(async (_code: string) => ({
  tokens: {
    refresh_token: 'refresh-abc',
    access_token: 'access-abc',
    expiry_date: 123,
    id_token: idToken,
  },
}))
let tokenHandler: ((tokens: unknown) => void) | undefined
const setCredentials = vi.fn()
const on = vi.fn((event: string, handler: (tokens: unknown) => void) => {
  if (event === 'tokens') tokenHandler = handler
})

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl,
        getToken,
        setCredentials,
        on,
      })),
    },
  },
}))

const upsertUser = vi.fn(async (profile: { sub: string; email: string; name: string }) => ({
  id: profile.sub,
  email: profile.email,
  name: profile.name,
  createdAt: 'now',
}))
vi.mock('./users.js', () => ({ upsertUser }))

const createSession = vi.fn(async (userId: string) => `session-for-${userId}`)
vi.mock('./session.js', () => ({ createSession }))

const {
  getAuthUrl,
  getLoginAuthUrl,
  handleCallback,
  handleLoginCallback,
  isGoogleConnected,
  getAuthorizedClient,
  getOAuthClient,
  EmailNotAllowedError,
  GOOGLE_SCOPES,
  GOOGLE_LOGIN_SCOPES,
} = await import('./googleAuth.js')

describe('googleAuth', () => {
  beforeEach(() => {
    store.clear()
    process.env.GOOGLE_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:8787/auth/connect/google/callback'
    process.env.GOOGLE_LOGIN_REDIRECT_URI = 'http://localhost:8787/auth/login/google/callback'
    process.env.ALLOWED_EMAILS = 'invited@example.com, someone-else@example.com'
  })

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_REDIRECT_URI
    delete process.env.GOOGLE_LOGIN_REDIRECT_URI
    delete process.env.ALLOWED_EMAILS
    vi.clearAllMocks()
  })

  it('getOAuthClient throws a clear error when env vars are missing', () => {
    delete process.env.GOOGLE_CLIENT_ID
    expect(() => getOAuthClient()).toThrow(/GOOGLE_CLIENT_ID/)
  })

  it('getAuthUrl requests offline access, forced consent, and the documents/drive scopes', () => {
    const url = getAuthUrl()
    expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1')
    expect(generateAuthUrl).toHaveBeenCalledWith({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
    })
  })

  it('reports not connected before any tokens are stored', async () => {
    expect(await isGoogleConnected('user-1')).toBe(false)
    expect(await getAuthorizedClient('user-1')).toBeNull()
  })

  it('handleCallback exchanges the code and stores the resulting tokens under the user key', async () => {
    await handleCallback('user-1', 'auth-code-123')
    expect(getToken).toHaveBeenCalledWith('auth-code-123')
    expect(store.get('google:oauth:user-1')).toBeTruthy()
    expect(await isGoogleConnected('user-1')).toBe(true)
    // Another user is unaffected.
    expect(await isGoogleConnected('user-2')).toBe(false)
  })

  it('getAuthorizedClient sets stored credentials on a fresh OAuth2 client', async () => {
    await handleCallback('user-1', 'auth-code-123')
    const client = await getAuthorizedClient('user-1')
    expect(client).not.toBeNull()
    expect(setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: 'refresh-abc' }),
    )
  })

  it('persists refreshed tokens back to Redis when the client emits one', async () => {
    await handleCallback('user-1', 'auth-code-123')
    await getAuthorizedClient('user-1')
    tokenHandler?.({ access_token: 'refreshed-access', expiry_date: 999 })
    // The 'tokens' handler persists asynchronously; give its promise a tick.
    await Promise.resolve()
    await Promise.resolve()
    const stored = JSON.parse(store.get('google:oauth:user-1') ?? '{}')
    expect(stored.access_token).toBe('refreshed-access')
    expect(stored.refresh_token).toBe('refresh-abc') // preserved, not clobbered
  })

  describe('login flow', () => {
    it('getLoginAuthUrl requests only the identity scopes (no offline/consent)', () => {
      const url = getLoginAuthUrl()
      expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1')
      expect(generateAuthUrl).toHaveBeenCalledWith({ scope: GOOGLE_LOGIN_SCOPES })
      expect(GOOGLE_LOGIN_SCOPES).toEqual(['openid', 'email', 'profile'])
    })

    it('handleLoginCallback upserts the user from the id_token and opens a session', async () => {
      const result = await handleLoginCallback('auth-code-xyz')
      expect(getToken).toHaveBeenCalledWith('auth-code-xyz')
      expect(upsertUser).toHaveBeenCalledWith({
        sub: 'sub-xyz',
        email: 'invited@example.com',
        name: 'Invited User',
      })
      expect(createSession).toHaveBeenCalledWith('sub-xyz')
      expect(result).toEqual({ token: 'session-for-sub-xyz' })
    })

    it('rejects a valid Google account that is not on the allowlist', async () => {
      process.env.ALLOWED_EMAILS = 'only-this-other-person@example.com'
      await expect(handleLoginCallback('code')).rejects.toBeInstanceOf(EmailNotAllowedError)
      expect(upsertUser).not.toHaveBeenCalled()
      expect(createSession).not.toHaveBeenCalled()
    })

    it('rejects everyone when ALLOWED_EMAILS is unset (fails closed)', async () => {
      delete process.env.ALLOWED_EMAILS
      await expect(handleLoginCallback('code')).rejects.toBeInstanceOf(EmailNotAllowedError)
    })

    it('matches the allowlist case-insensitively', async () => {
      process.env.ALLOWED_EMAILS = 'INVITED@EXAMPLE.COM'
      await expect(handleLoginCallback('code')).resolves.toEqual({ token: 'session-for-sub-xyz' })
    })

    it('throws if the token response carries no id_token', async () => {
      getToken.mockResolvedValueOnce({
        tokens: { refresh_token: 'r', access_token: 'a', expiry_date: 1 },
      } as Awaited<ReturnType<typeof getToken>>)
      await expect(handleLoginCallback('code')).rejects.toThrow(/id_token/)
    })
  })
})
