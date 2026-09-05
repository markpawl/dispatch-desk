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

1. [later] Local-machine MCP server for local filesystem destinations: reach down to the user's own
   machine via its own tunneled MCP server (mirroring `fairstream-artist-server`'s
   Cloudflare-tunnel pattern), so destinations like "a new file in a project folder" could target
   a real local directory instead of cloud storage. Deferred for now — real added complexity for
   little gain while everything else is cloud-hosted; revisit once the cloud-storage-only approach
   (Google Drive/Dropbox) proves limiting. See `docs/REQUIREMENTS.md`'s Destination Architecture
   section for the current decision.

#### Addressed

1. Destinations - MCP integration: Model each destination as an MCP (Model Context Protocol) tool
   exposed by a connected MCP server, with Dispatch Desk acting as an MCP host. _(Decided — see
   docs/REQUIREMENTS.md's Destination Architecture section, which also now covers granularity —
   one destination = one tool, not one server — and transport — remote HTTP only, no local stdio.)_
2. Real-time sync - implementation approach: Use a CRDT (e.g. Yjs) as the desktop's document model
   so concurrent edits from multiple open browsers merge automatically, over a WebSocket transport
   that broadcasts small updates to every connected client. _(Decided — see docs/REQUIREMENTS.md's
   Real-Time Sync Architecture and Hosting & Server Stack sections: Node.js/TypeScript, Redis, a
   single Fly.io app.)_
