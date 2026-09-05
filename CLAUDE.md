# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Dispatch Desk is a text editor that behaves like a desktop: type freely into one single shared
document, then later dispatch selected text out to a configured destination (email, cloud storage,
a data store, ...). See `docs/REQUIREMENTS.md` for the full, current set of decisions and
`docs/PLATFORM-ARCHITECTURE.md` / `docs/PLATFORM-COMPONENTS.md` for the architecture; `docs/IDEAS.md`
for what's deferred rather than decided.

Two packages (npm workspaces), deployed together as one Fly.io app:

- `client/` — React + Vite + TypeScript. The desktop UI; binds a `<textarea>` to a shared Yjs
  `Y.Text` over WebSocket (`src/lib/desktopDoc.ts`, `src/lib/useDesktopText.ts`).
- `server/` — Node.js + TypeScript. Serves the built client as static files, runs the Sync Server
  (`src/syncServer.ts` — hand-rolled Yjs sync protocol over `ws`, since destinations are
  remote-HTTP-only and there's no local stdio process to spawn) and persists the desktop's CRDT
  state to Redis (`src/redis.ts`, Upstash). The MCP Host (destinations) isn't built yet — see
  `docs/REQUIREMENTS.md`'s Destination Architecture section for the design.

## Commands

Run from the repo root (npm workspaces):

- `npm install` — install both packages' dependencies
- `npm run dev:client` — Vite dev server with HMR (proxies `/sync` to the standalone Sync Server —
  see `client/vite.config.ts`)
- `npm run dev:server` — Sync Server alone, via `tsx watch` (needs `server/.env`, see
  `server/.env.example`; without Redis credentials it runs with no persistence and warns)
- `npm run build` — production build of both (client's Vite build, then the server's `tsc`)
- `npm run start` — run the built server (serves the built client + `/sync`; needs `npm run build`
  first)
- `npm test` — run both packages' test suites once
- `npm run lint` — Oxlint, both packages

Per-package (run from `client/` or `server/`): the same `dev`/`build`/`test`/`lint` scripts, plus
`test:watch` in `client/`.

Local dev runs the two pieces as **separate processes** (the client's Vite dev server, and the
standalone Sync Server) since Vite's dev server doesn't serve the server's build output; production
is the single combined process described above.

## Workflow

Solo project — commit and push directly to `main`, no feature branches or PRs unless explicitly
asked. Before implementing anything framed as "we need to do X," explain your understanding and
present options first, then wait for direction. Once implemented: run tests + lint + build, report
what changed, then ask before committing/pushing — never commit unprompted (mirrors
`docs/CURRENT-WORK.md`'s rules, carried over from `fairstream-platform/CLAUDE.md`'s conventions).

## Deployment

Single Fly.io app (`fly.toml`), built via the root `Dockerfile` (multi-stage: builds both packages,
runs the server). Needs `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` set as Fly secrets for
persistence. `min_machines_running = 1` / `auto_stop_machines = false` are deliberate — the Sync
Server holds the desktop's live state in memory between debounced Redis writes, so scale-to-zero
would risk losing whatever hadn't been persisted yet.

## Docs

- `docs/REQUIREMENTS.md` — living requirements doc; the source of truth for what's actually decided.
- `docs/IDEAS.md` — deferred/open ideas (e.g. `[later]` items) not yet in scope.
- `docs/PLATFORM-OVERVIEW.md`, `docs/PLATFORM-COMPONENTS.md`, `docs/PLATFORM-ARCHITECTURE.md` —
  narrative overview, per-component detail, and the components/connections view.
- `docs/CURRENT-WORK.md` — scratch file for whatever multi-group implementation plan is active;
  empty when nothing is in flight.
