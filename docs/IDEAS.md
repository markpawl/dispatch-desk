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

_(none yet)_

#### Addressed

1. Destinations - MCP integration: Model each destination as an MCP (Model Context Protocol) tool
   exposed by a connected MCP server, with Dispatch Desk acting as an MCP host. _(Decided — see
   docs/REQUIREMENTS.md's Destination Architecture section. Still open there as flags: destination
   granularity (one MCP server vs. one tool within a server) and transport (local stdio vs. remote
   HTTP).)_
2. Real-time sync - implementation approach: Use a CRDT (e.g. Yjs) as the desktop's document model
   so concurrent edits from multiple open browsers merge automatically, over a WebSocket transport
   that broadcasts small updates to every connected client. _(Decided — see docs/REQUIREMENTS.md's
   Real-Time Sync Architecture section. Still open there as flags: which sync/relay hosting option
   (self-hosted Node relay + datastore vs. a managed realtime backend like PartyKit/Liveblocks) and
   where it runs, since it needs long-lived connections a plain Vercel serverless function can't
   hold.)_
