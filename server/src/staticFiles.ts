import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

// Serves the built React client (client/dist) as static files, falling back
// to index.html for any path that isn't an actual file -- the client is a
// single-page app, so client-side routes (once there are any) need to load
// index.html too.
export function serveStatic(rootDir: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let path = normalize(join(rootDir, url.pathname))
    if (!path.startsWith(normalize(rootDir))) path = rootDir // guard against '..' escaping rootDir

    if (!existsSync(path) || statSync(path).isDirectory()) {
      path = join(rootDir, 'index.html')
    }

    if (!existsSync(path)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
      return
    }

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(path)] ?? 'application/octet-stream',
      // No caching directives at all leaves browsers free to apply their own
      // heuristics on a plain refresh (not a hard refresh) and keep serving
      // an old index.html/bundle straight from disk cache after a redeploy
      // -- which is exactly what index.html must never do, since it's what
      // points at whichever hashed JS/CSS bundle is actually current.
      // Vite's hashed asset filenames (dist/assets/*) are the opposite case:
      // safe to cache forever, since any content change gets a new filename.
      'Cache-Control': path.includes(`${sep}assets${sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    })
    createReadStream(path).pipe(res)
  }
}
