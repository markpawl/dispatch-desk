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
- Scope: one desktop per signed-in user — the same document no matter how many browsers/devices
  that person has it open on, but private to them, not shared with other people. (Originally decided
  as a single desktop shared by everyone, back when the app had no accounts at all -- reversed once
  the app grew real per-user login and per-user destination connections; see Auth/Identity below. No
  *multiple* desktops per user, though -- still one document per person, not several named ones.)

## Key User Flows

### Send flow
- Select text, right-click, choose "destinations," pick one, confirm send.
- Default post-send action: write a log entry, then delete the sent text from the desktop — the
  desktop stays a transient working surface, not an archive.
- Destination examples: email to someone; a new file in a cloud-storage folder (Google Drive
  and/or Dropbox — not the local filesystem, for now); appended to an existing document; a row in
  a data store; AI-integrated into a larger body of information (merged into whichever of several
  files in a project folder it best fits).
- **First concrete implementation (a Google Doc destination)**: trigger is a "Send" button (in the
  toolbar area, `client/src/components/SendMenu.tsx`) rather than a right-click menu, since that
  menu doesn't exist yet. Enabled only with a non-empty selection; opens a popover listing saved
  destinations plus a Google Docs search box for picking/saving a new one. Auth is a real in-app
  Google OAuth flow (`/auth/google`, single set of tokens in Redis — see Auth/Identity above). Both
  halves of the default post-send action are implemented: the server writes a log entry
  (`server/src/sendLog.ts`, a capped Redis list) and the client deletes the sent text from the
  desktop on a successful send. This is a direct Drive/Docs API integration, not an MCP tool — see
  the deviation noted under Destination Architecture below.

### Smart destination
- Right-click → Destination → Smart invokes AI to suggest which registered destination a selection
  belongs to, instead of the user picking manually.

### Destination sidebar
- A togglable panel on the right edge of the screen (`client/src/components/DestinationsPanel.tsx`,
  toggled via a toolbar button) shows two separate lists rather than one: **channels** (the
  available destination types/mechanisms — e.g. email, a cloud-storage folder, a data-store row)
  and **destinations** (the configured instances created from a channel plus its own config — e.g.
  the Email channel configured with a specific recipient address). Currently both lists are
  hardcoded placeholder data with no click behavior — display only, no real channel/destination
  config or send-from-sidebar yet.

### Purgatory
- Holds text that doesn't currently match any registered destination. When a new destination is
  registered, the system re-checks Purgatory's contents and moves over anything that now
  qualifies.

## Editor

- The desktop is a full rich-text editor (Tiptap v3, built on ProseMirror) rather than a plain-text
  `<textarea>` -- supports inline formatting (bold, italic, underline, strikethrough, text color,
  links) and basic block formatting (headings H1-H3, bullet/numbered lists), with the same live-sync
  behavior the plain-text editor already had. A toolbar (`client/src/components/EditorToolbar.tsx`)
  exposes all of the above; standard keyboard shortcuts (Ctrl-B for bold, Ctrl-U for underline, etc.)
  come from Tiptap/ProseMirror directly, not custom key handling.
- Formatting lives in the shared CRDT doc itself, not just in the DOM: Yjs integration goes through
  Tiptap's own Collaboration extension (`@tiptap/extension-collaboration`), binding the editor to a
  `Y.XmlFragment` instead of the plain `Y.Text` used before -- so formatted text merges across
  concurrent edits and persists to Redis the same way plain text did.
- Extensions: `StarterKit` (bold/italic/strike/underline/link/headings/lists come bundled in it under
  Tiptap v3) plus `@tiptap/extension-text-style` + `@tiptap/extension-color` for text color, which
  aren't part of StarterKit.

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
- **Deliberate temporary deviation: the first real destination (a Google Doc) is a direct Drive/Docs
  API integration in the server, not an MCP tool.** Building the MCP Host plus a remote-HTTP MCP
  server just to ship one destination was judged not worth the upfront cost before any destination
  existed at all. See `docs/IDEAS.md`'s Pending section for reconciling this back into the MCP
  architecture above once there's more than one destination to justify it.
- **Connections are per-user** (see Auth/Identity): each signed-in person maintains their own
  separate set of connected services (their own Google tokens, their own Dropbox tokens, etc.) and
  their own saved destinations -- none of it shared with other people using the same deployment.

## Hosting & Server Stack

- The client is React + Vite (+ TypeScript), matching `fairstream-client` and
  `fairstream-artist-dashboard`'s existing stack. Considered Vue as an alternative: neither Yjs nor
  MCP favors one framework over the other (Yjs is framework-agnostic; MCP is backend-only), so
  there was no technical reason to break from the toolchain already established elsewhere.
- A single Railway service hosts both the built React client and the Sync Server — one deploy, one
  origin, no separate frontend host. (Previously Fly.io; moved to Railway -- see git history around
  this bullet's change for the reasoning. Railway builds straight from the repo's root `Dockerfile`,
  so the container image itself didn't need to change.)
- The server app is written in Node.js/TypeScript, matching Yjs's native ecosystem (`y-websocket`
  and its persistence adapters are Node-first) and the MCP TypeScript SDK. It hosts both the Sync
  Server and the MCP Host in the same process — no reason to split them once MCP connections are
  remote-HTTP-only, so one Railway service covers all of it.
- **Build version marker**: what's actually deployed is identifiable via a build timestamp (Unix
  seconds), shown in the desktop UI header and in the server's `/healthz` response. The `Dockerfile`
  stamps it (`date +%s > BUILD_TIMESTAMP`) during the image build rather than deriving it from git —
  no need to smuggle `.git` into the Docker build context or thread a build-arg through the deploy
  command, and it's still a fresh, non-hand-maintained value on every image. Absent in local dev (no
  Docker build step); both the client and server fall back visibly (`"dev"` / `null`) rather than
  guessing.
- The datastore is Redis (provisioned via Railway's Redis plugin, reached over plain TCP with
  `ioredis` -- not Upstash's REST API, which Railway's Redis can't speak) — holds the CRDT snapshot,
  the send log, the
  destination registry, and Purgatory's contents. Chosen over MongoDB because everything Dispatch
  Desk stores is simple key → value/blob access, not data that needs flexible cross-record
  querying.

## Auth / Identity

- **Decision reversed**: Dispatch Desk now has real accounts and login -- superseding the original
  "single user, no accounts" decision. Trigger: destinations/connections (Google, Dropbox, etc.) are
  personal to each person using the app, not shared, which only makes sense with real per-user
  identity; and each person gets their own private desktop (see Core Problem/Goal's Scope bullet).
- **Sign-in mechanism: "Sign in with Google"**, using a minimal identity scope (who you are) kept
  separate from the broader Drive/Docs consent granted later when actually connecting Google as a
  destination -- avoids storing passwords, and keeps "log into Dispatch Desk" and "connect Google for
  Drive access" as the two distinct steps they conceptually are, even though both go through Google.
- **Access control: invite-only**, via an allowlist of permitted emails the operator controls (an env
  var) -- not open self-service signup. Fits where the app is today (the developer's own personal
  use) and generalizes cleanly to either of the two ways this might eventually go public (see
  `docs/IDEAS.md`'s Pending section): a self-hosted open-source release just has each operator set
  their own allowlist to whoever they want using their instance; a hosted subscription product would
  swap this allowlist step out for real self-service signup + billing -- a separate, larger effort,
  not being built now.
- Each user's data -- desktop content, connected-service tokens, saved destinations, send log -- is
  private to them: everything that used to live under one global Redis key becomes per-user-keyed.

## Access & Collaboration

- The app must be reachable and usable from any standards-compliant web browser — no native app,
  browser extension, or local install required.
- Opening the app in a new browser instance (a different browser, tab, or device) **while signed in
  as the same person** must show that person's desktop's current contents, not an empty or stale
  local copy.
- An edit made in one open instance must propagate live to every other open instance of the *same
  person's* desktop — the way a collaborative editor (e.g. Google Docs) behaves — not only on next
  load/refresh. (Collaboration here means multi-device for one person, not multiple different people
  sharing one document -- see Auth/Identity's per-user desktop decision.)

## Real-Time Sync Architecture

- The desktop's document model is a CRDT (e.g. Yjs), so concurrent edits from multiple open
  browsers merge automatically without server-side lock-stepping.
- Changes propagate over a WebSocket transport: a sync/relay server broadcasts each small update to
  every other connected client of the *same user's* desktop -- one room per user, not one global
  room. The WebSocket connection authenticates the connecting user (from their session) before
  routing them to their own room; it's how "per-user desktop" (Auth/Identity) is actually enforced,
  not just a client-side convention.
- "Delete on send" is implemented as removing that range from the shared CRDT doc — the deletion
  then propagates to every open browser the same way any other edit would.
- The sync server must persist the desktop's content to a real datastore so it survives restarts
  and a browser opening later sees current content, not just what's in memory.

## Open Flags / Risks

_(none currently open — every flag raised so far has been decided; see `IDEAS.md` for deferred,
not-yet-scheduled ideas like the local-machine MCP server.)_
