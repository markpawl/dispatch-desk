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

## Plan: Rich-text editor (Tiptap)

Replace the plain `<textarea>` + `Y.Text` desktop editor with a full rich-text editor (Tiptap, on
ProseMirror), synced via Yjs over the existing WebSocket Sync Server. See `docs/REQUIREMENTS.md`'s
new Editor section for the decision. Feature set: bold, italic, underline, strikethrough, text
color, links, headings, bullet/numbered lists.

### Group A — Swap in Tiptap wired to Yjs, no formatting UI yet

- [ ] `client/package.json`: add `@tiptap/react`, `@tiptap/starter-kit`,
  `@tiptap/extension-collaboration`, `y-prosemirror` (pin exact versions compatible with the
  existing `yjs@^13.6.24`).
- [ ] `client/src/lib/desktopDoc.ts`: swap `doc.getText(ROOM_NAME)` for `doc.getXmlFragment(ROOM_NAME)`
  (what Tiptap's Collaboration extension binds to); update the `DesktopDoc` interface's `text: Y.Text`
  to `fragment: Y.XmlFragment`.
- [ ] Delete `client/src/lib/useDesktopText.ts` and its test `useDesktopText.test.ts` — Tiptap's
  Collaboration extension replaces the whole diff/observe binding they implemented.
- [ ] `client/src/App.tsx`: replace the `<textarea>` with a Tiptap `useEditor` (`@tiptap/react`)
  configured with `StarterKit` (history disabled — Yjs's Collaboration extension supplies undo/redo)
  + `Collaboration` bound to the doc's `Y.XmlFragment`; render via `<EditorContent editor={editor} />`.
- [ ] `client/src/App.css`: restyle `.desktop-editor` for a ProseMirror `contenteditable` div instead
  of a `<textarea>` (drop `resize`, target the `.ProseMirror` class Tiptap renders).
- [ ] Rewrite `client/src/App.test.tsx` for the new editor — Tiptap renders a `contenteditable` div
  (role `textbox`), not a `<textarea>` with `value`/`placeholder`; assert on `.textContent` instead.
- [ ] Run client tests/lint/build; manually verify two browser tabs still live-sync plain typed text
  before moving to Group B.

### Group B — Formatting extensions + toolbar

- [ ] Add extensions beyond StarterKit (which already covers Bold/Italic/Strike/Heading/BulletList/
  OrderedList): `@tiptap/extension-underline`, `@tiptap/extension-text-style` +
  `@tiptap/extension-color` (text color), `@tiptap/extension-link`.
- [ ] Build a small toolbar component (e.g. `client/src/components/EditorToolbar.tsx`) with controls
  for Bold/Italic/Underline/Strike/Heading level/Bullet list/Ordered list/Text color (color picker)/
  Link (URL prompt), each calling `editor.chain().focus().toggleX().run()`.
- [ ] Verify default keyboard shortcuts fire (Ctrl-B, Ctrl-I, Ctrl-U, etc. — come from StarterKit/
  Underline, no custom key handling needed).
- [ ] Style the toolbar and active-state highlighting (`editor.isActive('bold')`, etc.) in `App.css`.
- [ ] Run tests/lint/build; manually verify formatting round-trips through the Sync Server + Redis
  (persists across a reload, syncs live between two tabs).
