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

## Plan

### 1. Email destination + destination management (delete, create-with-template)

Adds an Email destination (sent via Gmail, using the existing Google connection) alongside
today's Google Doc / Dropbox destinations, and builds out `DestinationsPanel.tsx` (placeholder
only today) into the real place destinations are created, templated from an existing one, and
deleted. `SendMenu.tsx`'s Send popover becomes a plain saved-destinations picker once any exist;
if none exist yet it launches the same creation form itself.

**Group A — Destination delete (server + DestinationsPanel wiring)** ✅
- [x] `server/src/destinations.ts` — `deleteDestination(userId, id)`
- [x] `server/src/requestHandler.ts` — `DELETE /api/destinations/:id`
- [x] `client/src/components/DestinationsPanel.tsx` — replace dummy destinations list with real
      `GET /api/destinations` data; each row shows its label on the left + an "×" on the right
      that opens an inline confirm before deleting
- [x] Test updates: `destinations.test.ts`, `requestHandler.test.ts`, `DestinationsPanel.test.tsx`

_(Done: commit `5df267b`. Also extracted `client/src/lib/destinations.ts` — the `SavedDestination`
type + `destinationLabel` helper, shared between `DestinationsPanel.tsx` and `SendMenu.tsx` instead
of duplicated. Tests + lint + typecheck + build all green.)_

**Group B — Gmail send capability (server only)** ✅
- [x] `server/src/googleAuth.ts` — add `gmail.send` to `GOOGLE_SCOPES` (existing connections need
      to reconnect once to pick up the new scope)
- [x] `server/src/gmail.ts` (new, mirrors `googleDocs.ts`) — `sendEmail(userId, to, subject,
      body)` via the Gmail API, reusing `getAuthorizedClient`
- [x] `server/src/gmail.test.ts` (new)

_(Done: commit `518c9e4`. Tests + lint + typecheck + build all green.)_

**Group C — Email destination type + daily subject sequence** ✅
- [x] `server/src/destinations.ts` — `EmailDestination { id, type: 'email', address, shortLabel,
      emailSubjectLabel?: string, createdAt }`, `saveEmailDestination` (always creates a new
      entry, *not* an upsert by address -- shortLabel/emailSubjectLabel are fixed at creation, so
      two destinations can legitimately share an address with different labels)
- [x] `server/src/emailSequence.ts` (new) — atomic per-destination, per-day Redis counter
      (`email-seq:{destinationId}:{localDateKey}`), zero-based, TTL'd so keys don't accumulate
- [x] `server/src/requestHandler.ts` — `POST /api/destinations` (new: create a destination
      directly, decoupled from sending) handles `email`; `/api/send` for an email destination
      builds the subject as `` `${emailSubjectLabel || shortLabel} ${localTime} ${seq}` `` (client
      sends `localDate` for the day-boundary key and `localTime` as `mm/dd/yyyy HH:mm`, both in
      the browser's timezone) and calls `sendEmail`
- [x] Test updates: `destinations.test.ts`, `requestHandler.test.ts`, plus `emailSequence.test.ts`
      (new)

_(Done: commit `0c3fd7a`. Tests + lint + typecheck + build all green.)_

Group D is broken into four sequential sub-steps, ordered so each stays safe/shippable on its
own: add new backend capability (D1) → add new UI using it (D2) → remove old UI now that it's
replaced (D3) → remove old backend now that nothing needs it (D4).

**Group D1 — Server: `POST /api/destinations` for Google Doc / Dropbox creation** ✅
- [x] `server/src/destinations.ts` — add `shortLabel` to `GoogleDocDestination`/
      `DropboxFileDestination`; `saveGoogleDocDestination`/`saveDropboxFileDestination` take a
      `shortLabel` param
- [x] `server/src/requestHandler.ts` — `parseCreateDestinationBody` extended for `type:
      'google-doc'` (`docId`, `docName`, `shortLabel`) and `type: 'dropbox-file'` (`path`, `name`,
      `shortLabel`); `POST /api/destinations` calls the right save function. The still-active
      ad-hoc-send-creates-destination path passes `docName`/`name` as a stand-in `shortLabel`
      until D4 removes that path.
- [x] Test updates: `destinations.test.ts`, `requestHandler.test.ts`

_(Done: commit `7cf391a`. Also dropped the now-redundant `destinationLogName` helper in favor of
`destination.shortLabel` directly. Tests + lint + typecheck + build all green.)_

**Group D2 — Client: `DestinationForm.tsx` + wire into `DestinationsPanel`** ✅
- [x] New `client/src/components/DestinationForm.tsx`: channel picker (Email / Google Doc /
      Dropbox) → per-channel form → Save (calls `POST /api/destinations`, appends to the list). A
      "start with existing" *button* reveals a dropdown (same-type destinations) that prefills
      fields, still editable before Save.
  - Email form: `address` + `shortLabel` + optional `emailSubjectLabel`
  - Google Doc form: its own search-and-pick widget (parallels `SendMenu.tsx`'s, not literally
    moved yet -- D3 removes SendMenu's copy) + editable `shortLabel` (defaults to the picked
    doc's name)
  - Dropbox form: same, with Dropbox search
- [x] `client/src/components/DestinationsPanel.tsx` — clicking a channel opens `DestinationForm`
      for it; its Channels list is now the three real types (was still placeholder before)
- [x] Test updates: `DestinationForm.test.tsx` (new), `DestinationsPanel.test.tsx`

_(Done: commit `f4cffd0`. Also: extended `client/src/lib/destinations.ts`'s `SavedDestination` type
with `email` + `shortLabel` on every variant (needed for the template picker), which required a
small `SendMenu.tsx` fix -- its saved-destinations list now sends by `destinationId` uniformly
(previously reconstructed ad-hoc `docId`/`dropboxPath` fields from the saved object), with a new
`client/src/lib/localSendTime.ts` helper for the `localDate`/`localTime` fields email destinations
need. Tests + lint + typecheck + build all green.)_

**Group D3 — Client: `SendMenu.tsx` rework**
- [ ] Remove the now-redundant Google Docs/Dropbox search UI (moved to `DestinationForm` in D2)
      — becomes a plain saved-destinations picker
- [ ] No destinations yet → clicking "Send" opens `DestinationForm` (channel picker first); on
      Save, the new destination is inserted and a "Send from \<shortLabel\>" button appears to
      dispatch immediately
- [ ] Test updates: `SendMenu.test.tsx`

**Group D4 — Server: simplify `/api/send` to `destinationId`-only**
- [ ] `server/src/requestHandler.ts` — drop the ad-hoc `docId`/`docName`/`dropboxPath`/
      `dropboxName` fields from `parseSendBody`/`resolveTarget`/`SendTarget` (only `destinationId`
      remains, matching how email already works)
- [ ] Test updates: `requestHandler.test.ts` (remove/adjust the ad-hoc-send tests)

**Group E — Docs reconciliation**
- [ ] Update `docs/REQUIREMENTS.md`'s Send flow / Destination sidebar sections to reflect what's
      actually built
- [ ] Commit + push (ask first, per the Rules above)
