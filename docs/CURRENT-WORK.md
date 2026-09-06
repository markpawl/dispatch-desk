# CURRENT-WORK.md

Scratch file for whatever multi-group implementation plan is actively in progress. Empty when
nothing is in flight. **The rules below survive every clear-out — never remove them.**

## Rules

1. **Scope**: this file holds exactly one active plan at a time — a numbered feature sequence
   broken into lettered build groups (A, B, C…), easiest→hardest. Don't start a second plan here
   while one is still active; finish or explicitly abandon it first.
2. **Cadence per group** (same as `docs/IDEAS.md`'s workflow):
   - Before implementing a group, its concrete tasks/files must already be listed below — confirm
     with the user rather than re-deriving.
   - Implement only after an explicit approval ("approved" / "go ahead" / "implement").
   - After implementing: run that repo's tests + lint + build, report what changed, then ask
     "do you want me to commit and push?" — never commit unprompted.
   - Check the group's box (and its item boxes) here as `[x]` once committed, with a short
     `_(Done: … files … tests …)_` note, mirroring `docs/IDEAS.md`'s Addressed-item notes.
   - Then ask "move on to the next group?" and wait.
3. **On completion of every group** (all boxes checked):
   - Update the relevant sub-project `REQUIREMENTS.md` (or other planning doc) to reflect what was
     actually built.
   - Re-check `docs/IDEAS.md`'s Pending section for items this plan addressed; move them to
     Addressed with a short note, same as any other addressed idea.
   - Commit and push those doc updates.
   - Only after that lands: clear this file back to just this Rules section, ready for the next
     plan.
4. **Style**: scannable — tables/checkboxes/short bullets, not prose. Match the terse, directional
   tone already established for `docs/IDEAS.md` work.

## Plan: Move hosting from Fly.io to Railway

Railway becomes the primary deploy target; Fly.io's `dispatch-desk` app stays running for now (user's
call, not decommissioned as part of this plan). Decisions: Redis client is `ioredis` (plain
TCP/`REDIS_URL`, replacing `@upstash/redis`'s REST client, which can't talk to Railway's Redis at
all); `fly.toml` stays in the repo as a dormant fallback rather than being deleted.

### Group A — Swap Redis client (Upstash REST -> ioredis/TCP) ✅

- [x] `server/package.json`: remove `@upstash/redis`, add `ioredis` (ships its own types, no
  separate `@types/ioredis` needed).
- [x] `server/src/redis.ts`: rewrite `getClient`/`loadDesktopState`/`persistDesktopState` around
  `ioredis`, reading a single `REDIS_URL` (Railway's injected var) instead of
  `UPSTASH_REDIS_REST_URL`/`_TOKEN`. Real Redis is binary-safe over the wire, so this also drops the
  base64 encode/decode round-trip Upstash's JSON-based REST API required -- uses `set`/`getBuffer`
  directly on a `Buffer` -- same exported function signatures, so `syncServer.ts` didn't change.
- [x] `server/src/redis.test.ts`: updated for `REDIS_URL`; kept the "not set -> null/no-op, no
  persistence" behavior covered.
- [x] `server/.env.example`: swapped `UPSTASH_REDIS_REST_URL`/`_TOKEN` for `REDIS_URL`.
- [x] Run server tests/lint/build.

_(Done: also verified against a real local `redis-server` -- a raw byte round-trip (values 0/128/
250/255 included) came back byte-identical, and a full app-level check (type text -> wait past the
2s persist debounce -> kill the server -> start a fresh one -> reload) showed the typed content
survived the restart, proving the new binary-safe path actually works end-to-end, not just against
the "no REDIS_URL" unit tests.)_

### Group B — Point deployment config + docs at Railway ✅

- [x] Add a minimal `railway.toml` at repo root: `[build]` pins the root `Dockerfile` explicitly;
  `[deploy]` sets healthcheck path `/healthz` + timeout and a restart policy -- mirroring what
  `fly.toml`'s `[http_service]` block covered.
- [x] `docs/REQUIREMENTS.md`'s Hosting & Server Stack section: "a single Fly.io app" -> "a single
  Railway service" (2 mentions), plus the Redis bullet now names Railway's Redis plugin + `ioredis`
  instead of Upstash, and the build-version-marker bullet no longer name-drops `fly deploy`
  specifically.
- [x] `CLAUDE.md`: Deployment section rewritten for Railway (`REDIS_URL` wired to the Redis plugin's
  reference variable instead of Fly secrets; `railway.toml`'s healthcheck noted; `fly.toml`/the Fly
  app called out as a dormant fallback, not the active target). Also fixed staleness in the Project
  section left over from the Tiptap migration and the Group A Redis swap (still said `<textarea>`/
  `Y.Text`/`useDesktopText.ts` -- deleted files/decisions from earlier this session -- and Upstash).
- [x] Manual, Railway-dashboard-only steps the user still needs to do themselves (nothing reachable
  from here): create the Railway project, add the Redis plugin, wire `REDIS_URL` into the app
  service's variables, first deploy.
- [x] Run full tests/lint/build once more after doc/config changes.

_(Done: `railway.toml` validated as syntactically correct TOML via Python's `tomllib`, since there's
no Railway CLI in this sandbox to check it against Railway's own schema. The actual Railway project
creation, Redis plugin, and first deploy are still manual steps for the user -- see below.)_
