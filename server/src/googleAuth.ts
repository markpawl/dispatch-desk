import { google } from 'googleapis'
import type { Credentials, OAuth2Client } from 'google-auth-library'
import { getRedisClient } from './redisClient.js'
import { createSession } from './session.js'
import { upsertUser } from './users.js'

// Per-user *connection* tokens (the "connect Google as a send destination"
// flow) -- one key per signed-in user. Distinct from login below, which
// grants no Drive/Docs access and stores nothing here.
function googleOAuthKey(userId: string): string {
  return `google:oauth:${userId}`
}

// --- Connect (Google as a send destination) -----------------------------
// Read access to search for a doc to send to, write access to append to one.
// Kept as narrow as the two features actually need (see
// docs/CURRENT-WORK.md) rather than requesting broad Drive access.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
]

// --- Login (sign in to Dispatch Desk itself) ---------------------------
// Minimal identity scopes only -- no Drive/Docs access. The broader "connect"
// consent above is granted separately, later, by users who want to send.
export const GOOGLE_LOGIN_SCOPES = ['openid', 'email', 'profile']

export class EmailNotAllowedError extends Error {
  constructor(email: string) {
    super(`${email} is not on the ALLOWED_EMAILS allowlist`)
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`[googleAuth] ${name} is not set`)
  return value
}

// `redirectUri` defaults to the connect flow's `GOOGLE_REDIRECT_URI`; the
// login flow passes its own (`GOOGLE_LOGIN_REDIRECT_URI`) so both callback
// paths can share one Google Cloud OAuth client with two registered URIs.
export function getOAuthClient(redirectUri?: string): OAuth2Client {
  return new google.auth.OAuth2(
    requireEnv('GOOGLE_CLIENT_ID'),
    requireEnv('GOOGLE_CLIENT_SECRET'),
    redirectUri ?? requireEnv('GOOGLE_REDIRECT_URI'),
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

export async function handleCallback(userId: string, code: string): Promise<void> {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  await storeTokens(userId, tokens)
}

// --- Login flow ------------------------------------------------------------

export function getLoginAuthUrl(): string {
  const client = getOAuthClient(requireEnv('GOOGLE_LOGIN_REDIRECT_URI'))
  // No `access_type: 'offline'` / forced consent -- login just needs a
  // one-shot identity assertion (the id_token below), not a refresh token.
  return client.generateAuthUrl({ scope: GOOGLE_LOGIN_SCOPES })
}

interface GoogleIdTokenClaims {
  sub: string
  email?: string
  name?: string
}

// The id_token came straight from Google's token endpoint over TLS in the
// same response as the code exchange, so its payload is trusted without a
// separate signature check (the standard shortcut for the auth-code flow).
function decodeIdToken(idToken: string): GoogleIdTokenClaims {
  const segments = idToken.split('.')
  if (segments.length !== 3) throw new Error('[googleAuth] malformed id_token')
  return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf-8')) as GoogleIdTokenClaims
}

function isEmailAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS
  if (!raw) {
    console.warn('[googleAuth] ALLOWED_EMAILS is not set -- refusing all logins (invite-only)')
    return false
  }
  const allow = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return allow.includes(email.trim().toLowerCase())
}

// Exchanges the code, reads {sub, email, name} from the id_token, enforces the
// allowlist, upserts the user record, and opens a session. Returns the
// session token for the caller to set as a cookie. Throws EmailNotAllowedError
// for a valid Google account that just isn't invited (caller -> 403).
export async function handleLoginCallback(code: string): Promise<{ token: string }> {
  const client = getOAuthClient(requireEnv('GOOGLE_LOGIN_REDIRECT_URI'))
  const { tokens } = await client.getToken(code)
  if (!tokens.id_token) throw new Error('[googleAuth] login response had no id_token')
  const claims = decodeIdToken(tokens.id_token)
  if (!claims.email) throw new Error('[googleAuth] id_token had no email claim')
  if (!isEmailAllowed(claims.email)) throw new EmailNotAllowedError(claims.email)
  const user = await upsertUser({
    sub: claims.sub,
    email: claims.email,
    name: claims.name ?? claims.email,
  })
  const token = await createSession(user.id)
  return { token }
}

async function storeTokens(userId: string, tokens: Credentials): Promise<void> {
  const redis = getRedisClient()
  if (!redis) {
    throw new Error('[googleAuth] REDIS_URL is not set -- nowhere to store Google OAuth tokens')
  }
  await redis.set(googleOAuthKey(userId), JSON.stringify(tokens))
}

async function loadTokens(userId: string): Promise<Credentials | null> {
  const redis = getRedisClient()
  if (!redis) return null
  const raw = await redis.get(googleOAuthKey(userId))
  if (!raw) return null
  return JSON.parse(raw) as Credentials
}

export async function isGoogleConnected(userId: string): Promise<boolean> {
  const tokens = await loadTokens(userId)
  return tokens?.refresh_token != null
}

// Revokes the user's Google grant (best effort -- a failed revoke still
// removes it locally) and forgets the stored tokens.
export async function disconnectGoogle(userId: string): Promise<void> {
  const client = await getAuthorizedClient(userId)
  if (client) {
    try {
      await client.revokeCredentials()
    } catch (error) {
      console.error('[googleAuth] token revoke failed; forgetting tokens anyway', error)
    }
  }
  const redis = getRedisClient()
  if (redis) await redis.del(googleOAuthKey(userId))
}

// Returns an OAuth2Client with the given user's stored refresh token set, or
// null if that user hasn't connected Google yet. google-auth-library
// refreshes the access token from the refresh token automatically as needed;
// it also fires a 'tokens' event with the refreshed credentials, which is
// persisted back to Redis so a later cold start doesn't need to re-refresh
// immediately.
export async function getAuthorizedClient(userId: string): Promise<OAuth2Client | null> {
  const tokens = await loadTokens(userId)
  if (!tokens?.refresh_token) return null
  const client = getOAuthClient()
  client.setCredentials(tokens)
  client.on('tokens', (refreshed) => {
    storeTokens(userId, { ...tokens, ...refreshed }).catch((error: unknown) => {
      console.error('[googleAuth] failed to persist refreshed tokens', error)
    })
  })
  return client
}
