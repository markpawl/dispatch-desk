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

const getAuthenticationUrl = vi.fn(
  async () => 'https://www.dropbox.com/oauth2/authorize?mock=1',
)
const getAccessTokenFromCode = vi.fn(async (_redirectUri: string, _code: string) => ({
  result: { refresh_token: 'refresh-abc', access_token: 'access-abc' },
}))
const authTokenRevoke = vi.fn(async () => ({ result: {} }))
const DropboxCtor = vi.fn().mockImplementation((options: unknown) => ({ options, authTokenRevoke }))

vi.mock('dropbox', () => ({
  DropboxAuth: vi.fn().mockImplementation(() => ({ getAuthenticationUrl, getAccessTokenFromCode })),
  Dropbox: DropboxCtor,
}))

const {
  getDropboxAuthUrl,
  handleDropboxCallback,
  isDropboxConnected,
  disconnectDropbox,
  getAuthorizedDropboxClient,
  DROPBOX_SCOPES,
} = await import('./dropboxAuth.js')

describe('dropboxAuth', () => {
  beforeEach(() => {
    store.clear()
    process.env.DROPBOX_APP_KEY = 'app-key'
    process.env.DROPBOX_APP_SECRET = 'app-secret'
    process.env.DROPBOX_REDIRECT_URI = 'http://localhost:8787/auth/connect/dropbox/callback'
  })

  afterEach(() => {
    delete process.env.DROPBOX_APP_KEY
    delete process.env.DROPBOX_APP_SECRET
    delete process.env.DROPBOX_REDIRECT_URI
    vi.clearAllMocks()
  })

  it('getDropboxAuthUrl requests offline access and the narrow scopes', async () => {
    const url = await getDropboxAuthUrl()
    expect(url).toBe('https://www.dropbox.com/oauth2/authorize?mock=1')
    expect(getAuthenticationUrl).toHaveBeenCalledWith(
      'http://localhost:8787/auth/connect/dropbox/callback',
      undefined,
      'code',
      'offline',
      DROPBOX_SCOPES,
      'none',
      false,
    )
  })

  it('reports not connected before any tokens are stored', async () => {
    expect(await isDropboxConnected('user-1')).toBe(false)
    expect(await getAuthorizedDropboxClient('user-1')).toBeNull()
  })

  it('handleDropboxCallback exchanges the code and stores the refresh token per user', async () => {
    await handleDropboxCallback('user-1', 'code-xyz')
    expect(getAccessTokenFromCode).toHaveBeenCalledWith(
      'http://localhost:8787/auth/connect/dropbox/callback',
      'code-xyz',
    )
    expect(JSON.parse(store.get('dropbox:oauth:user-1') ?? '{}')).toEqual({
      refreshToken: 'refresh-abc',
    })
    expect(await isDropboxConnected('user-1')).toBe(true)
    expect(await isDropboxConnected('user-2')).toBe(false)
  })

  it('throws if the token response carries no refresh_token', async () => {
    getAccessTokenFromCode.mockResolvedValueOnce({ result: {} } as Awaited<
      ReturnType<typeof getAccessTokenFromCode>
    >)
    await expect(handleDropboxCallback('user-1', 'code')).rejects.toThrow(/refresh_token/)
  })

  it('getAuthorizedDropboxClient builds a Dropbox client with the stored refresh token', async () => {
    await handleDropboxCallback('user-1', 'code-xyz')
    const client = await getAuthorizedDropboxClient('user-1')
    expect(client).not.toBeNull()
    expect(DropboxCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'app-key',
        clientSecret: 'app-secret',
        refreshToken: 'refresh-abc',
      }),
    )
  })

  describe('disconnectDropbox', () => {
    it('revokes the token and forgets the stored refresh token', async () => {
      await handleDropboxCallback('user-1', 'code-xyz')
      expect(store.has('dropbox:oauth:user-1')).toBe(true)

      await disconnectDropbox('user-1')
      expect(authTokenRevoke).toHaveBeenCalled()
      expect(store.has('dropbox:oauth:user-1')).toBe(false)
    })

    it('still forgets the token if the revoke call fails', async () => {
      await handleDropboxCallback('user-1', 'code-xyz')
      authTokenRevoke.mockRejectedValueOnce(new Error('network'))

      await disconnectDropbox('user-1')
      expect(store.has('dropbox:oauth:user-1')).toBe(false)
    })

    it('is a no-op when nothing is connected', async () => {
      await expect(disconnectDropbox('user-none')).resolves.toBeUndefined()
      expect(authTokenRevoke).not.toHaveBeenCalled()
    })
  })
})
