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
#### Addressed

1. Destinations - MCP integration: Model each destination as an MCP (Model Context Protocol) tool
   exposed by a connected MCP server, with Dispatch Desk acting as an MCP host. _(Decided — see
   docs/REQUIREMENTS.md's Destination Architecture section. Still open there as flags: destination
   granularity (one MCP server vs. one tool within a server) and transport (local stdio vs. remote
   HTTP).)_
