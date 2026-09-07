import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  type Destination,
  getDestination,
  listDestinations,
  saveDropboxFileDestination,
  saveGoogleDocDestination,
} from './destinations.js'
import {
  getDropboxAuthUrl,
  handleDropboxCallback,
  isDropboxConnected,
} from './dropboxAuth.js'
import {
  DropboxNotConnectedError,
  appendTextToDropboxFile,
  searchDropboxFiles,
} from './dropboxFiles.js'
import {
  EmailNotAllowedError,
  getAuthUrl,
  getLoginAuthUrl,
  handleCallback,
  handleLoginCallback,
  isGoogleConnected,
} from './googleAuth.js'
import { GoogleNotConnectedError, appendTextToDoc, searchGoogleDocs } from './googleDocs.js'
import { appendSendLogEntry, truncateForPreview } from './sendLog.js'
import {
  clearSessionCookie,
  destroySession,
  getSessionCookieToken,
  getSessionUser,
  serializeSessionCookie,
} from './session.js'
import { serveStatic } from './staticFiles.js'
import type { User } from './users.js'
import { BUILD_TIMESTAMP } from './version.js'

// `Secure` cookies can't be set over plain HTTP, which is what local dev
// serves; everywhere else (Railway, behind its TLS-terminating proxy) they
// should be. Host-based rather than proto-based since local dev is the only
// non-HTTPS case that matters here.
function cookieSecure(req: IncomingMessage): boolean {
  const hostname = (req.headers.host ?? '').split(':')[0]
  return hostname !== 'localhost' && hostname !== '127.0.0.1'
}

// Guards every per-user route below (the connect/google flow and the
// /api/* data routes). Writes a 401 and resolves null when there's no valid
// session, so callers can `if (!user) return`.
export async function requireUser(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<User | null> {
  let user: User | null = null
  try {
    user = await getSessionUser(req)
  } catch (error) {
    // Can't verify the session (e.g. Redis is down) -- fail closed rather
    // than leave the request hanging on an unhandled rejection.
    console.error('[auth] session lookup failed', error)
  }
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not signed in' }))
    return null
  }
  return user
}

// Collects and JSON-parses a request body. No framework here (see
// staticFiles.ts's comment on the same theme), so this is the raw-Node way.
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolvePromise(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {})
      } catch (error) {
        rejectPromise(error)
      }
    })
    req.on('error', rejectPromise)
  })
}

class BadRequestError extends Error {}
class NotFoundError extends Error {}

// A resolved send target, tagged by provider. An existing `destinationId`
// resolves to one of these; an ad-hoc send carries one provider's fields.
type SendTarget =
  | { provider: 'google-doc'; docId: string; docName: string }
  | { provider: 'dropbox-file'; path: string; name: string }

interface SendRequestBody {
  text: string
  destinationId?: string
  docId?: string
  docName?: string
  dropboxPath?: string
  dropboxName?: string
}

function parseSendBody(body: unknown): SendRequestBody {
  if (typeof body !== 'object' || body === null) throw new BadRequestError('Expected a JSON body')
  const { text, destinationId, docId, docName, dropboxPath, dropboxName } = body as Record<
    string,
    unknown
  >
  if (typeof text !== 'string' || text.trim() === '') {
    throw new BadRequestError('"text" is required')
  }
  if (typeof destinationId === 'string' && destinationId) {
    return { text, destinationId }
  }
  if (typeof docId === 'string' && docId && typeof docName === 'string' && docName) {
    return { text, docId, docName }
  }
  if (
    typeof dropboxPath === 'string' &&
    dropboxPath &&
    typeof dropboxName === 'string' &&
    dropboxName
  ) {
    return { text, dropboxPath, dropboxName }
  }
  throw new BadRequestError(
    'Provide "destinationId", or "docId"+"docName", or "dropboxPath"+"dropboxName"',
  )
}

async function resolveTarget(userId: string, body: SendRequestBody): Promise<SendTarget> {
  if (body.destinationId) {
    const destination = await getDestination(userId, body.destinationId)
    if (!destination) throw new NotFoundError(`No destination "${body.destinationId}"`)
    return destination.type === 'google-doc'
      ? { provider: 'google-doc', docId: destination.docId, docName: destination.docName }
      : { provider: 'dropbox-file', path: destination.path, name: destination.name }
  }
  if (body.docId && body.docName) {
    return { provider: 'google-doc', docId: body.docId, docName: body.docName }
  }
  // parseSendBody guarantees the dropbox fields are set in this branch.
  return {
    provider: 'dropbox-file',
    path: body.dropboxPath as string,
    name: body.dropboxName as string,
  }
}

// Pulled out of index.ts so it's testable without booting the whole app --
// index.ts itself starts listening (and waits on the Sync Server's Redis
// load) as an import-time side effect, which a route-level test shouldn't
// have to pay for or depend on.
export function createRequestHandler(clientDistDir: string) {
  const serveClient = serveStatic(clientDistDir)

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', buildTimestamp: BUILD_TIMESTAMP }))
      return
    }

    // --- Login: sign in to Dispatch Desk itself --------------------------

    if (url.pathname === '/auth/login/google') {
      try {
        res.writeHead(302, { Location: getLoginAuthUrl() })
        res.end()
      } catch (error) {
        console.error('[auth] failed to build Google login URL', error)
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Google OAuth is not configured')
      }
      return
    }

    if (url.pathname === '/auth/login/google/callback') {
      const code = url.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing code')
        return
      }
      handleLoginCallback(code)
        .then(({ token }) => {
          res.writeHead(302, {
            Location: '/',
            'Set-Cookie': serializeSessionCookie(token, { secure: cookieSecure(req) }),
          })
          res.end()
        })
        .catch((error: unknown) => {
          if (error instanceof EmailNotAllowedError) {
            res.writeHead(403, { 'Content-Type': 'text/plain' })
            res.end('This Google account is not authorized for Dispatch Desk.')
            return
          }
          console.error('[auth] Google login callback failed', error)
          res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Google sign-in failed')
        })
      return
    }

    if (url.pathname === '/auth/logout') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed')
        return
      }
      const token = getSessionCookieToken(req)
      const finish = () => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': clearSessionCookie({ secure: cookieSecure(req) }),
        })
        res.end(JSON.stringify({ ok: true }))
      }
      if (!token) {
        finish()
        return
      }
      destroySession(token)
        .then(finish)
        .catch((error: unknown) => {
          console.error('[auth] logout failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Logout failed' }))
        })
      return
    }

    if (url.pathname === '/api/me') {
      getSessionUser(req)
        .then((user) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              user: user ? { id: user.id, email: user.email, name: user.name } : null,
            }),
          )
        })
        .catch((error: unknown) => {
          console.error('[auth] /api/me failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ user: null }))
        })
      return
    }

    // --- Connect: authorize Google as a send destination ----------------
    // Everything below is per-user and requires a session -- requireUser
    // writes the 401 itself, so each route just bails on a null user.

    if (url.pathname === '/auth/connect/google') {
      const user = await requireUser(req, res)
      if (!user) return
      try {
        res.writeHead(302, { Location: getAuthUrl() })
        res.end()
      } catch (error) {
        // Most likely GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI aren't set yet --
        // see docs/CURRENT-WORK.md's manual setup steps.
        console.error('[auth] failed to build Google auth URL', error)
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Google OAuth is not configured')
      }
      return
    }

    if (url.pathname === '/auth/connect/google/callback') {
      const user = await requireUser(req, res)
      if (!user) return
      const code = url.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing code')
        return
      }
      handleCallback(user.id, code)
        .then(() => {
          res.writeHead(302, { Location: '/' })
          res.end()
        })
        .catch((error: unknown) => {
          console.error('[auth] Google OAuth callback failed', error)
          res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Google authorization failed')
        })
      return
    }

    if (url.pathname === '/api/google/status') {
      const user = await requireUser(req, res)
      if (!user) return
      isGoogleConnected(user.id)
        .then((connected) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ connected }))
        })
        .catch((error: unknown) => {
          console.error('[auth] failed to check Google connection status', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ connected: false }))
        })
      return
    }

    if (url.pathname === '/api/google-docs/search') {
      const user = await requireUser(req, res)
      if (!user) return
      searchGoogleDocs(user.id, url.searchParams.get('q') ?? '')
        .then((docs) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ docs }))
        })
        .catch((error: unknown) => {
          if (error instanceof GoogleNotConnectedError) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error.message }))
            return
          }
          console.error('[google-docs] search failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Google Docs search failed' }))
        })
      return
    }

    // --- Connect: authorize Dropbox as a send destination --------------

    if (url.pathname === '/auth/connect/dropbox') {
      const user = await requireUser(req, res)
      if (!user) return
      getDropboxAuthUrl()
        .then((location) => {
          res.writeHead(302, { Location: location })
          res.end()
        })
        .catch((error: unknown) => {
          // Most likely DROPBOX_APP_KEY/SECRET/REDIRECT_URI aren't set yet.
          console.error('[auth] failed to build Dropbox auth URL', error)
          res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Dropbox OAuth is not configured')
        })
      return
    }

    if (url.pathname === '/auth/connect/dropbox/callback') {
      const user = await requireUser(req, res)
      if (!user) return
      const code = url.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing code')
        return
      }
      handleDropboxCallback(user.id, code)
        .then(() => {
          res.writeHead(302, { Location: '/' })
          res.end()
        })
        .catch((error: unknown) => {
          console.error('[auth] Dropbox OAuth callback failed', error)
          res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Dropbox authorization failed')
        })
      return
    }

    if (url.pathname === '/api/dropbox/status') {
      const user = await requireUser(req, res)
      if (!user) return
      isDropboxConnected(user.id)
        .then((connected) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ connected }))
        })
        .catch((error: unknown) => {
          console.error('[auth] failed to check Dropbox connection status', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ connected: false }))
        })
      return
    }

    if (url.pathname === '/api/dropbox/search') {
      const user = await requireUser(req, res)
      if (!user) return
      searchDropboxFiles(user.id, url.searchParams.get('q') ?? '')
        .then((files) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ files }))
        })
        .catch((error: unknown) => {
          if (error instanceof DropboxNotConnectedError) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error.message }))
            return
          }
          console.error('[dropbox] search failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Dropbox search failed' }))
        })
      return
    }

    if (url.pathname === '/api/destinations') {
      const user = await requireUser(req, res)
      if (!user) return
      listDestinations(user.id)
        .then((destinations) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ destinations }))
        })
        .catch((error: unknown) => {
          console.error('[destinations] list failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Failed to list destinations' }))
        })
      return
    }

    if (url.pathname === '/api/send') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed')
        return
      }
      const user = await requireUser(req, res)
      if (!user) return
      readJsonBody(req)
        .then(async (body) => {
          const parsed = parseSendBody(body)
          const target = await resolveTarget(user.id, parsed)
          let destination: Destination
          if (target.provider === 'google-doc') {
            await appendTextToDoc(user.id, target.docId, parsed.text)
            destination = await saveGoogleDocDestination(user.id, target.docId, target.docName)
          } else {
            await appendTextToDropboxFile(user.id, target.path, parsed.text)
            destination = await saveDropboxFileDestination(user.id, target.path, target.name)
          }
          await appendSendLogEntry(user.id, {
            destinationId: destination.id,
            docName: destination.type === 'google-doc' ? destination.docName : destination.name,
            textPreview: truncateForPreview(parsed.text),
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, destination }))
        })
        .catch((error: unknown) => {
          if (error instanceof BadRequestError) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error.message }))
            return
          }
          if (error instanceof NotFoundError) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error.message }))
            return
          }
          if (error instanceof GoogleNotConnectedError || error instanceof DropboxNotConnectedError) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error.message }))
            return
          }
          console.error('[send] failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Send failed' }))
        })
      return
    }

    serveClient(req, res)
  }
}
