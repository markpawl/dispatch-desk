import { Dropbox, DropboxAuth } from 'dropbox'
import { getRedisClient } from './redisClient.js'

// Per-user Dropbox connection tokens (the "append text to a Dropbox file"
// destination), one key per signed-in user -- mirrors googleAuth.ts's
// google:oauth:<userId>.
function dropboxOAuthKey(userId: string): string {
  return `dropbox:oauth:${userId}`
}

// As narrow as the search + download + upload the destination actually does.
export const DROPBOX_SCOPES = [
  'account_info.read',
  'files.metadata.read',
  'files.content.read',
  'files.content.write',
]

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`[dropboxAuth] ${name} is not set`)
  return value
}

function newDropboxAuth(): DropboxAuth {
  return new DropboxAuth({
    clientId: requireEnv('DROPBOX_APP_KEY'),
    clientSecret: requireEnv('DROPBOX_APP_SECRET'),
  })
}

export async function getDropboxAuthUrl(): Promise<string> {
  const auth = newDropboxAuth()
  // 'offline' asks for a refresh token; Dropbox refresh tokens are long-lived
  // and don't rotate, so (unlike Google) there's no refreshed-token to persist
  // back later -- the SDK swaps a short-lived access token in memory per call.
  const url = await auth.getAuthenticationUrl(
    requireEnv('DROPBOX_REDIRECT_URI'),
    undefined, // state -- CSRF state param deferred, same as Google (see docs/IDEAS.md)
    'code',
    'offline',
    DROPBOX_SCOPES,
    'none',
    false, // server-side with a client secret, so no PKCE
  )
  return String(url)
}

interface StoredDropboxTokens {
  refreshToken: string
}

async function storeTokens(userId: string, tokens: StoredDropboxTokens): Promise<void> {
  const redis = getRedisClient()
  if (!redis) {
    throw new Error('[dropboxAuth] REDIS_URL is not set -- nowhere to store Dropbox tokens')
  }
  await redis.set(dropboxOAuthKey(userId), JSON.stringify(tokens))
}

async function loadTokens(userId: string): Promise<StoredDropboxTokens | null> {
  const redis = getRedisClient()
  if (!redis) return null
  const raw = await redis.get(dropboxOAuthKey(userId))
  if (!raw) return null
  return JSON.parse(raw) as StoredDropboxTokens
}

export async function handleDropboxCallback(userId: string, code: string): Promise<void> {
  const auth = newDropboxAuth()
  const response = await auth.getAccessTokenFromCode(requireEnv('DROPBOX_REDIRECT_URI'), code)
  const result = response.result as { refresh_token?: string }
  if (!result.refresh_token) {
    throw new Error('[dropboxAuth] token response had no refresh_token')
  }
  await storeTokens(userId, { refreshToken: result.refresh_token })
}

export async function isDropboxConnected(userId: string): Promise<boolean> {
  return (await loadTokens(userId))?.refreshToken != null
}

// A Dropbox client bound to the user's stored refresh token, or null if they
// haven't connected. The client refreshes its own access token from the
// refresh token as needed.
export async function getAuthorizedDropboxClient(userId: string): Promise<Dropbox | null> {
  const tokens = await loadTokens(userId)
  if (!tokens?.refreshToken) return null
  return new Dropbox({
    clientId: requireEnv('DROPBOX_APP_KEY'),
    clientSecret: requireEnv('DROPBOX_APP_SECRET'),
    refreshToken: tokens.refreshToken,
  })
}
