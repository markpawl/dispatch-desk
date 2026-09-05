Companion to [`PLATFORM-OVERVIEW.md`](PLATFORM-OVERVIEW.md).

The system can be shown as several focused views rather than one dense diagram, once there's
enough design settled to diagram. Each view is a D2 source in [`diagrams/`](diagrams/) rendered to
an SVG next to it; regenerate with [`diagrams/render.sh`](diagrams/render.sh) (needs
[`d2`](https://d2lang.com)). Convention: dashed + faded = deferred (future phase).

## Components

| Component | Kind | Where it runs | Role |
|-----------|------|---------------|------|
| Dispatch Desk (client) | React web app | Any standards-compliant browser; served as static assets from the Fly.io app | The desktop/editor UI; holds a local CRDT replica; select-and-dispatch flow to destinations |
| Sync Server | Relay service (Node.js/TypeScript, `y-websocket`) | Fly.io (single app, alongside the client) | Broadcasts CRDT updates between every open client over WebSocket; persists desktop content |
| Datastore | Redis (e.g. Upstash) | Managed Redis | Durable storage for the desktop's content |
| MCP Host | Dispatch Desk's own MCP-client role (Node.js/TypeScript) | Likely the same Fly.io server process as the Sync Server (not yet explicitly confirmed) | Knows every connected destination; routes dispatched text to the right MCP tool; powers Smart-destination AI matching |
| MCP Server (per destination) | External/attached service | Remote HTTP only (e.g. Google Drive, Dropbox) — no local stdio for now | Exposes one or more tools, each a selectable destination (email, file write, data-store insert, etc.) |

## Connection notes

- **Dispatch Desk acts as an MCP host.** It connects out to one or more MCP servers, and each tool
  an MCP server exposes becomes a selectable destination — sending text to a destination is calling
  that tool with the selected text. This is what lets destination integrations (including their
  auth) come largely for free from existing MCP servers, rather than being built as bespoke
  connectors per destination type.
- **MCP servers are external/attached components, not part of Dispatch Desk itself** — the app's
  own code is only the MCP-host role plus the client and sync pieces; every actual destination
  (an email sender, a project-file writer, a data-store) lives in whatever MCP server exposes it,
  on-premises or third-party.
- **The MCP Host only reaches out over remote HTTP, for now** — no stdio subprocesses, and no
  tunneling down to the user's own machine. File/folder-shaped destinations therefore go through
  cloud storage (Google Drive and/or Dropbox) rather than a local directory; reaching a real local
  machine would need its own tunneled MCP server (the same pattern `fairstream-artist-server`
  already uses with Cloudflare) and is deferred — see `docs/IDEAS.md`.
- **The Smart-destination feature is standard MCP tool-selection**: the MCP Host hands an LLM the
  selected text plus every connected server's tool descriptions (from `list_tools`) and has it pick
  one, the same mechanism that powers tool use generally, pointed at destinations instead of
  arbitrary tools.
- **The destination sidebar and Purgatory both read from the same live view** of what's currently
  connected (`list_tools`/`list_resources` across servers). Purgatory's re-check trigger lines up
  with MCP's own connect/disconnect lifecycle — re-run matching whenever a server connects or its
  tool list changes.
- **Sync and destination-routing are two separate connection paths out of the client.** Every open
  Dispatch Desk client holds a live WebSocket connection to the Sync Server for real-time content
  sync, independent of whatever connection the MCP Host maintains to MCP servers.
- **The Sync Server needs long-lived connections**, which rules out a plain serverless function
  (the same constraint already noted for `fairstream-federation-server` on Vercel) — this is why
  it's hosted on Fly.io rather than Vercel, in a single app alongside the client's static build.
