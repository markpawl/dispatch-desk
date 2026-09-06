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

## Plan: Select → send to a Google Doc destination

Direct Drive/Docs API integration (no MCP Host — see `docs/REQUIREMENTS.md`'s Destination
Architecture section and `docs/IDEAS.md`'s Pending item 1). First send picks a Google Doc via search;
that doc is then saved as a reusable named destination for one-click reselection. Full send flow per
REQUIREMENTS' Send flow: append text → write a log entry → delete the sent text from the desktop.
Auth is a real in-app `/auth/google` OAuth flow (single set of tokens in Redis — no per-user accounts,
matches Auth/Identity's "personal use, single user" decision). Trigger is a toolbar button.

**Manual setup only the user can do (Google Cloud Console), needed before Group A can be truly
tested — I have no network access to Google's APIs from this sandbox, so none of this session's work
can be live-verified against a real Google account:**
1. Create/reuse a Google Cloud project; enable the **Google Drive API** and **Google Docs API**.
2. OAuth consent screen: External user type, **Testing** publishing status (avoids Google's
   app-verification process entirely, since this never leaves testing for a personal-use app), add
   your own Google account as a test user, add scopes `.../auth/documents` and
   `.../auth/drive.metadata.readonly`.
3. Create an OAuth 2.0 Client ID (type: Web application). Authorized redirect URIs: your Railway
   domain's `/auth/google/callback`, plus `http://localhost:8787/auth/google/callback` for local dev.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — Railway service variables
   for production, `server/.env` for local dev.

### Group A — Google OAuth connect flow

- [ ] `server/package.json`: add `googleapis` (bundles Drive v3, Docs v1, and OAuth2 client in one
  package).
- [ ] `server/src/googleAuth.ts` (new): `getOAuthClient()`, `getAuthUrl()` (`access_type: 'offline'`,
  `prompt: 'consent'` — required to reliably get a `refresh_token` back), `handleCallback(code)`
  (exchanges code, stores `{ refresh_token, access_token, expiry_date }` under Redis key
  `google:oauth`), `getAuthorizedClient()` (loads tokens, returns a configured `OAuth2Client` --
  `googleapis` auto-refreshes the access token from the refresh token as needed), `isGoogleConnected()`.
- [ ] `server/src/index.ts`: routes `GET /auth/google` (302 to `getAuthUrl()`), `GET
  /auth/google/callback` (exchanges + stores, 302 to `/`), `GET /api/google/status` (`{connected:
  boolean}`).
- [ ] `client/src/App.tsx`/`App.css`: small "Google: connected/not connected" indicator in the
  header (fetches `/api/google/status` on load) with a "Connect Google" link (`<a
  href="/auth/google">`) when not connected.
- [ ] `server/.env.example`: add the three `GOOGLE_*` vars (blank, per existing convention).
- [ ] Tests: `googleAuth.ts` unit tests with `googleapis` mocked (token storage/retrieval logic,
  `isGoogleConnected()` true/false); a route-level test for the two `/auth/google*` redirects and
  `/api/google/status`.
- [ ] Run tests/lint/build. **Cannot verify the actual consent-screen round-trip from this sandbox —
  that needs the user's real Google Cloud credentials, tested locally or on a real deploy.**

### Group B — Search + append (library + read-only endpoint)

- [ ] `server/src/googleDocs.ts` (new): `searchGoogleDocs(query)` (Drive `files.list`, `q:
  "mimeType='application/vnd.google-apps.document' and trashed=false and name contains '...'"`,
  fields `id,name`), `appendTextToDoc(docId, text)` (Docs `documents.batchUpdate`, an `insertText`
  request at `endOfSegmentLocation` -- appends without needing to know the doc's current length;
  note this always prepends a newline before the appended text, so a doc's very first send gets one
  leading blank line -- accepted as a minor, harmless quirk rather than an extra `documents.get`
  round-trip just to avoid it).
- [ ] `server/src/index.ts`: `GET /api/google-docs/search?q=...` (401/error if not connected).
- [ ] Tests: `googleDocs.ts` unit tests with `googleapis` mocked (query construction, response
  mapping, the append request shape).
- [ ] Run tests/lint/build. **Real search/append behavior against an actual Google Doc still needs
  the user's manual verification** — I can only verify the request shapes are correct per the API's
  documented contract, not that Google's servers accept them.

### Group C — Destinations registry + send log + `/api/send`

- [ ] `server/src/destinations.ts` (new): Redis key `destinations` holding a JSON array of `{id,
  type: 'google-doc', docId, docName, createdAt}`; `listDestinations()`, `saveDestination({docId,
  docName})` (upsert by `docId` -- returns the existing entry if already saved, never duplicates).
- [ ] `server/src/sendLog.ts` (new): Redis list `send-log`, `RPUSH` a JSON entry per send
  (`{timestamp, destinationId, docName, textPreview}`, `textPreview` truncated to ~100 chars),
  `LTRIM`'d to the most recent 200 -- unbounded growth isn't acceptable for a key meant to live in
  Redis indefinitely.
- [ ] `server/src/index.ts`: `GET /api/destinations` (list); `POST /api/send` (body `{text, docId,
  docName}` or `{text, destinationId}` -- looks up `docId`/`docName` from the registry for the
  latter) -- appends, upserts the destination, writes the log entry, returns `{ok: true,
  destination}`.
- [ ] Tests: unit tests for `destinations.ts` (upsert-by-docId behavior) and `sendLog.ts` (trim
  behavior), plus a `/api/send` route test with `googleDocs`/`destinations`/`sendLog` all mocked,
  covering both request shapes and the not-connected error case.
- [ ] Run tests/lint/build.

### Group D — Client UI: send button, destination picker, delete-on-send

- [ ] `client/src/components/SendMenu.tsx` (new): a "Send" toolbar button (in `EditorToolbar.tsx`),
  enabled only when the editor has a non-empty selection. Click opens a popover: saved destinations
  (from `/api/destinations`, click to send immediately) plus a search box (calls
  `/api/google-docs/search?q=`) for picking/searching a new Google Doc when no saved destination
  fits, or a "Connect Google" prompt when `/api/google/status` says not connected.
- [ ] `App.tsx`: on a successful `/api/send`, delete the selected range from the editor
  (`editor.chain().focus().deleteSelection().run()`) -- the "delete the sent text from the desktop"
  half of the Send flow decision.
- [ ] `App.css`: styling for the send button, popover, and destination list/search box, matching the
  toolbar's existing look.
- [ ] Tests: component tests for `SendMenu` (enabled/disabled on selection state, renders saved
  destinations, search-then-send flow, delete-after-send) with `fetch` mocked -- no real Google or
  server round-trip needed for these.
- [ ] Run tests/lint/build, plus a Playwright pass against the built app with the `/api/*` endpoints
  mocked at the network layer (real Google auth still isn't reachable from this sandbox) to confirm
  the send button, popover, and post-send deletion all wire together correctly in a real browser.
