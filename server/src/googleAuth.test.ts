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
    del: async (key: string) => {
      store.delete(key)
    },
  }),
}))

interface MockTokens {
  refresh_token?: string
  access_token?: string
  expiry_date?: number
  id_token?: string
}
const generateAuthUrl = vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1')
const getToken = vi.fn(async (_code: string): Promise<{ tokens: MockTokens }> => ({
  tokens: { refresh_token: 'refresh-abc', access_token: 'access-abc', expiry_date: 123 },
}))
let tokenHandler: ((tokens: unknown) => void) | undefined
const setCredentials = vi.fn()
const on = vi.fn((event: string, handler: (tokens: unknown) => void) => {
  if (event === 'tokens') tokenHandler = handler
})
interface MockPayload {
  sub?: string
  email?: string
  name?: string
}
const getPayload = vi.fn(
  (): MockPayload => ({ sub: 'sub-1', email: 'a@example.com', name: 'A' }),
)
const verifyIdToken = vi.fn(async () => ({ getPayload }))

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl,
        getToken,
        setCredentials,
        on,
        verifyIdToken,
      })),
    },
  },
}))

const {
  getAuthUrl,
  handleCallback,
  isGoogleConnected,
  getAuthorizedClient,
  getOAuthClient,
  getLoginAuthUrl,
  handleLoginCallback,
  NotAllowedError,
  GOOGLE_SCOPES,
  LOGIN_SCOPES,
} = await import('./googleAuth.js')

describe('googleAuth', () => {
  beforeEach(() => {
    store.clear()
    process.env.GOOGLE_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:8787/auth/connect/google/callback'
    process.env.GOOGLE_LOGIN_REDIRECT_URI = 'http://localhost:8787/auth/login/google/callback'
    process.env.ALLOWED_EMAILS = 'a@example.com'
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
    expect(await isGoogleConnected()).toBe(false)
    expect(await getAuthorizedClient()).toBeNull()
  })

  it('handleCallback exchanges the code and stores the resulting tokens', async () => {
    await handleCallback('auth-code-123')
    expect(getToken).toHaveBeenCalledWith('auth-code-123')
    expect(await isGoogleConnected()).toBe(true)
  })

  it('getAuthorizedClient sets stored credentials on a fresh OAuth2 client', async () => {
    await handleCallback('auth-code-123')
    const client = await getAuthorizedClient()
    expect(client).not.toBeNull()
    expect(setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: 'refresh-abc' }),
    )
  })

  it('persists refreshed tokens back to Redis when the client emits one', async () => {
    await handleCallback('auth-code-123')
    await getAuthorizedClient()
    tokenHandler?.({ access_token: 'refreshed-access', expiry_date: 999 })
    // The 'tokens' handler persists asynchronously; give its promise a tick.
    await Promise.resolve()
    await Promise.resolve()
    const stored = JSON.parse(store.get('google:oauth') ?? '{}')
    expect(stored.access_token).toBe('refreshed-access')
    expect(stored.refresh_token).toBe('refresh-abc') // preserved, not clobbered
  })

  describe('getLoginAuthUrl', () => {
    it('requests the login scopes and an account picker, not offline/consent', () => {
      const url = getLoginAuthUrl()
      expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1')
      expect(generateAuthUrl).toHaveBeenCalledWith({
        scope: LOGIN_SCOPES,
        prompt: 'select_account',
      })
    })
  })

  describe('handleLoginCallback', () => {
    it('creates a session for an allowlisted email', async () => {
      getToken.mockResolvedValueOnce({ tokens: { id_token: 'id-token-abc' } })
      const token = await handleLoginCallback('auth-code-123')
      expect(token).toBeTruthy()
      expect(verifyIdToken).toHaveBeenCalledWith({
        idToken: 'id-token-abc',
        audience: 'client-id',
      })
    })

    it('rejects an email not on the allowlist', async () => {
      process.env.ALLOWED_EMAILS = 'someone-else@example.com'
      getToken.mockResolvedValueOnce({ tokens: { id_token: 'id-token-abc' } })
      await expect(handleLoginCallback('auth-code-123')).rejects.toThrow(NotAllowedError)
    })

    it('throws when Google returns no id_token', async () => {
      getToken.mockResolvedValueOnce({ tokens: {} })
      await expect(handleLoginCallback('auth-code-123')).rejects.toThrow(/id_token/)
    })

    it('throws when the ID token payload is missing sub/email', async () => {
      getToken.mockResolvedValueOnce({ tokens: { id_token: 'id-token-abc' } })
      getPayload.mockReturnValueOnce({})
      await expect(handleLoginCallback('auth-code-123')).rejects.toThrow(/payload/)
    })
  })
})
