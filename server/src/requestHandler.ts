import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  type Destination,
  deleteDestination,
  getDestination,
  listDestinations,
  saveDropboxFileDestination,
  saveEmailDestination,
  saveGoogleDocDestination,
} from './destinations.js'
import {
  disconnectDropbox,
  getDropboxAuthUrl,
  handleDropboxCallback,
  isDropboxConnected,
} from './dropboxAuth.js'
import {
  DropboxNotConnectedError,
  appendTextToDropboxFile,
  searchDropboxFiles,
} from './dropboxFiles.js'
import { nextEmailSequenceNumber } from './emailSequence.js'
import { sendEmail } from './gmail.js'
import {
  EmailNotAllowedError,
  disconnectGoogle,
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

interface SendRequestBody {
  text: string
  destinationId: string
  // Only meaningful when the destination resolves to email -- the sending
  // browser's local day ("yyyy-mm-dd", for the daily sequence's day
  // boundary) and local clock ("mm/dd/yyyy HH:mm") for the subject line.
  localDate?: string
  localTime?: string
}

// Every send is by destinationId now -- google-doc/dropbox-file destinations
// used to also be creatable as a send side-effect (ad-hoc docId/docName or
// dropboxPath/dropboxName fields), but DestinationForm.tsx (Group D2) is now
// the only way to create any destination, so that path is gone (Group D4
// per docs/CURRENT-WORK.md).
function parseSendBody(body: unknown): SendRequestBody {
  if (typeof body !== 'object' || body === null) throw new BadRequestError('Expected a JSON body')
  const { text, destinationId, localDate, localTime } = body as Record<string, unknown>
  if (typeof text !== 'string' || text.trim() === '') {
    throw new BadRequestError('"text" is required')
  }
  if (typeof destinationId !== 'string' || !destinationId) {
    throw new BadRequestError('"destinationId" is required')
  }
  return {
    text,
    destinationId,
    ...(typeof localDate === 'string' && localDate ? { localDate } : {}),
    ...(typeof localTime === 'string' && localTime ? { localTime } : {}),
  }
}

// A loose but useful check, not full RFC 5322 validation -- catches the
// obviously-wrong inputs without rejecting anything a real address could be.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requireShortLabel(shortLabel: unknown): string {
  if (typeof shortLabel !== 'string' || shortLabel.trim() === '') {
    throw new BadRequestError('"shortLabel" is required')
  }
  return shortLabel.trim()
}

type CreateDestinationBody =
  | { type: 'email'; address: string; shortLabel: string; emailSubjectLabel?: string }
  | { type: 'google-doc'; docId: string; docName: string; shortLabel: string }
  | { type: 'dropbox-file'; path: string; name: string; shortLabel: string }

// POST /api/destinations -- creates a destination directly, decoupled from
// sending; /api/send below only ever sends to an existing destinationId now
// (see docs/CURRENT-WORK.md's Group D4).
function parseCreateDestinationBody(body: unknown): CreateDestinationBody {
  if (typeof body !== 'object' || body === null) throw new BadRequestError('Expected a JSON body')
  const { type, address, shortLabel, emailSubjectLabel, docId, docName, path, name } =
    body as Record<string, unknown>

  if (type === 'email') {
    if (typeof address !== 'string' || !EMAIL_FORMAT.test(address.trim())) {
      throw new BadRequestError('"address" must be a valid email address')
    }
    const trimmedSubjectLabel =
      typeof emailSubjectLabel === 'string' && emailSubjectLabel.trim() !== ''
        ? emailSubjectLabel.trim()
        : undefined
    return {
      type: 'email',
      address: address.trim(),
      shortLabel: requireShortLabel(shortLabel),
      emailSubjectLabel: trimmedSubjectLabel,
    }
  }
  if (type === 'google-doc') {
    if (typeof docId !== 'string' || !docId) throw new BadRequestError('"docId" is required')
    if (typeof docName !== 'string' || !docName) throw new BadRequestError('"docName" is required')
    return { type: 'google-doc', docId, docName, shortLabel: requireShortLabel(shortLabel) }
  }
  if (type === 'dropbox-file') {
    if (typeof path !== 'string' || !path) throw new BadRequestError('"path" is required')
    if (typeof name !== 'string' || !name) throw new BadRequestError('"name" is required')
    return { type: 'dropbox-file', path, name, shortLabel: requireShortLabel(shortLabel) }
  }
  throw new BadRequestError('"type" must be "email", "google-doc", or "dropbox-file"')
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

    if (url.pathname === '/api/google/disconnect') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed')
        return
      }
      const user = await requireUser(req, res)
      if (!user) return
      disconnectGoogle(user.id)
        .then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        })
        .catch((error: unknown) => {
          console.error('[auth] Google disconnect failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Disconnect failed' }))
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

    if (url.pathname === '/api/dropbox/disconnect') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed')
        return
      }
      const user = await requireUser(req, res)
      if (!user) return
      disconnectDropbox(user.id)
        .then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        })
        .catch((error: unknown) => {
          console.error('[auth] Dropbox disconnect failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Disconnect failed' }))
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

      if (req.method === 'POST') {
        readJsonBody(req)
          .then(async (body) => {
            const parsed = parseCreateDestinationBody(body)
            const destination: Destination =
              parsed.type === 'email'
                ? await saveEmailDestination(
                    user.id,
                    parsed.address,
                    parsed.shortLabel,
                    parsed.emailSubjectLabel,
                  )
                : parsed.type === 'google-doc'
                  ? await saveGoogleDocDestination(
                      user.id,
                      parsed.docId,
                      parsed.docName,
                      parsed.shortLabel,
                    )
                  : await saveDropboxFileDestination(
                      user.id,
                      parsed.path,
                      parsed.name,
                      parsed.shortLabel,
                    )
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, destination }))
          })
          .catch((error: unknown) => {
            if (error instanceof BadRequestError) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: error.message }))
              return
            }
            console.error('[destinations] create failed', error)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Failed to create destination' }))
          })
        return
      }

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

    if (url.pathname.startsWith('/api/destinations/')) {
      if (req.method !== 'DELETE') {
        res.writeHead(405, { 'Content-Type': 'text/plain' }).end('Method not allowed')
        return
      }
      const user = await requireUser(req, res)
      if (!user) return
      const id = decodeURIComponent(url.pathname.slice('/api/destinations/'.length))
      deleteDestination(user.id, id)
        .then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        })
        .catch((error: unknown) => {
          console.error('[destinations] delete failed', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Failed to delete destination' }))
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
          const destination = await getDestination(user.id, parsed.destinationId)
          if (!destination) throw new NotFoundError(`No destination "${parsed.destinationId}"`)

          switch (destination.type) {
            case 'google-doc':
              await appendTextToDoc(user.id, destination.docId, parsed.text)
              break
            case 'dropbox-file':
              await appendTextToDropboxFile(user.id, destination.path, parsed.text)
              break
            case 'email': {
              if (!parsed.localDate || !parsed.localTime) {
                throw new BadRequestError(
                  '"localDate" and "localTime" are required to send to an email destination',
                )
              }
              const seq = await nextEmailSequenceNumber(destination.id, parsed.localDate)
              const subject = `${destination.emailSubjectLabel || destination.shortLabel} ${parsed.localTime} ${seq}`
              await sendEmail(user.id, destination.address, subject, parsed.text)
              break
            }
          }
          await appendSendLogEntry(user.id, {
            destinationId: destination.id,
            docName: destination.shortLabel,
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
