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

### 1. IDEAS.md pending items 11-13 and 15 (small UI/model polish)

Four small, independent fixes bundled as one group since each is trivial in size:
- 11: a computed (not stored) "descriptive label" per destination, shown on hover
- 12: rename the app title "Dispatch Desk" -> "Dispatch Desktop" (header + browser tab only, not
  `package.json`/docs/repo name)
- 13: distinct background colors for the sidebar's Channels vs. Destinations list items
- 15: "start with existing" template no longer prefills `shortLabel`

**Group A — all four** ✅
- [x] `client/src/lib/destinations.ts`: new `destinationDescription(destination)` -- e.g. `"Email,
      mom@example.com"`, `"Google Doc, Meeting Notes"`, `"Dropbox File, /notes.txt"` (channel name
      + the type's underlying params; includes `emailSubjectLabel` when set)
- [x] `client/src/components/DestinationsPanel.tsx`: a destination row's `title` combines
      `destinationDescription()` with the existing selection hint; the Channels and Destinations
      `<ul>`s each get a distinguishing className
- [x] `client/src/App.css`: Channels list gets a distinct background (light blue tint, matching
      the app's existing accent color); Destinations list keeps its current gray
- [x] `client/src/App.tsx` (both `<h1>`s), `client/index.html` (`<title>`): "Dispatch Desk" ->
      "Dispatch Desktop"
- [x] `client/src/components/DestinationForm.tsx`: `applyTemplate` drops
      `setShortLabel(template.shortLabel)` -- every other field still prefills as today
- [x] Test updates: new `destinations.test.ts` (the description helper), `DestinationsPanel.test.tsx`
      (row title includes the description), `App.test.tsx` (heading text), `DestinationForm.test.tsx`
      (template no longer prefills shortLabel)
- [x] `docs/IDEAS.md`: move Pending items 11, 12, 13, 15 to Addressed with short notes

_(Done: commit `dcd33f1`. Also fixed a stray-timer test-hygiene issue in
`sendToDestination.test.ts` (real Tiptap editors weren't being destroyed). Verified item 12/13
visually in a local dev run. Tests + lint + typecheck + build all green.)_
