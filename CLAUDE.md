# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Dispatch Desk is a text editor that behaves like a desktop: type freely into one single shared
document, then later dispatch selected text out to a configured destination (email, cloud storage,
a data store, ...). See `docs/REQUIREMENTS.md` for the full, current set of decisions and
`docs/PLATFORM-ARCHITECTURE.md` / `docs/PLATFORM-COMPONENTS.md` for the architecture; `docs/IDEAS.md`
for what's deferred rather than decided.

Two packages (npm workspaces), deployed together as one Railway service:

- `client/` — React + Vite + TypeScript. The desktop UI; a Tiptap rich-text editor
  (`src/components/EditorToolbar.tsx`) bound to a shared Yjs `Y.XmlFragment` over WebSocket
  (`src/lib/desktopDoc.ts`).
- `server/` — Node.js + TypeScript. Serves the built client as static files, runs the Sync Server
  (`src/syncServer.ts` — hand-rolled Yjs sync protocol over `ws`, since destinations are
  remote-HTTP-only and there's no local stdio process to spawn) and persists the desktop's CRDT
  state to Redis (`src/redis.ts`, via `ioredis`). The MCP Host (destinations) isn't built yet — see
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

**Always work directly on `main`.** This is a solo project: commit and push straight to `main`, no
feature branches, no PRs — unless the user explicitly asks for one in that exact conversation.
Never create or switch to a branch of your own initiative for any reason (grouping a plan's work,
isolating a risky change, mirroring some other repo's convention, etc.) — commit each change to
`main` as it's finished. If a Claude Code session's own environment/tooling assigns or forces a
branch other than `main` outside of this file's control, that's a platform-level constraint this
file cannot override — but it still doesn't authorize choosing a branch on your own in any context
where you do have the choice, and work that lands on a forced non-`main` branch should be merged
into `main` at the first opportunity rather than left there.

Before implementing anything framed as "we need to do X," explain your understanding and present
options first, then wait for direction. Once implemented: run tests + lint + build, report what
changed, then ask before committing/pushing — never commit unprompted (mirrors
`docs/CURRENT-WORK.md`'s rules, carried over from `fairstream-platform/CLAUDE.md`'s conventions).

## Deployment

Single Railway service (`railway.toml`), built via the root `Dockerfile` (multi-stage: builds both
packages, runs the server) — Railway auto-detects and builds from a root `Dockerfile` directly, no
buildpack config needed. Needs `REDIS_URL` set in the service's variables, wired to the project's
Redis plugin (its reference variable, e.g. `REDIS_URL=${{Redis.REDIS_URL}}`) for persistence.
`railway.toml`'s healthcheck hits `/healthz`; the Sync Server holds the desktop's live state in
memory between debounced Redis writes, so the service shouldn't be left to sleep/scale-to-zero
between requests — check Railway's current sleep/idle behavior for whatever plan this project is
on (the equivalent of Fly's `min_machines_running = 1` / `auto_stop_machines = false`, which this
project used before moving off Fly.io).

`fly.toml` and the `dispatch-desk` Fly.io app are still around as a dormant fallback (not actively
deployed to) — remove `fly.toml` once Railway's been running smoothly for a while and the Fly app
is decommissioned.

## Docs

- `docs/REQUIREMENTS.md` — living requirements doc; the source of truth for what's actually decided.
- `docs/IDEAS.md` — deferred/open ideas (e.g. `[later]` items) not yet in scope.
- `docs/PLATFORM-OVERVIEW.md`, `docs/PLATFORM-COMPONENTS.md`, `docs/PLATFORM-ARCHITECTURE.md` —
  narrative overview, per-component detail, and the components/connections view.
- `docs/CURRENT-WORK.md` — scratch file for whatever multi-group implementation plan is active;
  empty when nothing is in flight.
