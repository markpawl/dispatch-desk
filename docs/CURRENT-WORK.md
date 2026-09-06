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

## Active plan: Channels/destinations right-side panel (`docs/IDEAS.md` Pending item 1)

Client-only UI scaffold, dummy data throughout — no MCP Host, no real channel/destination config
yet (that's later work; see `docs/IDEAS.md`'s other Pending items).

### Group A: static panel with two dummy lists — [x] done

- [x] `client/src/components/DestinationsPanel.tsx` (new) — presentational component, `open: boolean`
      prop, renders `null` when closed. When open, renders an `<aside>` with two labeled sections,
      **Channels** and **Destinations**, each an unordered list of hardcoded placeholder items:
      - Channels (the destination *types*): Email, Google Drive folder, Data store row.
      - Destinations (configured *instances* of a channel): e.g. "Email → jane@example.com",
        "Google Drive folder → Marketing", "Data store row → Leads table".
      No click behavior on items yet — display only.
- [x] `client/src/App.tsx` — add a toggle button (toolbar row, alongside Send) and
      `destinationsPanelOpen` state; wrap `EditorContent` + the new panel in a flex row container
      so the panel takes real width next to the editor when open, matching
      `docs/REQUIREMENTS.md`'s "togglable panel on the right edge of the screen."
- [x] `client/src/App.css` — layout for the new wrapper row + panel styling (fixed width, border,
      scrollable list, section headings).
- [x] `client/src/components/DestinationsPanel.test.tsx` (new) — renders nothing when closed;
      renders both section headings and their dummy items when open.
- [x] `client/src/App.test.tsx` — toggle button shows/hides the panel.

_(Done: files above; `npm test` 49/49, `npm run lint` clean, `npm run build` passing. Still open:
this plan's step 3 items — updating `docs/REQUIREMENTS.md`'s Destination sidebar description and
moving `docs/IDEAS.md`'s Pending item 1 to Addressed — once the user's ready to close out the plan.)_
