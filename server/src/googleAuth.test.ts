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
const getToken = vi.fn(async (_code: string) => ({
  tokens: { refresh_token: 'refresh-abc', access_token: 'access-abc', expiry_date: 123 },
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

const {
  getAuthUrl,
  handleCallback,
  isGoogleConnected,
  getAuthorizedClient,
  getOAuthClient,
  GOOGLE_SCOPES,
} = await import('./googleAuth.js')

describe('googleAuth', () => {
  beforeEach(() => {
    store.clear()
    process.env.GOOGLE_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:8787/auth/google/callback'
  })

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_REDIRECT_URI
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
})
