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

## Hosting & Server Stack

- The client is React + Vite (+ TypeScript), matching `fairstream-client` and
  `fairstream-artist-dashboard`'s existing stack. Considered Vue as an alternative: neither Yjs nor
  MCP favors one framework over the other (Yjs is framework-agnostic; MCP is backend-only), so
  there was no technical reason to break from the toolchain already established elsewhere.
- A single Fly.io app hosts both the built React client and the Sync Server — one deploy, one
  origin, no separate frontend host.
- The server app (the Sync Server, and the natural home for the MCP Host — see Open Flags/Risks)
  is written in Node.js/TypeScript, matching Yjs's native ecosystem (`y-websocket` and its
  persistence adapters are Node-first) and the MCP TypeScript SDK.
- The datastore is Redis (e.g. via Upstash) — holds the CRDT snapshot, the send log, the
  destination registry, and Purgatory's contents. Chosen over MongoDB because everything Dispatch
  Desk stores is simple key → value/blob access, not data that needs flexible cross-record
  querying.

## Auth / Identity

- No authentication or identity system, for now — Dispatch Desk is for personal use only: a single
  user, no accounts, no login.

## Access & Collaboration

- The app must be reachable and usable from any standards-compliant web browser — no native app,
  browser extension, or local install required.
- Opening the app in a new browser instance (a different browser, tab, or device) must show the
  desktop's current contents, not an empty or stale local copy.
- An edit made in one open instance must propagate live to every other open instance — the way a
  collaborative editor (e.g. Google Docs) behaves — not only on next load/refresh.

## Real-Time Sync Architecture

- The desktop's document model is a CRDT (e.g. Yjs), so concurrent edits from multiple open
  browsers merge automatically without server-side lock-stepping.
- Changes propagate over a WebSocket transport: a sync/relay server broadcasts each small update to
  every other connected client.
- "Delete on send" is implemented as removing that range from the shared CRDT doc — the deletion
  then propagates to every open browser the same way any other edit would.
- The sync server must persist the desktop's content to a real datastore so it survives restarts
  and a browser opening later sees current content, not just what's in memory.

## Open Flags / Risks

- Whether destinations (and the desktop itself) are per-user/account-scoped, or global/shared
  across every browser instance, is not yet decided.
- Destination granularity isn't decided: whether one destination is a whole MCP server, or one
  tool within a server (finer-grained).
- Whether the app connects to MCP servers locally (stdio transport) or over remote HTTP isn't
  decided.
- Whether the MCP Host runs as part of the same Node/TypeScript server process as the Sync Server
  (the natural choice, since it's already on Fly.io) or separately isn't explicitly confirmed yet.
