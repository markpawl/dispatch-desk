import { google } from 'googleapis'
import type { Credentials, OAuth2Client } from 'google-auth-library'
import { getRedisClient } from './redisClient.js'

// Single set of tokens for the whole app -- Dispatch Desk is personal-use,
// single-user (see docs/REQUIREMENTS.md's Auth/Identity section), so there's
// no per-user token storage, just one fixed key.
const GOOGLE_OAUTH_KEY = 'google:oauth'

// Read access to search for a doc to send to, write access to append to one.
// Kept as narrow as the two features actually need (see
// docs/CURRENT-WORK.md) rather than requesting broad Drive access.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
]

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`[googleAuth] ${name} is not set`)
  return value
}

export function getOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    requireEnv('GOOGLE_CLIENT_ID'),
    requireEnv('GOOGLE_CLIENT_SECRET'),
    requireEnv('GOOGLE_REDIRECT_URI'),
  )
}

export function getAuthUrl(): string {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    // 'offline' + 'consent' together are what reliably gets a refresh_token
    // back -- Google only issues one on a user's *first* consent otherwise,
    // and this app has no other way to obtain one again short of revoking
    // access and re-consenting.
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
  })
}

export async function handleCallback(code: string): Promise<void> {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  await storeTokens(tokens)
}

async function storeTokens(tokens: Credentials): Promise<void> {
  const redis = getRedisClient()
  if (!redis) {
    throw new Error('[googleAuth] REDIS_URL is not set -- nowhere to store Google OAuth tokens')
  }
  await redis.set(GOOGLE_OAUTH_KEY, JSON.stringify(tokens))
}

async function loadTokens(): Promise<Credentials | null> {
  const redis = getRedisClient()
  if (!redis) return null
  const raw = await redis.get(GOOGLE_OAUTH_KEY)
  if (!raw) return null
  return JSON.parse(raw) as Credentials
}

export async function isGoogleConnected(): Promise<boolean> {
  const tokens = await loadTokens()
  return tokens?.refresh_token != null
}

// Returns an OAuth2Client with the stored refresh token set, or null if
// Google hasn't been connected yet. google-auth-library refreshes the
// access token from the refresh token automatically as needed; it also
// fires a 'tokens' event with the refreshed credentials, which is persisted
// back to Redis so a later cold start doesn't need to re-refresh immediately.
export async function getAuthorizedClient(): Promise<OAuth2Client | null> {
  const tokens = await loadTokens()
  if (!tokens?.refresh_token) return null
  const client = getOAuthClient()
  client.setCredentials(tokens)
  client.on('tokens', (refreshed) => {
    storeTokens({ ...tokens, ...refreshed }).catch((error: unknown) => {
      console.error('[googleAuth] failed to persist refreshed tokens', error)
    })
  })
  return client
}
