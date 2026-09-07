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

- [ ] `server/src/users.ts` (new): Redis-backed user records keyed by Google's `sub` (stable per
  Google account, unlike email) -- `user:<sub>` -> `{id, email, name, createdAt}`.
- [ ] `server/src/session.ts` (new): opaque server-side sessions, not JWT -- `createSession(userId)`
  (random token, `session:<token>` -> `userId` in Redis with a TTL), `getSessionUser(req)` (reads the
  `session` cookie, loads the session then the user record), `destroySession(token)`. Cookie:
  `httpOnly; sameSite=lax` (+ `secure` when not localhost).
- [ ] `server/src/googleAuth.ts`: add `getLoginAuthUrl()` (scope `openid email profile`) alongside
  the existing `getAuthUrl()` (Drive/Docs scopes, now conceptually "connect", not "login"); add
  `handleLoginCallback(code)` (exchanges code, decodes the ID token or calls Google's userinfo
  endpoint for `{sub, email, name}`, checks `email` against `ALLOWED_EMAILS`, upserts the user via
  `users.ts`, creates a session).
- [ ] `server/src/requestHandler.ts`: rename `/auth/google` -> `/auth/connect/google` (+`/callback`);
  add `GET /auth/login/google` (302 to `getLoginAuthUrl()`), `GET /auth/login/google/callback`
  (exchanges, 403 with a clear message if the email isn't allowlisted, else sets the session cookie
  and 302s to `/`), `POST /auth/logout` (destroys the session, clears the cookie), `GET /api/me`
  (`{user: {id, email, name}} | {user: null}`). A `requireUser(req, res)` helper other routes will
  call in Group C.
- [ ] `client/src/App.tsx`: on load, check `/api/me`; if not signed in, render a minimal sign-in
  screen ("Sign in with Google" linking to `/auth/login/google`) instead of the editor; if signed in,
  render the editor as today. **Known temporary gap, resolved in Group B**: until the Sync Server
  itself is per-user, a signed-in user still sees the one old global desktop -- login is real, the
  desktop's privacy isn't yet.
- [ ] `server/.env.example`: add `ALLOWED_EMAILS` (comma-separated).
- [ ] Tests: `users.ts`/`session.ts` unit tests (Redis mocked, matching `destinations.test.ts`'s
  style); `requestHandler.test.ts` additions for the new/renamed routes (login redirect, callback
  incl. the not-allowlisted 403, logout, `/api/me`); a client test for the signed-out sign-in screen
  vs. signed-in editor.
- [ ] Run tests/lint/build. **Cannot verify the real Google login round-trip from this sandbox** (no
  network access to Google) -- same limitation as the original Google Doc destination work.

### Group B — Per-user desktop (Sync Server rework)

- [ ] `server/src/syncServer.ts`: replace the single global `doc`/client-set with a `Map<userId,
  Room>` (`Room = {doc, clients, persistTimer}`), created lazily per user on first connection and
  loaded from Redis then. `handleUpgrade` authenticates the connecting user from their session
  cookie (via `session.ts`) *before* completing the WebSocket upgrade -- rejects the upgrade if not
  signed in -- then routes them into their own room. No client-side change needed: browsers send
  cookies on the WebSocket handshake automatically, so `desktopDoc.ts` doesn't need to know its own
  user ID.
- [ ] `server/src/redis.ts`: `loadDesktopState`/`persistDesktopState` take a `userId` param, keyed
  `desktop:state:<userId>` instead of the single fixed `desktop:state`.
- [ ] Tests: `syncServer` tests (new, or extended if none exist yet -- check) for room isolation
  (two different users' updates never cross rooms) and the upgrade-rejects-unauthenticated case.
- [ ] Run tests/lint/build, plus a two-users-two-browsers Playwright pass (two separate authenticated
  sessions) confirming each sees only their own desktop content, not the other's.

### Group C — Re-key the Google connection + destinations/send-log per user

- [ ] `server/src/googleAuth.ts`: `google:oauth` -> `google:oauth:<userId>` everywhere.
- [ ] `server/src/destinations.ts`, `server/src/sendLog.ts`: `destinations`/`send-log` ->
  `destinations:<userId>`/`send-log:<userId>`.
- [ ] `server/src/requestHandler.ts`: `/auth/connect/google*`, `/api/google/status`,
  `/api/google-docs/search`, `/api/destinations`, `/api/send` all call `requireUser()` first (401 if
  not signed in) and thread `userId` through to the now-per-user functions above.
- [ ] `client/src/App.tsx`/`SendMenu.tsx`: "Connect Google" link href `/auth/google` ->
  `/auth/connect/google`.
- [ ] Tests: update existing `googleAuth.test.ts`/`destinations.test.ts`/`sendLog.test.ts`/
  `requestHandler.test.ts` for the per-user keying and the new 401-when-signed-out cases.
- [ ] Run tests/lint/build, plus a real-Redis check (like Group A/C of the earlier plan) proving two
  different `userId`s' destinations/tokens never collide.

### Group D — Add Dropbox as a second connection provider

- [ ] Manual one-time setup (mirrors the Google Cloud steps): register an app in Dropbox's App
  Console, get an App key/secret, note the redirect URI.
- [ ] `server/src/dropboxAuth.ts` (new): Dropbox's OAuth2 flow, same shape as `googleAuth.ts`.
- [ ] `server/src/dropboxFiles.ts` (new): equivalent of `googleDocs.ts` -- search + write. Dropbox
  has no native "append to a file" operation the way Docs' `batchUpdate` does, so this needs its own
  design decision (always create a new timestamped file, vs. download-modify-reupload an existing
  one) -- to be settled when this group is actually scoped, not now.
- [ ] `server/src/destinations.ts`: widen the `Destination` union with a `dropbox-file` variant.
- [ ] `client/src/components/SendMenu.tsx`: handle multiple provider types in the popover.
- [ ] Tests + manual verification, mirroring Groups A/B/C of the original Google Doc destination plan.

### Group E — Connections management UI + sign-out

- [ ] A dedicated "Connections" view listing each provider (Google, Dropbox, ...) with per-provider
  connect/disconnect, replacing the ad-hoc header link/indicator.
- [ ] Sign-out control in the header.
- [ ] Tests + a Playwright pass over the connect/disconnect/sign-out flows (with `/api/*` mocked
  where real provider auth isn't reachable from this sandbox).
