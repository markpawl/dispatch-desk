import type { IncomingMessage, ServerResponse } from 'node:http'
import { getAuthUrl, handleCallback, isGoogleConnected } from './googleAuth.js'
import { GoogleNotConnectedError, searchGoogleDocs } from './googleDocs.js'
import { serveStatic } from './staticFiles.js'
import { BUILD_TIMESTAMP } from './version.js'

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

    if (url.pathname === '/auth/google') {
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

    if (url.pathname === '/auth/google/callback') {
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

    serveClient(req, res)
  }
}
