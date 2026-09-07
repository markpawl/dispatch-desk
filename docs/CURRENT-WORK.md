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

## Plan: Real per-user accounts (login + per-user desktop + per-user connections)

Reverses two earlier decisions (see `docs/REQUIREMENTS.md`'s Auth/Identity, now rewritten): the app
gets real accounts, and each signed-in person gets their own private desktop instead of the one
global shared document. Destinations/connections (Google today, Dropbox next) become per-user too.
Sign-in is "Sign in with Google" (minimal identity scope, separate from the broader Drive/Docs
consent granted later); access is invite-only via an `ALLOWED_EMAILS` allowlist, not open signup.

**Naming note**: `/auth/google` currently means "connect Google as a destination." Login needs its
own, separate route so the two don't collide -- login becomes `/auth/login/google` (+`/callback`),
and the existing connect flow is renamed `/auth/connect/google` (+`/callback`) for clarity, both
usable from the same Google Cloud OAuth client (just requesting different scopes).

### Group A — Accounts, sessions, login/logout, gate the app behind sign-in

- [x] `server/src/users.ts` (new): Redis-backed user records keyed by Google's `sub` (stable per
  Google account, unlike email) -- `user:<sub>` -> `{id, email, name, createdAt}`. `id` == `sub`.
- [x] `server/src/session.ts` (new): opaque server-side sessions, not JWT -- `createSession(userId)`
  (random 32-byte hex token, `session:<token>` -> `userId` in Redis, 30-day TTL), `getSessionUser(req)`
  (reads the `session` cookie, loads the session then the user record), `destroySession(token)`. Plus
  hand-rolled `parseCookies`/`serializeSessionCookie`/`clearSessionCookie`: `HttpOnly; SameSite=Lax;
  Path=/` (+ `Secure` when not localhost, decided by the request handler).
- [x] `server/src/googleAuth.ts`: added `getLoginAuthUrl()` (scope `openid email profile`) alongside
  the existing `getAuthUrl()` (Drive/Docs scopes, now "connect"); `handleLoginCallback(code)`
  (exchanges code, decodes the `id_token` payload for `{sub, email, name}`, checks `email` against
  `ALLOWED_EMAILS` -- **unset => deny all** -- upserts via `users.ts`, creates a session, returns the
  token). `getOAuthClient(redirectUri?)` so login/connect share one OAuth client. `EmailNotAllowedError`.
- [x] `server/src/requestHandler.ts`: renamed `/auth/google` -> `/auth/connect/google` (+`/callback`);
  added `GET /auth/login/google`, `GET /auth/login/google/callback` (403 if not allowlisted, else sets
  the session cookie + 302 to `/`), `POST /auth/logout`, `GET /api/me`. `requireUser(req, res)` helper
  exported but **not yet wired into any route** (Group C) -- covered by a direct test.
- [x] `client/src/App.tsx`: split into an outer `App` that checks `/api/me` (renders `<SignIn>` --
  "Sign in with Google" -> `/auth/login/google` -- or `<Desktop>`) and `<Desktop>` (all prior logic;
  the Yjs doc + WebSocket only mount once signed in). `null` while `/api/me` is in flight. **Known
  temporary gap, resolved in Group B**: a signed-in user still sees the one old global desktop.
  _Pulled forward from Group C_: `App.tsx`/`SendMenu.tsx` "Connect Google" hrefs -> `/auth/connect/google`
  (inseparable from the server route rename).
- [x] `server/.env.example`: added `ALLOWED_EMAILS`; split `GOOGLE_REDIRECT_URI` (now
  `/auth/connect/...`) + new `GOOGLE_LOGIN_REDIRECT_URI`.
- [x] Tests: `users.test.ts`/`session.test.ts` (new, Redis mocked); `googleAuth.test.ts` (login flow,
  `id_token` mock); `requestHandler.test.ts` (renamed routes, login/logout/`/api/me`/`requireUser`);
  `App.test.tsx` (signed-out sign-in screen vs. signed-in editor, URL-aware fetch stub);
  `SendMenu.test.tsx` (href). Also `docs/IDEAS.md`: OAuth CSRF `state` param noted as deferred.
- [ ] Run tests/lint/build. **Not run** -- local env can't (Node 18; Drive-synced macOS
  `node_modules`; `npm install` fails there). Needs a Node 20+/22 machine with a clean install.
  Also can't verify the real Google login round-trip from here (no network to Google).

_(Done: commit 752f380 -- 16 files, +869/-49. New: `server/src/{users,session}.ts` +tests. Tests
written but not executed locally; see the unchecked box above.)_

### Group B — Per-user desktop (Sync Server rework)

- [x] `server/src/syncServer.ts`: replaced the single global `doc`/client-set with a `Map<userId,
  Promise<Desktop>>` (`Desktop = {doc, clients, persistTimer}`; the Map holds the promise so
  concurrent first connections share one build, and a rejected build is evicted for a clean retry),
  built lazily per user on first connection and loaded from Redis then. `authenticateAndUpgrade`
  resolves the session cookie (via `session.ts`) *before* completing the WebSocket upgrade -- refuses
  it with a raw `HTTP/1.1 401` if not signed in -- then routes into that user's desktop; the `wss`
  `connection` hop is gone (`setupConnection(ws, desktop, userId)` is called directly). Desktops are
  kept for the process lifetime (eviction is a later optimization), but a desktop's pending debounced
  persist is flushed immediately when its last connection drops. `waitUntilReady()` is now a no-op
  (lazy load); `index.ts` unchanged. No client-side change.
- [x] `server/src/redis.ts`: `loadDesktopState`/`persistDesktopState` take a `userId` param, keyed
  `desktop:state:<userId>`. The old `desktop:state` key is left dormant -- everyone starts fresh;
  carrying existing content into a user's desktop is a manual one-time Redis `RENAME` if wanted.
- [x] Tests: new `server/src/syncServer.test.ts` -- upgrade refused without a session; a user's edits
  reach their own second connection but never another user's desktop (real `ws` + `y-protocols/sync`
  clients, `session.js`/`redis.js` mocked). `redis.test.ts` updated for the `userId` param.
- [ ] Run tests/lint/build -- **not run locally** (same env limitation as Group A); CI (`ci.yml`)
  runs them on push. **Playwright isn't set up in this repo** -- the two-users-two-browsers check
  stays a manual verification or a later "add Playwright" task.

_(Done: commit 256694e -- 6 files, +294/-62. New: `server/src/syncServer.test.ts`. Tests written but
not executed locally; see the unchecked box.)_

### Group C — Re-key the Google connection + destinations/send-log per user

- [x] `server/src/googleAuth.ts`: `google:oauth` -> `google:oauth:<userId>`; `handleCallback`,
  `isGoogleConnected`, `getAuthorizedClient` (+ internal `storeTokens`/`loadTokens`) take a `userId`.
  `googleDocs.ts`'s `searchGoogleDocs`/`appendTextToDoc` take a `userId`, threaded into
  `getAuthorizedClient`.
- [x] `server/src/destinations.ts`, `server/src/sendLog.ts`: `destinations`/`send-log` ->
  `destinations:<userId>`/`send-log:<userId>`; every function takes a `userId`.
- [x] `server/src/requestHandler.ts`: handler is now `async`; `/auth/connect/google` (+`/callback`),
  `/api/google/status`, `/api/google-docs/search`, `/api/destinations`, `/api/send` each call
  `requireUser()` first (401 JSON when signed out) and thread `user.id` through. The connect callback
  reads the user from the session cookie Google's redirect carries back -- no OAuth `state` param.
  `requireUser` now fails closed (401) if the session lookup itself throws.
- [x] `client/src/App.tsx`/`SendMenu.tsx`: "Connect Google" href -> `/auth/connect/google` --
  _already done in Group A_ (pulled forward with the server route rename).
- [x] Tests: `userId` args + per-user-key + cross-user isolation assertions across
  `googleAuth`/`googleDocs`/`destinations`/`sendLog`; `requestHandler.test.ts` gains an `it.each`
  401-when-signed-out over all 6 protected routes, a "doesn't touch per-user data when signed out"
  check, and a fails-closed `requireUser` case; `getSessionUser` mock defaults to signed-in.
- [ ] Run tests/lint/build -- **not run locally** (same env limitation); CI (`ci.yml`) runs them on
  push. Real-Redis two-user collision check stays a manual step.

_(Done: commit 0c09410 -- 10 files, +228/-108, server only. Old global keys `google:oauth` /
`destinations` / `send-log` left dormant. Tests written but not executed locally.)_

### Group D — Add Dropbox as a second connection provider

Decisions settled at scoping: **text-appendable files only** (`.txt`/`.md`) via
download-concat-reupload (`.docx`/`.xlsx` deferred to the send-helper plugin idea, `docs/IDEAS.md`
Pending 1); official `dropbox` npm package; parallel routes mirroring the Google ones.

- [~] Manual one-time setup: register an app in Dropbox's App Console (Scoped access, Full Dropbox),
  register `…/auth/connect/dropbox/callback` (local + Railway). _User is completing this; App key +
  secret go in `server/.env` + Railway (`DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET`)._
- [x] `server/src/dropboxAuth.ts` (new): per-user `dropbox:oauth:<userId>` OAuth2 flow, same shape
  as `googleAuth.ts` -- `getDropboxAuthUrl`, `handleDropboxCallback`, `isDropboxConnected`,
  `getAuthorizedDropboxClient`. Uses the `dropbox` package's `DropboxAuth`/`Dropbox`. Offline access
  for a (non-rotating) refresh token; no CSRF `state` yet (deferred, same as Google).
- [x] `server/src/dropboxFiles.ts` (new): `searchDropboxFiles` (filters to `.txt`/`.md`, empty query
  returns `[]`), `appendTextToDropboxFile` (download → prepend `\n`+text → `filesUpload` overwrite;
  last-write-wins accepted). `DropboxNotConnectedError`.
- [x] `server/src/destinations.ts`: `Destination` union widened with `DropboxFileDestination`
  (`type: 'dropbox-file'`, `path`, `name`); `saveDropboxFileDestination` (upsert by path).
- [x] `server/src/requestHandler.ts`: `SendTarget` is now provider-tagged; `parseSendBody`/
  `resolveTarget` accept `dropboxPath`+`dropboxName`; `/api/send` dispatches on provider. New routes
  `/auth/connect/dropbox` (+`/callback`), `/api/dropbox/status`, `/api/dropbox/search`, all behind
  `requireUser()`. `server/.env.example`: `DROPBOX_APP_KEY`/`SECRET`/`REDIRECT_URI`.
- [x] `client/src/components/SendMenu.tsx`: probes both `/api/{google,dropbox}/status` on open,
  per-provider search boxes + connect links, `send()` posts the right body shape per provider.
- [x] Tests: new `dropboxAuth.test.ts` / `dropboxFiles.test.ts`; `destinations.test.ts` +
  dropbox/mixed-list cases; `requestHandler.test.ts` + Dropbox routes, provider dispatch, and the
  new routes in the 401-when-signed-out `it.each`; `SendMenu.test.tsx` reworked for two providers.
- [x] Run tests/lint/build -- CI (`ci.yml`) is green as of `5b14241` (lint + `typecheck -w server` +
  test + build, Node 22). Real Dropbox round-trip is still a manual check once the app secret is set.

_(Done: commit 6c232fc -- 13 files, +966/-186. New: `server/src/{dropboxAuth,dropboxFiles}.ts`
+tests, `dropbox` dep. Follow-ups: `bf9b5af` kept test files out of the prod `tsc` build after a
test type error failed the Railway deploy; `38eb1be` fixed those test type errors.)_

### Group E — Connections management UI + sign-out

- [x] Header **account menu** (`client/src/components/AccountMenu.tsx`) opened from a button showing
  the signed-in name: email, a row per provider (Google, Dropbox) with a Connect link or Disconnect
  button, and Sign out. Replaces the ad-hoc "Connect Google" header link/indicator. (A full
  Connections *panel* wasn't needed -- the menu covers connect/disconnect + sign-out.)
- [x] `server/src/googleAuth.ts`/`dropboxAuth.ts`: `disconnectGoogle`/`disconnectDropbox` -- revoke
  best-effort at the provider, then drop the stored tokens. `server/src/requestHandler.ts`:
  `POST /api/{google,dropbox}/disconnect` (405 on other methods, `requireUser()`).
- [x] `client/src/App.tsx`: `App` passes `user` + `onSignedOut` to `Desktop`; `Desktop` probes both
  `/api/{google,dropbox}/status` and renders `<AccountMenu>`. Sign-out `POST /auth/logout` then
  `me = null` -> `<SignIn>` (no full reload).
- [x] Tests: `AccountMenu.test.tsx` (new); `googleAuth`/`dropboxAuth` disconnect suites;
  `requestHandler.test.ts` disconnect routes + `it.each`; `App.test.tsx` reworked for the menu.
  **Playwright still isn't set up** -- that pass stays a manual/deferred item.
- [x] Run tests/lint/build -- CI green as of `5b14241`.

_(Done: commits `38eb1be` (its `requestHandler.test.ts` diff carried Group E's disconnect tests
early) + `5b14241` (the rest -- source, `AccountMenu`, `App` wiring, other tests). 10 files,
+439/-39 on the second.)_
