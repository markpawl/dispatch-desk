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

### 1. Send-from-sidebar

Today, sending only happens through the toolbar's Send popover (`SendMenu.tsx`); the destination
sidebar (`DestinationsPanel.tsx`, always visible) is create/delete only. Per the user: selecting
text should make the sidebar's destination rows active too, so clicking one sends directly from
there.

**Group A — the whole thing** ✅
- [x] New `client/src/lib/sendToDestination.ts`: shared `sendSelectionToDestination(editor,
      destinationId)` -- builds the body (text + destinationId + local date/time), POSTs
      `/api/send`, deletes the selection on success, returns `{ok:true} | {ok:false, error}`.
      Extracted from `SendMenu.tsx`'s existing send logic so both components share one
      implementation instead of duplicating it.
- [x] `client/src/components/SendMenu.tsx`: refactored to call the shared helper (pure refactor,
      no behavior change).
- [x] `client/src/components/DestinationsPanel.tsx`: new `editor: Editor | null` prop. Each
      destination row becomes a real button -- disabled when signed out (existing `disabled`
      prop) or when there's no active text selection, enabled/clickable otherwise; clicking sends
      to it and shows an inline error on failure. The delete "×" stays independent of selection
      state.
- [x] `client/src/App.tsx`: passes `editor` down to `DestinationsPanel` in both `Desktop` and
      `SignedOut`.
- [x] Test updates: `DestinationsPanel.test.tsx` (rows disabled without a selection, enabled +
      sending with one, inline error on failure), `SendMenu.test.tsx` (unchanged behavior after
      the refactor), new `sendToDestination.test.ts`.
- [x] Update `docs/REQUIREMENTS.md`'s Send flow / Destination sidebar sections (drop the "no
      send-from-sidebar yet" note) and `docs/TEST-SCRIPTS.md` (script 3, or a new script) to
      describe/test the new path.

_(Done: commit `8c1c5cd`. Added as a new script 4 rather than folding into script 3, matching the
one-script-per-feature granularity already established. Also annotated `docs/IDEAS.md`'s pending
item 14 (which asked for this, plus a second, still-open half). Could not visually verify live --
the deployed app only reflects committed/pushed code, and local dev has no Redis configured (so
`/api/me` always returns null, showing only the signed-out shell) -- relying on the 10-test
`DestinationsPanel.test.tsx` suite (a real, non-mocked Tiptap editor) instead. Tests + lint +
typecheck + build all green.)_
