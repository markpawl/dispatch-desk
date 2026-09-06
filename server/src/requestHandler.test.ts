import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthUrl: vi.fn(() => 'https://accounts.google.com/mock-consent-screen'),
  handleCallback: vi.fn(async (_code: string) => undefined),
  isGoogleConnected: vi.fn(async () => false),
}))
vi.mock('./googleAuth.js', () => mocks)

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

  it('falls back to serving the client for any other path', async () => {
    const response = await fetch(`${baseUrl}/some/client/route`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<h1>desktop</h1>')
  })
})
