# Dispatch Desk Ideas

Living document.
Ideas regarding app features and business are added here.
Developers contribute ideas by manually editing the document or by asking AI to add them.
This document lists ideas and open questions for the app that may be considered for future development. Format for entries is as shown below:

Format: 1. {topic}: {idea text}

New items should be added at the top of the "Pending" section. When an idea is
implemented, move it to the "Addressed" section with a short note on where it
landed.

### App and Business Ideas

#### Pending

_Ordered easiest to hardest to implement._

1. Real-time sync - implementation approach: Use a CRDT (e.g. Yjs) as the desktop's document model
   so concurrent edits from multiple open browsers merge automatically, over a WebSocket transport
   that broadcasts small updates to every connected client. Sync/relay server options: self-host a
   small Node relay (e.g. based on y-websocket) with a persistence hook into a real datastore
   (Postgres/SQLite/Redis) so content survives restarts; or use a managed realtime backend built
   for this (PartyKit, Liveblocks) to avoid running the persistent-connection infrastructure
   yourself. Hosting note: this needs a process that can hold long-lived connections, which doesn't
   fit a plain Vercel serverless function (same limitation already flagged for fed-server) — either
   host the sync server somewhere always-on (Fly.io, Render, a VPS) or push it to a managed service
   and keep the static frontend on Vercel. "Delete on send" would just be removing that range from
   the shared CRDT doc, propagating the deletion to every open browser the same way any edit would.
2. Destinations - MCP integration: Model each destination as an MCP (Model Context Protocol) tool
   exposed by a connected MCP server, with Dispatch Desk acting as an MCP host. Sending text to a
   destination = calling that tool with the selected text. This would let destination integrations
   (including auth) come largely for free from existing MCP servers instead of bespoke connectors
   per destination type, and would give the Smart-destination feature a natural source of metadata
   (each tool's own name/description, matched against selected text the same way an LLM picks among
   tool schemas generally). The destination sidebar would become a live view over connected
   servers' `list_tools`/`list_resources`, and Purgatory's re-check trigger would line up with
   MCP's connect/disconnect lifecycle (re-run matching whenever a server connects or its tool list
   changes). Open questions: is a destination one whole MCP server or one tool within a server
   (finer-grained); does the app run locally (stdio transport) or hit remote MCP servers over HTTP.

#### Addressed

_(none yet)_
