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

### 1. Persistent account button + login dialog

Replaces the full-page `SignIn` gate with the *same desktop shell* rendered in both auth states
(header, toolbar, Send button, the Destinations sidebar, editor area) rather than swapping to a
different screen. Signed out, everything in that shell is disabled/non-interactive -- toolbar
buttons, Send, the Destinations sidebar, and the editor itself (no typing) -- except the header's
top-right corner button, which is always in the same spot: the signed-in account name
(`AccountMenu.tsx`, unchanged) or, signed out, a "Log In" button (new `LoginDialog.tsx`) that
opens a popover of login options (just "Sign in with Google" for now, laid out so a future
provider is just another row) -- never on its own, only via clicking the button. No real Yjs
doc/WebSocket connection is created for a signed-out visitor (an anonymous visitor still never
opens a sync connection) -- the signed-out editor is a local, throwaway, non-editable Tiptap
instance purely for visual parity, discarded once signed in.

Note: Group B below makes the Destinations sidebar permanently visible (no more toggle button) --
whichever of A/B lands first should account for the other's current state (a toggle button to
disable, if A lands first; a permanent-but-inert sidebar with nothing to show pre-login, if B
lands first).

**Group A — the whole thing (client-only; `/auth/login/google` already exists server-side)** ✅
- [x] New `client/src/components/LoginDialog.tsx`: "Log In" corner button + its popover
      (`/auth/login/google` link inside, styled as a list row so more providers can be added later)
- [x] `client/src/components/EditorToolbar.tsx` / `SendMenu.tsx`: accept a `disabled` prop that
      forces every button disabled regardless of editor state (rather than each returning `null`
      when there's no editor, so the shell still renders as normal, just inert)
- [x] `client/src/App.tsx`: signed-out state renders the same shell as `Desktop` -- header (title
      + `LoginDialog` in the same corner `AccountMenu` sits in, no connection-status pill),
      toolbar row (`EditorToolbar`/`SendMenu` `disabled`; the Destinations toggle button, if it
      still exists at this point, `disabled` too), and a local non-editable Tiptap instance (no
      Collaboration extension, no WebSocket) in place of the real editor. `Desktop` itself is
      otherwise unchanged.
- [x] `client/src/App.css`: disabled-button styling if the existing `:disabled` rules aren't
      enough; `LoginDialog`'s popover likely reuses `.account-menu*` styling
- [x] Test updates: new `EditorToolbar.test.tsx`, `SendMenu.test.tsx`, `App.test.tsx` (signed-out
      shell renders with every button disabled and the editor non-editable except "Log In", which
      opens the dialog listing "Sign in with Google" → `/auth/login/google`; dialog never appears
      unprompted), new `LoginDialog.test.tsx`
- [x] Update `docs/REQUIREMENTS.md`'s Auth/Identity section to describe the new sign-in entry
      point

_(Done: commit `1cec70a`. Also fixed a stale `docs/REQUIREMENTS.md` note still calling
`DestinationsPanel` "dummy data", and updated `docs/TEST-SCRIPTS.md`'s Login script to match the
new entry point. Verified visually in a local dev run (no Redis configured, so `/api/me` returns
null and the signed-out shell renders without needing real OAuth) -- shell renders identically,
everything disabled except "Log In", which opens the dialog correctly. Tests + lint + typecheck +
build all green.)_

### 2. Channels & Destinations sidebar always visible

`client/src/components/DestinationsPanel.tsx` currently only shows via a toolbar "Destinations"
toggle button, floating as an absolutely-positioned overlay on top of the editor when open
(`.destinations-panel` in `client/src/App.css`). Per the user: it should be visible at all times
instead.

**Group A — make it permanent** ✅
- [x] `client/src/App.tsx`: drop the `destinationsPanelOpen` state and the "Destinations" toggle
      button; always render `DestinationsPanel`
- [x] `client/src/components/DestinationsPanel.tsx`: drop the `open` prop and its
      hidden-when-closed early return -- always mounted now
- [x] `client/src/App.css`: `.destinations-panel` changes from an absolutely-positioned overlay to
      a normal flex sibling of `.desktop-editor` inside `.desktop-main` (sharing width, not
      covering the editor); drop the now-unused `.destinations-toggle` styles
- [x] Test updates: `DestinationsPanel.test.tsx` (drop `open`-prop tests), `App.test.tsx` (drop
      the toggle test, confirm the sidebar renders unconditionally)

_(Done: commit `32cd22b`. Since the panel is now always mounted (including signed out, where
`/api/destinations` would 401), `DestinationsPanel` also gained a `disabled` prop -- skips the
fetch entirely and disables the channel buttons, foreseen in Feature 1's note above. Also updated
`docs/REQUIREMENTS.md`'s Destination sidebar section and `docs/TEST-SCRIPTS.md`'s script 2, both
still describing the removed toggle. Verified visually in a local dev run. Tests + lint + typecheck
+ build all green.)_
