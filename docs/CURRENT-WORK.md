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

**Group B — Gmail send capability (server only)**
- [ ] `server/src/googleAuth.ts` — add `gmail.send` to `GOOGLE_SCOPES` (existing connections need
      to reconnect once to pick up the new scope)
- [ ] `server/src/gmail.ts` (new, mirrors `googleDocs.ts`) — `sendEmail(userId, to, subject,
      body)` via the Gmail API, reusing `getAuthorizedClient`
- [ ] `server/src/gmail.test.ts` (new)

**Group C — Email destination type + daily subject sequence**
- [ ] `server/src/destinations.ts` — `EmailDestination { id, type: 'email', address, shortLabel,
      emailSubjectLabel?: string, createdAt }`, `saveEmailDestination` (upsert by address)
- [ ] `server/src/emailSequence.ts` (new) — atomic per-destination, per-day Redis counter
      (`email-seq:{destinationId}:{localDateKey}`), zero-based, TTL'd so keys don't accumulate
- [ ] `server/src/requestHandler.ts` — `POST /api/destinations` (new: create a destination
      directly, decoupled from sending) handles `email`; `/api/send` for an email destination
      builds the subject as `` `${emailSubjectLabel || shortLabel} ${localTime} ${seq}` `` (client
      sends `localDate` for the day-boundary key and `localTime` as `mm/dd/yyyy HH:mm`, both in
      the browser's timezone) and calls `sendEmail`
- [ ] Test updates: `destinations.test.ts`, `requestHandler.test.ts`

**Group D — DestinationsPanel creation flow (all three channels) + SendMenu rework**
- [ ] New shared form component `client/src/components/DestinationForm.tsx`: channel picker →
      per-channel creation form → Save inserts the new destination into the list. A "start with
      existing" dropdown (same-type destinations) prefills the form's fields, editable before
      Save. Every channel's form has a `shortLabel` field (Google Doc/Dropbox default it to the
      picked file's real name, editable; Email has no natural default).
  - Google Doc form: embeds the existing search-and-pick widget as its parameter entry
  - Dropbox form: same, with Dropbox search
  - Email form: `address` + `shortLabel` + optional `emailSubjectLabel`
- [ ] `server/src/requestHandler.ts` — `POST /api/destinations` extended for `google-doc` /
      `dropbox-file` creation (today they're only created as a send side-effect); `/api/send`
      simplified to `destinationId`-only (drop the ad-hoc `docId`/`dropboxPath` fields)
- [ ] `client/src/components/DestinationsPanel.tsx` — clicking a channel opens `DestinationForm`
      for it
- [ ] `client/src/components/SendMenu.tsx` reworked:
  - Destinations already exist → plain saved-destinations picker (search UI removed)
  - No destinations exist yet → clicking "Send" opens `DestinationForm` (channel picker first);
    on Save, the new destination is inserted into the list and a "Send from \<shortLabel\>"
    button appears to dispatch immediately
- [ ] Test updates: `SendMenu.test.tsx`, `DestinationsPanel.test.tsx`, `requestHandler.test.ts`,
      `destinations.test.ts`

**Group E — Docs reconciliation**
- [ ] Update `docs/REQUIREMENTS.md`'s Send flow / Destination sidebar sections to reflect what's
      actually built
- [ ] Commit + push (ask first, per the Rules above)
