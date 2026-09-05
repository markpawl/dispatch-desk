import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { serveStatic } from './staticFiles.js'
import { handleUpgrade, waitUntilReady } from './syncServer.js'

const PORT = Number(process.env.PORT ?? process.env.SYNC_SERVER_PORT ?? 8787)
// In the deployed container this is the client build copied alongside the
// server (see ../Dockerfile); in local dev it's the sibling package's own
// `vite build` output.
const CLIENT_DIST_DIR = resolve(process.env.CLIENT_DIST_DIR ?? '../client/dist')

const serveClient = serveStatic(CLIENT_DIST_DIR)

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }
  serveClient(req, res)
})

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/sync')) {
    handleUpgrade(req, socket, head)
  } else {
    socket.destroy()
  }
})

await waitUntilReady()
server.listen(PORT, () => {
  console.log(`[dispatch-desk] listening on :${PORT} (serving client from ${CLIENT_DIST_DIR})`)
})
