import type { IncomingMessage, ServerResponse } from 'node:http'
import { getDestination, listDestinations, saveGoogleDocDestination } from './destinations.js'
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

// Group C wires this into the /api/* routes that read per-user data. It ships
// here now (unused beyond its test) so those routes only need to add the call.
// Writes a 401 and resolves null when there's no valid session.
export async function requireUser(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<User | null> {
  const user = await getSessionUser(req)
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

interface SendRequestBody {
  text: string
  destinationId?: string
  docId?: string
  docName?: string
}

function parseSendBody(body: unknown): SendRequestBody {
  if (typeof body !== 'object' || body === null) throw new BadRequestError('Expected a JSON body')
  const { text, destinationId, docId, docName } = body as Record<string, unknown>
  if (typeof text !== 'string' || text.trim() === '') {
    throw new BadRequestError('"text" is required')
  }
  if (typeof destinationId === 'string' && destinationId) {
    return { text, destinationId }
  }
  if (typeof docId === 'string' && docId && typeof docName === 'string' && docName) {
    return { text, docId, docName }
  }
  throw new BadRequestError('Either "destinationId" or both "docId" and "docName" are required')
}

async function resolveTarget(
  body: SendRequestBody,
): Promise<{ docId: string; docName: string }> {
  if (body.destinationId) {
    const destination = await getDestination(body.destinationId)
    if (!destination) throw new NotFoundError(`No destination "${body.destinationId}"`)
    return { docId: destination.docId, docName: destination.docName }
  }
  // parseSendBody guarantees docId/docName are set in this branch.
  return { docId: body.docId as string, docName: body.docName as string }
}

// Pulled out of index.ts so it's testable without booting the whole app --
// index.ts itself starts listening (and waits on the Sync Server's Redis
// load) as an import-time side effect, which a route-level test shouldn't
// have to pay for or depend on.
export function createRequestHandler(clientDistDir: string) {
  const serveClient = serveStatic(clientDistDir)

  return (req: IncomingMessage, res: ServerResponse) => {
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

    // --- Connect: authorize Google as a send destination -----------------

    if (url.pathname === '/auth/connect/google') {
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
      const code = url.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing code')
        return
      }
      handleCallback(code)
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
      isGoogleConnected()
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
      searchGoogleDocs(url.searchParams.get('q') ?? '')
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

    if (url.pathname === '/api/destinations') {
      listDestinations()
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
      readJsonBody(req)
        .then(async (body) => {
          const parsed = parseSendBody(body)
          const { docId, docName } = await resolveTarget(parsed)
          await appendTextToDoc(docId, parsed.text)
          const destination = await saveGoogleDocDestination(docId, docName)
          await appendSendLogEntry({
            destinationId: destination.id,
            docName: destination.docName,
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
          if (error instanceof GoogleNotConnectedError) {
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
