import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveStatic } from './staticFiles.js'

describe('serveStatic', () => {
  let dir: string
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dispatch-desk-static-'))
    await writeFile(join(dir, 'index.html'), '<h1>desktop</h1>')
    await writeFile(join(dir, 'app.js'), 'console.log("hi")')
    await mkdir(join(dir, 'assets'), { recursive: true })
    await writeFile(join(dir, 'assets', 'index-abc123.js'), 'console.log("hashed")')

    server = createServer(serveStatic(dir))
    await new Promise<void>((resolveReady) => server.listen(0, resolveReady))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise((resolveClosed) => server.close(resolveClosed))
    await rm(dir, { recursive: true, force: true })
  })

  it('serves an existing file with the right content type', async () => {
    const response = await fetch(`${baseUrl}/app.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/javascript')
    expect(await response.text()).toBe('console.log("hi")')
  })

  it('falls back to index.html for an unknown path (SPA routing)', async () => {
    const response = await fetch(`${baseUrl}/some/client/route`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<h1>desktop</h1>')
  })

  it('tells browsers never to cache index.html (so a redeploy is seen on refresh)', async () => {
    const response = await fetch(`${baseUrl}/index.html`)
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('tells browsers to cache hashed assets forever (filename changes if content does)', async () => {
    const response = await fetch(`${baseUrl}/assets/index-abc123.js`)
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('does not escape rootDir via ..', async () => {
    const response = await fetch(`${baseUrl}/../../../etc/passwd`)
    // Either normalized back inside rootDir (falls back to index.html) or
    // rejected -- never a 200 serving something outside `dir`.
    if (response.status === 200) {
      expect(await response.text()).toBe('<h1>desktop</h1>')
    }
  })
})
