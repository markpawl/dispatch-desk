import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthUrl: vi.fn(() => 'https://accounts.google.com/mock-consent-screen'),
  handleCallback: vi.fn(async (_code: string) => undefined),
  isGoogleConnected: vi.fn(async () => false),
  searchGoogleDocs: vi.fn(async (_query: string) => [{ id: 'doc-1', name: 'Meeting Notes' }]),
  appendTextToDoc: vi.fn(async (_docId: string, _text: string) => undefined),
  listDestinations: vi.fn(async () => [
    { id: 'dest-1', type: 'google-doc' as const, docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' },
  ]),
  getDestination: vi.fn(async (id: string) =>
    id === 'dest-1'
      ? { id: 'dest-1', type: 'google-doc' as const, docId: 'doc-1', docName: 'Meeting Notes', createdAt: 'now' }
      : undefined,
  ),
  saveGoogleDocDestination: vi.fn(async (docId: string, docName: string) => ({
    id: 'dest-new',
    type: 'google-doc' as const,
    docId,
    docName,
    createdAt: 'now',
  })),
  appendSendLogEntry: vi.fn(async () => undefined),
}))
vi.mock('./googleAuth.js', () => mocks)
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
}))
vi.mock('./sendLog.js', () => ({
  appendSendLogEntry: mocks.appendSendLogEntry,
  truncateForPreview: (text: string) => text,
}))

const { createRequestHandler } = await import('./requestHandler.js')

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

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GET /healthz reports ok', async () => {
    const response = await fetch(`${baseUrl}/healthz`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok' })
  })

  it('GET /auth/google redirects to the Google consent URL', async () => {
    const response = await fetch(`${baseUrl}/auth/google`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://accounts.google.com/mock-consent-screen')
  })

  it('GET /auth/google returns 500 if building the auth URL throws (e.g. env vars unset)', async () => {
    mocks.getAuthUrl.mockImplementationOnce(() => {
      throw new Error('GOOGLE_CLIENT_ID is not set')
    })
    const response = await fetch(`${baseUrl}/auth/google`, { redirect: 'manual' })
    expect(response.status).toBe(500)
  })

  it('GET /auth/google/callback exchanges the code and redirects home', async () => {
    const response = await fetch(`${baseUrl}/auth/google/callback?code=abc123`, {
      redirect: 'manual',
    })
    expect(mocks.handleCallback).toHaveBeenCalledWith('abc123')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

  it('GET /auth/google/callback without a code is a 400', async () => {
    const response = await fetch(`${baseUrl}/auth/google/callback`)
    expect(response.status).toBe(400)
    expect(mocks.handleCallback).not.toHaveBeenCalled()
  })

  it('GET /auth/google/callback returns 500 if the exchange fails', async () => {
    mocks.handleCallback.mockRejectedValueOnce(new Error('invalid_grant'))
    const response = await fetch(`${baseUrl}/auth/google/callback?code=bad`)
    expect(response.status).toBe(500)
  })

  it('GET /api/google/status reflects isGoogleConnected()', async () => {
    mocks.isGoogleConnected.mockResolvedValueOnce(true)
    const response = await fetch(`${baseUrl}/api/google/status`)
    expect(await response.json()).toEqual({ connected: true })
  })

  it('GET /api/google-docs/search returns matching docs', async () => {
    const response = await fetch(`${baseUrl}/api/google-docs/search?q=Meeting`)
    expect(mocks.searchGoogleDocs).toHaveBeenCalledWith('Meeting')
    expect(await response.json()).toEqual({ docs: [{ id: 'doc-1', name: 'Meeting Notes' }] })
  })

  it('GET /api/google-docs/search defaults to an empty query when q is omitted', async () => {
    await fetch(`${baseUrl}/api/google-docs/search`)
    expect(mocks.searchGoogleDocs).toHaveBeenCalledWith('')
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
      expect(mocks.appendTextToDoc).toHaveBeenCalledWith('doc-1', 'hello world')
      expect(mocks.saveGoogleDocDestination).toHaveBeenCalledWith('doc-1', 'Meeting Notes')
      expect(mocks.appendSendLogEntry).toHaveBeenCalledWith(
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
      expect(mocks.appendTextToDoc).toHaveBeenCalledWith('doc-2', 'hi')
      expect(mocks.saveGoogleDocDestination).toHaveBeenCalledWith('doc-2', 'Journal')
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
