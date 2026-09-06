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

### Group A — Swap Redis client (Upstash REST -> ioredis/TCP)

- [ ] `server/package.json`: remove `@upstash/redis`, add `ioredis` (+ `@types/ioredis` if not
  bundled).
- [ ] `server/src/redis.ts`: rewrite `getClient`/`loadDesktopState`/`persistDesktopState` around
  `ioredis`, reading a single `REDIS_URL` (Railway's injected var) instead of
  `UPSTASH_REDIS_REST_URL`/`_TOKEN`. Real Redis is binary-safe over the wire, so this also drops the
  base64 encode/decode round-trip Upstash's JSON-based REST API required (`setBuffer`/`getBuffer` or
  equivalent) -- same exported function signatures, so `syncServer.ts` doesn't change.
- [ ] `server/src/redis.test.ts`: update the mock/assertions for `ioredis` instead of `@upstash/redis`;
  keep the "no `REDIS_URL` -> null/no-op, no persistence" behavior covered.
- [ ] `server/.env.example`: swap `UPSTASH_REDIS_REST_URL`/`_TOKEN` for `REDIS_URL`.
- [ ] Run server tests/lint/build.

### Group B — Point deployment config + docs at Railway

- [ ] Add a minimal `railway.toml` (or `railway.json`) at repo root: healthcheck path `/healthz`,
  restart policy -- mirroring what `fly.toml`'s `[http_service]` block covers today. Railway
  auto-detects the root `Dockerfile` for the build itself, so no build config needed there.
- [ ] `docs/REQUIREMENTS.md`'s Hosting & Server Stack section: replace "a single Fly.io app hosts
  both..." with the Railway equivalent (still one service, one Dockerfile, one origin).
- [ ] `CLAUDE.md`'s Deployment section: rewrite for Railway -- env vars set via Railway's
  dashboard/CLI (`railway variables set`, or wiring `REDIS_URL` to the Redis plugin's reference
  variable) instead of `fly secrets set`; note `fly.toml`/the Fly app are kept only as a dormant
  fallback, not the active target.
- [ ] Call out the manual, Railway-dashboard-only steps for the user to do themselves (nothing here
  reaches Railway's API): create the Railway project, add the Redis plugin, wire `REDIS_URL` into the
  app service's variables, first deploy.
- [ ] Run full tests/lint/build once more after doc/config changes.
