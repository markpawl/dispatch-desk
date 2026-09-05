# Dispatch Desk Requirements

Living document, built incrementally during requirements-gathering with the user.
Sections are filled in as decisions are made; nothing here is final until noted.

## Core Problem / Goal

- Dispatch Desk is a text editor that behaves like a desktop: type freely, with no destination
  decided up front, then later dispatch selected text out to one of several configured
  destinations — rather than filing text away as you write.

## Key User Flows

### Send flow
- Select text, right-click, choose "destinations," pick one, confirm send.
- Default post-send action: write a log entry, then delete the sent text from the desktop — the
  desktop stays a transient working surface, not an archive.
- Destination examples: email to someone; a new file in a project folder; appended to an existing
  document; a row in a data store; AI-integrated into a larger body of information (merged into
  whichever of several files in a project directory it best fits).

### Smart destination
- Right-click → Destination → Smart invokes AI to suggest which registered destination a selection
  belongs to, instead of the user picking manually.

### Destination sidebar
- A togglable panel on the right edge of the screen lists all destinations; selected text can be
  sent directly from there, without going through the right-click menu first.

### Purgatory
- Holds text that doesn't currently match any registered destination. When a new destination is
  registered, the system re-checks Purgatory's contents and moves over anything that now
  qualifies.

## Access & Collaboration

- The app must be reachable and usable from any standards-compliant web browser — no native app,
  browser extension, or local install required.
- Opening the app in a new browser instance (a different browser, tab, or device) must show the
  desktop's current contents, not an empty or stale local copy.
- An edit made in one open instance must propagate live to every other open instance — the way a
  collaborative editor (e.g. Google Docs) behaves — not only on next load/refresh.

## Open Flags / Risks

- No auth/identity model decided yet.
- Whether destinations (and the desktop itself) are per-user/account-scoped, or global/shared
  across every browser instance, is not yet decided.
- How destinations are actually implemented/connected under the hood, and how the live-sync
  requirement above gets built, are still open — see `IDEAS.md`.
