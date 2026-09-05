# Dispatch Desk Requirements

Living document, built incrementally during requirements-gathering with the user.
Sections are filled in as decisions are made; nothing here is final until noted.

## Core Problem / Goal

- Dispatch Desk is a text editor that behaves like a desktop: type freely, with no destination
  decided up front, then later dispatch selected text out to one of several configured
  destinations — rather than filing text away as you write.
- The idea: one single place to capture notes, ideas, thoughts, and reminders as they occur, with
  that information later migrating out to wherever it actually belongs. The desktop is a staging
  area, not a permanent home for any of it.
- Scope: a single shared desktop — one document, the same one no matter how many browsers have it
  open. No multiple/named desktops for now.

## Key User Flows

### Send flow
- Select text, right-click, choose "destinations," pick one, confirm send.
- Default post-send action: write a log entry, then delete the sent text from the desktop — the
  desktop stays a transient working surface, not an archive.
- Destination examples: email to someone; a new file in a cloud-storage folder (Google Drive
  and/or Dropbox — not the local filesystem, for now); appended to an existing document; a row in
  a data store; AI-integrated into a larger body of information (merged into whichever of several
  files in a project folder it best fits).

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
- **Granularity: one destination = one MCP tool, not one whole server.** A single server can
  expose several unrelated tools (e.g. one per project directory, or per Gmail/Calendar/Drive);
  each is its own selectable destination, never bundled under one server-level entry.
- Sending text to a destination is calling that tool with the selected text.
- The Smart-destination feature works by handing an LLM the selected text plus the connected
  servers' tool descriptions (via `list_tools`) and having it choose one — the same mechanism that
  powers tool use generally, pointed at destinations instead of arbitrary tools.
- The destination sidebar is a live view over `list_tools`/`list_resources` across connected
  servers.
- Purgatory's re-check trigger lines up with MCP's own connect/disconnect lifecycle: re-run
  matching against the current tool descriptions whenever a server connects or its tool list
  changes.
- **Transport: remote HTTP only, for now.** The MCP Host connects out to MCP servers over the
  network — no stdio subprocesses, and no reaching down to the user's own local machine. Reaching
  a local machine would need its own tunneled MCP server (mirroring `fairstream-artist-server`'s
  Cloudflare-tunnel pattern) — real complexity, deferred for now; see `IDEAS.md`.
- **File/folder-shaped destinations go through cloud storage, not the local filesystem.** "A new
  file in a project folder" means a folder in Google Drive and/or Dropbox, reached via their own
  MCP servers over HTTP — not a directory on the user's machine.

## Hosting & Server Stack

- The client is React + Vite (+ TypeScript), matching `fairstream-client` and
  `fairstream-artist-dashboard`'s existing stack. Considered Vue as an alternative: neither Yjs nor
  MCP favors one framework over the other (Yjs is framework-agnostic; MCP is backend-only), so
  there was no technical reason to break from the toolchain already established elsewhere.
- A single Fly.io app hosts both the built React client and the Sync Server — one deploy, one
  origin, no separate frontend host.
- The server app is written in Node.js/TypeScript, matching Yjs's native ecosystem (`y-websocket`
  and its persistence adapters are Node-first) and the MCP TypeScript SDK. It hosts both the Sync
  Server and the MCP Host in the same process — no reason to split them once MCP connections are
  remote-HTTP-only, so one Fly.io app covers all of it.
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

_(none currently open — every flag raised so far has been decided; see `IDEAS.md` for deferred,
not-yet-scheduled ideas like the local-machine MCP server.)_
