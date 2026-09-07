import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // Stand-ins for the real error classes requestHandler does `instanceof` on:
  // the check compares against the class it imports from the mocked module, so
  // tests must throw *these*.
  class EmailNotAllowedError extends Error {}
  class DropboxNotConnectedError extends Error {}
  return {
  getAuthUrl: vi.fn(() => 'https://accounts.google.com/mock-consent-screen'),
  handleCallback: vi.fn(async (_userId: string, _code: string) => undefined),
  getLoginAuthUrl: vi.fn(() => 'https://accounts.google.com/mock-login-screen'),
  handleLoginCallback: vi.fn(async (_code: string) => ({ token: 'sess-token-123' })),
  EmailNotAllowedError,
  isGoogleConnected: vi.fn(async (_userId: string) => false),
  getSessionUser: vi.fn(async () => null as { id: string; email: string; name: string } | null),
  getSessionCookieToken: vi.fn(() => undefined as string | undefined),
  destroySession: vi.fn(async (_token: string) => undefined),
  searchGoogleDocs: vi.fn(async (_userId: string, _query: string) => [
    { id: 'doc-1', name: 'Meeting Notes' },
  ]),
  appendTextToDoc: vi.fn(async (_userId: string, _docId: string, _text: string) => undefined),
  listDestinations: vi.fn(async (_userId: string) => [
    { id: 'dest-1', type: 'google-doc' as const, docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' },
  ]),
  getDestination: vi.fn(async (_userId: string, id: string) =>
    id === 'dest-1'
      ? { id: 'dest-1', type: 'google-doc' as const, docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' }
      : undefined,
  ),
  saveGoogleDocDestination: vi.fn(async (_userId: string, docId: string, docName: string) => ({
    id: 'dest-new',
    type: 'google-doc' as const,
    docId,
    docName,
    createdAt: 'now',
  })),
  saveDropboxFileDestination: vi.fn(async (_userId: string, path: string, name: string) => ({
    id: 'dest-dbx',
    type: 'dropbox-file' as const,
    path,
    name,
    createdAt: 'now',
  })),
  appendSendLogEntry: vi.fn(async (_userId: string) => undefined),
  DropboxNotConnectedError,
  getDropboxAuthUrl: vi.fn(async () => 'https://www.dropbox.com/mock-consent-screen'),
  handleDropboxCallback: vi.fn(async (_userId: string, _code: string) => undefined),
  isDropboxConnected: vi.fn(async (_userId: string) => false),
  searchDropboxFiles: vi.fn(async (_userId: string, _query: string) => [
    { path: '/notes.txt', name: 'notes.txt' },
  ]),
  appendTextToDropboxFile: vi.fn(
    async (_userId: string, _path: string, _text: string) => undefined,
  ),
  }
})

const SIGNED_IN_USER = { id: 'user-1', email: 'ada@example.com', name: 'Ada' }
vi.mock('./googleAuth.js', () => ({
  getAuthUrl: mocks.getAuthUrl,
  handleCallback: mocks.handleCallback,
  getLoginAuthUrl: mocks.getLoginAuthUrl,
  handleLoginCallback: mocks.handleLoginCallback,
  EmailNotAllowedError: mocks.EmailNotAllowedError,
  isGoogleConnected: mocks.isGoogleConnected,
}))
vi.mock('./session.js', () => ({
  getSessionUser: mocks.getSessionUser,
  getSessionCookieToken: mocks.getSessionCookieToken,
  destroySession: mocks.destroySession,
  serializeSessionCookie: (token: string) => `session=${token}; HttpOnly; SameSite=Lax; Path=/`,
  clearSessionCookie: () => 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
}))
// Keep the real GoogleNotConnectedError class (requestHandler.ts checks
// `instanceof` on it) while mocking the actual search/append calls.
vi.mock('./googleDocs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./googleDocs.js')>()),
  searchGoogleDocs: mocks.searchGoogleDocs,
  appendTextToDoc: mocks.appendTextToDoc,
}))
vi.mock('./destinations.js', () => ({
  listDestinations: mocks.listDestinations,
  getDestination: mocks.getDestination,
  saveGoogleDocDestination: mocks.saveGoogleDocDestination,
  saveDropboxFileDestination: mocks.saveDropboxFileDestination,
}))
vi.mock('./dropboxAuth.js', () => ({
  getDropboxAuthUrl: mocks.getDropboxAuthUrl,
  handleDropboxCallback: mocks.handleDropboxCallback,
  isDropboxConnected: mocks.isDropboxConnected,
}))
vi.mock('./dropboxFiles.js', () => ({
  DropboxNotConnectedError: mocks.DropboxNotConnectedError,
  searchDropboxFiles: mocks.searchDropboxFiles,
  appendTextToDropboxFile: mocks.appendTextToDropboxFile,
}))
vi.mock('./sendLog.js', () => ({
  appendSendLogEntry: mocks.appendSendLogEntry,
  truncateForPreview: (text: string) => text,
}))

const { createRequestHandler, requireUser } = await import('./requestHandler.js')

describe('requestHandler', () => {
  let dir: string
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dispatch-desk-request-handler-'))
    await writeFile(join(dir, 'index.html'), '<h1>desktop</h1>')

    server = createServer(createRequestHandler(dir))
    await new Promise<void>((resolveReady) => server.listen(0, resolveReady))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise((resolveClosed) => server.close(resolveClosed))
    await rm(dir, { recursive: true, force: true })
  })

  beforeEach(() => {
    // Signed in by default; individual tests override with
    // mockResolvedValueOnce(null) to exercise the signed-out path.
    mocks.getSessionUser.mockResolvedValue(SIGNED_IN_USER)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GET /healthz reports ok', async () => {
    const response = await fetch(`${baseUrl}/healthz`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok' })
  })

  describe('login (sign in to Dispatch Desk)', () => {
    it('GET /auth/login/google redirects to the Google login consent URL', async () => {
      const response = await fetch(`${baseUrl}/auth/login/google`, { redirect: 'manual' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('https://accounts.google.com/mock-login-screen')
    })

    it('GET /auth/login/google returns 500 if building the URL throws', async () => {
      mocks.getLoginAuthUrl.mockImplementationOnce(() => {
        throw new Error('GOOGLE_CLIENT_ID is not set')
      })
      const response = await fetch(`${baseUrl}/auth/login/google`, { redirect: 'manual' })
      expect(response.status).toBe(500)
    })

    it('callback exchanges the code, sets the session cookie, and redirects home', async () => {
      const response = await fetch(`${baseUrl}/auth/login/google/callback?code=login-code`, {
        redirect: 'manual',
      })
      expect(mocks.handleLoginCallback).toHaveBeenCalledWith('login-code')
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/')
      expect(response.headers.get('set-cookie')).toContain('session=sess-token-123')
    })

    it('callback without a code is a 400', async () => {
      const response = await fetch(`${baseUrl}/auth/login/google/callback`)
      expect(response.status).toBe(400)
      expect(mocks.handleLoginCallback).not.toHaveBeenCalled()
    })

    it('callback is a 403 when the email is not on the allowlist', async () => {
      mocks.handleLoginCallback.mockRejectedValueOnce(new mocks.EmailNotAllowedError('x@y.com'))
      const response = await fetch(`${baseUrl}/auth/login/google/callback?code=nope`, {
        redirect: 'manual',
      })
      expect(response.status).toBe(403)
      expect(response.headers.get('set-cookie')).toBeNull()
    })

    it('callback is a 500 on any other failure', async () => {
      mocks.handleLoginCallback.mockRejectedValueOnce(new Error('invalid_grant'))
      const response = await fetch(`${baseUrl}/auth/login/google/callback?code=bad`)
      expect(response.status).toBe(500)
    })
  })

  describe('POST /auth/logout', () => {
    it('destroys the session named by the cookie and clears it', async () => {
      mocks.getSessionCookieToken.mockReturnValueOnce('tok-abc')
      const response = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' })
      expect(response.status).toBe(200)
      expect(mocks.destroySession).toHaveBeenCalledWith('tok-abc')
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    })

    it('is a no-op 200 when there is no session cookie', async () => {
      const response = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' })
      expect(response.status).toBe(200)
      expect(mocks.destroySession).not.toHaveBeenCalled()
    })

    it('405s on GET', async () => {
      const response = await fetch(`${baseUrl}/auth/logout`)
      expect(response.status).toBe(405)
    })
  })

  describe('GET /api/me', () => {
    it('returns the signed-in user (id/email/name only)', async () => {
      mocks.getSessionUser.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', name: 'Ada' })
      const response = await fetch(`${baseUrl}/api/me`)
      expect(await response.json()).toEqual({ user: { id: 'u1', email: 'a@b.com', name: 'Ada' } })
    })

    it('returns {user: null} when not signed in', async () => {
      mocks.getSessionUser.mockResolvedValueOnce(null)
      const response = await fetch(`${baseUrl}/api/me`)
      expect(await response.json()).toEqual({ user: null })
    })
  })

  describe('requires a session', () => {
    // requireUser writes the 401 itself; each protected route just bails.
    it.each([
      ['GET', '/auth/connect/google'],
      ['GET', '/auth/connect/google/callback?code=x'],
      ['GET', '/api/google/status'],
      ['GET', '/api/google-docs/search?q=x'],
      ['GET', '/auth/connect/dropbox'],
      ['GET', '/auth/connect/dropbox/callback?code=x'],
      ['GET', '/api/dropbox/status'],
      ['GET', '/api/dropbox/search?q=x'],
      ['GET', '/api/destinations'],
      ['POST', '/api/send'],
    ])('%s %s is 401 when signed out', async (method, path) => {
      mocks.getSessionUser.mockResolvedValueOnce(null)
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        redirect: 'manual',
        ...(method === 'POST'
          ? { body: JSON.stringify({ text: 'x', destinationId: 'dest-1' }) }
          : {}),
      })
      expect(response.status).toBe(401)
    })

    it('does not touch per-user data when signed out', async () => {
      mocks.getSessionUser.mockResolvedValue(null)
      await fetch(`${baseUrl}/api/destinations`)
      await fetch(`${baseUrl}/api/google/status`)
      expect(mocks.listDestinations).not.toHaveBeenCalled()
      expect(mocks.isGoogleConnected).not.toHaveBeenCalled()
    })
  })

  it('GET /auth/connect/google redirects to the Google consent URL', async () => {
    const response = await fetch(`${baseUrl}/auth/connect/google`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://accounts.google.com/mock-consent-screen')
  })

  it('GET /auth/connect/google returns 500 if building the auth URL throws (e.g. env vars unset)', async () => {
    mocks.getAuthUrl.mockImplementationOnce(() => {
      throw new Error('GOOGLE_CLIENT_ID is not set')
    })
    const response = await fetch(`${baseUrl}/auth/connect/google`, { redirect: 'manual' })
    expect(response.status).toBe(500)
  })

  it('GET /auth/connect/google/callback exchanges the code and redirects home', async () => {
    const response = await fetch(`${baseUrl}/auth/connect/google/callback?code=abc123`, {
      redirect: 'manual',
    })
    expect(mocks.handleCallback).toHaveBeenCalledWith('user-1', 'abc123')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

  it('GET /auth/connect/google/callback without a code is a 400', async () => {
    const response = await fetch(`${baseUrl}/auth/connect/google/callback`)
    expect(response.status).toBe(400)
    expect(mocks.handleCallback).not.toHaveBeenCalled()
  })

  it('GET /auth/connect/google/callback returns 500 if the exchange fails', async () => {
    mocks.handleCallback.mockRejectedValueOnce(new Error('invalid_grant'))
    const response = await fetch(`${baseUrl}/auth/connect/google/callback?code=bad`)
    expect(response.status).toBe(500)
  })

  it('GET /api/google/status reflects isGoogleConnected()', async () => {
    mocks.isGoogleConnected.mockResolvedValueOnce(true)
    const response = await fetch(`${baseUrl}/api/google/status`)
    expect(await response.json()).toEqual({ connected: true })
  })

  it('GET /api/google-docs/search returns matching docs', async () => {
    const response = await fetch(`${baseUrl}/api/google-docs/search?q=Meeting`)
    expect(mocks.searchGoogleDocs).toHaveBeenCalledWith('user-1', 'Meeting')
    expect(await response.json()).toEqual({ docs: [{ id: 'doc-1', name: 'Meeting Notes' }] })
  })

  it('GET /api/google-docs/search defaults to an empty query when q is omitted', async () => {
    await fetch(`${baseUrl}/api/google-docs/search`)
    expect(mocks.searchGoogleDocs).toHaveBeenCalledWith('user-1', '')
  })

  it('GET /api/google-docs/search is a 401 when Google is not connected', async () => {
    const { GoogleNotConnectedError } = await import('./googleDocs.js')
    mocks.searchGoogleDocs.mockRejectedValueOnce(new GoogleNotConnectedError())
    const response = await fetch(`${baseUrl}/api/google-docs/search?q=x`)
    expect(response.status).toBe(401)
  })

  it('GET /api/google-docs/search is a 500 on any other failure', async () => {
    mocks.searchGoogleDocs.mockRejectedValueOnce(new Error('Drive API is down'))
    const response = await fetch(`${baseUrl}/api/google-docs/search?q=x`)
    expect(response.status).toBe(500)
  })

  describe('Dropbox connect + search', () => {
    it('GET /auth/connect/dropbox redirects to the Dropbox consent URL', async () => {
      const response = await fetch(`${baseUrl}/auth/connect/dropbox`, { redirect: 'manual' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('https://www.dropbox.com/mock-consent-screen')
    })

    it('GET /auth/connect/dropbox is 500 if building the URL rejects', async () => {
      mocks.getDropboxAuthUrl.mockRejectedValueOnce(new Error('DROPBOX_APP_KEY is not set'))
      const response = await fetch(`${baseUrl}/auth/connect/dropbox`, { redirect: 'manual' })
      expect(response.status).toBe(500)
    })

    it('GET /auth/connect/dropbox/callback exchanges the code and redirects home', async () => {
      const response = await fetch(`${baseUrl}/auth/connect/dropbox/callback?code=dbx-code`, {
        redirect: 'manual',
      })
      expect(mocks.handleDropboxCallback).toHaveBeenCalledWith('user-1', 'dbx-code')
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/')
    })

    it('GET /auth/connect/dropbox/callback without a code is a 400', async () => {
      const response = await fetch(`${baseUrl}/auth/connect/dropbox/callback`)
      expect(response.status).toBe(400)
      expect(mocks.handleDropboxCallback).not.toHaveBeenCalled()
    })

    it('GET /api/dropbox/status reflects isDropboxConnected()', async () => {
      mocks.isDropboxConnected.mockResolvedValueOnce(true)
      const response = await fetch(`${baseUrl}/api/dropbox/status`)
      expect(await response.json()).toEqual({ connected: true })
    })

    it('GET /api/dropbox/search returns matching files', async () => {
      const response = await fetch(`${baseUrl}/api/dropbox/search?q=notes`)
      expect(mocks.searchDropboxFiles).toHaveBeenCalledWith('user-1', 'notes')
      expect(await response.json()).toEqual({ files: [{ path: '/notes.txt', name: 'notes.txt' }] })
    })

    it('GET /api/dropbox/search is a 401 when Dropbox is not connected', async () => {
      mocks.searchDropboxFiles.mockRejectedValueOnce(new mocks.DropboxNotConnectedError())
      const response = await fetch(`${baseUrl}/api/dropbox/search?q=x`)
      expect(response.status).toBe(401)
    })
  })

  it('GET /api/destinations lists saved destinations', async () => {
    const response = await fetch(`${baseUrl}/api/destinations`)
    expect(await response.json()).toEqual({
      destinations: [
        { id: 'dest-1', type: 'google-doc', docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' },
      ],
    })
  })

  describe('POST /api/send', () => {
    it('sends to an existing destinationId: appends, upserts, logs', async () => {
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ text: 'hello world', destinationId: 'dest-1' }),
      })
      expect(mocks.appendTextToDoc).toHaveBeenCalledWith('user-1', 'doc-1', 'hello world')
      expect(mocks.saveGoogleDocDestination).toHaveBeenCalledWith('user-1', 'doc-1', 'Meeting Notes')
      expect(mocks.appendSendLogEntry).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ docName: 'Meeting Notes', textPreview: 'hello world' }),
      )
      const body = (await response.json()) as { ok: boolean; destination: { docId: string } }
      expect(body.ok).toBe(true)
      expect(body.destination.docId).toBe('doc-1')
    })

    it('sends to an ad-hoc docId/docName, saving it as a new destination', async () => {
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ text: 'hi', docId: 'doc-2', docName: 'Journal' }),
      })
      expect(mocks.appendTextToDoc).toHaveBeenCalledWith('user-1', 'doc-2', 'hi')
      expect(mocks.saveGoogleDocDestination).toHaveBeenCalledWith('user-1', 'doc-2', 'Journal')
      expect(response.status).toBe(200)
    })

    it('sends to an ad-hoc Dropbox file, appending and saving it', async () => {
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ text: 'note', dropboxPath: '/journal.md', dropboxName: 'journal.md' }),
      })
      expect(mocks.appendTextToDropboxFile).toHaveBeenCalledWith('user-1', '/journal.md', 'note')
      expect(mocks.saveDropboxFileDestination).toHaveBeenCalledWith(
        'user-1',
        '/journal.md',
        'journal.md',
      )
      expect(mocks.appendSendLogEntry).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ docName: 'journal.md', textPreview: 'note' }),
      )
      expect(mocks.appendTextToDoc).not.toHaveBeenCalled()
      expect(response.status).toBe(200)
    })

    it('sends to a saved dropbox-file destinationId', async () => {
      mocks.getDestination.mockResolvedValueOnce({
        id: 'dest-1',
        type: 'dropbox-file' as const,
        path: '/saved.txt',
        name: 'saved.txt',
        createdAt: 'now',
      })
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ text: 'x', destinationId: 'dest-1' }),
      })
      expect(mocks.appendTextToDropboxFile).toHaveBeenCalledWith('user-1', '/saved.txt', 'x')
      expect(response.status).toBe(200)
    })

    it('400s when text is missing', async () => {
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'dest-1' }),
      })
      expect(response.status).toBe(400)
      expect(mocks.appendTextToDoc).not.toHaveBeenCalled()
    })

    it('400s when neither destinationId nor docId/docName are given', async () => {
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ text: 'hello' }),
      })
      expect(response.status).toBe(400)
    })

    it('404s for an unknown destinationId', async () => {
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ text: 'hello', destinationId: 'does-not-exist' }),
      })
      expect(response.status).toBe(404)
      expect(mocks.appendTextToDoc).not.toHaveBeenCalled()
    })

    it('401s when Google is not connected', async () => {
      const { GoogleNotConnectedError } = await import('./googleDocs.js')
      mocks.appendTextToDoc.mockRejectedValueOnce(new GoogleNotConnectedError())
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ text: 'hello', destinationId: 'dest-1' }),
      })
      expect(response.status).toBe(401)
    })

    it('500s on any other failure', async () => {
      mocks.appendTextToDoc.mockRejectedValueOnce(new Error('Docs API is down'))
      const response = await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        body: JSON.stringify({ text: 'hello', destinationId: 'dest-1' }),
      })
      expect(response.status).toBe(500)
    })

    it('405s on GET', async () => {
      const response = await fetch(`${baseUrl}/api/send`)
      expect(response.status).toBe(405)
    })
  })

  it('falls back to serving the client for any other path', async () => {
    const response = await fetch(`${baseUrl}/some/client/route`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<h1>desktop</h1>')
  })
})

// The guard every per-user route leans on -- exercised directly here as well
// as through the routes above.
describe('requireUser', () => {
  function fakeRes() {
    const res = {
      statusCode: 0,
      body: '',
      writeHead(status: number) {
        this.statusCode = status
        return this
      },
      end(chunk?: string) {
        if (chunk) this.body = chunk
      },
    }
    return res
  }

  beforeEach(() => {
    mocks.getSessionUser.mockReset()
  })

  afterEach(() => vi.clearAllMocks())

  it('returns the user when a session resolves', async () => {
    mocks.getSessionUser.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', name: 'Ada' })
    const res = fakeRes()
    const user = await requireUser({} as never, res as never)
    expect(user).toMatchObject({ id: 'u1' })
    expect(res.statusCode).toBe(0)
  })

  it('writes a 401 and returns null when there is no session', async () => {
    mocks.getSessionUser.mockResolvedValueOnce(null)
    const res = fakeRes()
    const user = await requireUser({} as never, res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('fails closed (401) when the session lookup throws', async () => {
    mocks.getSessionUser.mockRejectedValueOnce(new Error('redis down'))
    const res = fakeRes()
    const user = await requireUser({} as never, res as never)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })
})
