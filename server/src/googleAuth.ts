import { google } from 'googleapis'
import type { Credentials, OAuth2Client } from 'google-auth-library'
import { getRedisClient } from './redisClient.js'
import { createSession } from './session.js'
import { upsertUser } from './users.js'

// Single set of tokens for the whole app -- Dispatch Desk is personal-use,
// single-user (see docs/REQUIREMENTS.md's Auth/Identity section), so there's
// no per-user token storage, just one fixed key. (Group C re-keys this per
// user; see docs/CURRENT-WORK.md.)
const GOOGLE_OAUTH_KEY = 'google:oauth'

// Read access to search for a doc to send to, write access to append to one.
// Kept as narrow as the two features actually need (see
// docs/CURRENT-WORK.md) rather than requesting broad Drive access.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
]

// Kept separate from GOOGLE_SCOPES -- signing in only needs to know who you
// are, not access your Drive. That broader consent is granted later, as its
// own step, when actually connecting Google as a destination. See
// docs/REQUIREMENTS.md's Auth/Identity section.
export const LOGIN_SCOPES = ['openid', 'email', 'profile']

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

// Login uses its own redirect URI/callback route, distinct from the "connect
// Google" flow above -- they're separate OAuth round-trips (different scopes,
// different callback handlers) even though both go through the same Google
// app, so they can't share one redirect_uri.
function getLoginOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    requireEnv('GOOGLE_CLIENT_ID'),
    requireEnv('GOOGLE_CLIENT_SECRET'),
    requireEnv('GOOGLE_LOGIN_REDIRECT_URI'),
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

export function getLoginAuthUrl(): string {
  const client = getLoginOAuthClient()
  return client.generateAuthUrl({
    scope: LOGIN_SCOPES,
    // Lets someone signed into multiple Google accounts pick, rather than
    // silently reusing whichever one is currently active in their browser.
    prompt: 'select_account',
  })
}

export class NotAllowedError extends Error {
  constructor(email: string) {
    super(`${email} is not on the allowlist`)
  }
}

// Invite-only access control (docs/REQUIREMENTS.md's Auth/Identity section):
// an operator-controlled allowlist rather than open self-service signup.
function isEmailAllowed(email: string): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email.toLowerCase())
}

// Exchanges the login callback's code for an ID token, verifies it, checks
// the allowlist, upserts the user record, and creates a session -- returning
// just the session token for the caller to set as a cookie.
export async function handleLoginCallback(code: string): Promise<string> {
  const client = getLoginOAuthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.id_token) {
    throw new Error('[googleAuth] No id_token returned from Google')
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: requireEnv('GOOGLE_CLIENT_ID'),
  })
  const payload = ticket.getPayload()
  if (!payload?.sub || !payload.email) {
    throw new Error('[googleAuth] Incomplete ID token payload from Google')
  }
  if (!isEmailAllowed(payload.email)) {
    throw new NotAllowedError(payload.email)
  }
  const user = await upsertUser({
    id: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
  })
  return createSession(user.id)
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
