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

## Destination Architecture

- Destinations are modeled as MCP (Model Context Protocol) tools: Dispatch Desk acts as an MCP
  host, and each connected MCP server can expose one or more tools that become selectable
  destinations (e.g. an email-sending tool, a project-directory write/append tool, a data-store
  insert tool).
- Sending text to a destination is calling that tool with the selected text.
- The Smart-destination feature works by handing an LLM the selected text plus the connected
  servers' tool descriptions (via `list_tools`) and having it choose one — the same mechanism that
  powers tool use generally, pointed at destinations instead of arbitrary tools.
- The destination sidebar is a live view over `list_tools`/`list_resources` across connected
  servers.
- Purgatory's re-check trigger lines up with MCP's own connect/disconnect lifecycle: re-run
  matching against the current tool descriptions whenever a server connects or its tool list
  changes.

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
- Destination granularity isn't decided: whether one destination is a whole MCP server, or one
  tool within a server (finer-grained).
- Whether the app connects to MCP servers locally (stdio transport) or over remote HTTP isn't
  decided.
- How the live-sync requirement above gets built is still open — see `IDEAS.md`.
