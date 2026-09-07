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

1. [later] Going public, once the app is good enough to announce: two directions under
   consideration, possibly both -- (a) a hosted subscription product anyone can pay to sign up for,
   which needs self-service signup + billing, replacing the invite-only allowlist from
   `docs/REQUIREMENTS.md`'s Auth/Identity section; (b) an open-source release for self-hosting, which
   needs packaging/install docs but otherwise reuses the same per-user-accounts code as-is (a
   self-hoster just sets their own allowlist). Not started -- current work is the invite-only,
   developer's-own-use phase both of these build on top of.
2. [destinations] Reconcile the Google Doc destination into the MCP Host architecture: it shipped as
   a direct Drive/Docs API integration in the server (see `docs/REQUIREMENTS.md`'s Destination
   Architecture section) rather than through an MCP Host/server, since standing up MCP infrastructure
   before any destination existed wasn't worth the upfront cost. Revisit once there's a second
   destination to justify building the MCP Host for real.
3. [destinations] Harden what's live first: before adding destination features, add tests/health
   checks around the Sync Server + Redis persistence, confirm Fly secrets are set, and consider a
   `/health` endpoint. Lower risk, but no new user-facing capability.
4. [destinations] UI-first build order: build the right-click menu and destination sidebar
   (`docs/REQUIREMENTS.md`'s Key User Flows) against a stubbed/fake destination list, then swap in
   the real MCP Host once the UI is settled. Faster to see/demo, but risks rework if the MCP
   integration surfaces something the UI didn't anticipate.
5. [destinations] Smallest end-to-end vertical slice: build the MCP Host in the server process plus
   exactly one real destination, and wire the minimal send flow — select text → send to that
   destination → log entry + delete from desktop — fully end-to-end before building the sidebar,
   Smart routing, or Purgatory. Superseded for now by item 2 above (the Google Doc destination
   shipped without the MCP Host); revisit alongside it.
6. [later] Local-machine MCP server for local filesystem destinations: reach down to the user's own
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
3. Client - Header - version number: originally proposed as a sequential version number
   incrementing each deploy, next to the app title, smaller font and medium grey. _(Landed as a
   build timestamp instead of a literal sequential counter, per follow-up discussion — see
   docs/REQUIREMENTS.md's Hosting & Server Stack section. Also exposed via the server's `/healthz`
   endpoint. `Dockerfile` stamps `BUILD_TIMESTAMP` (Unix seconds) during the image build;
   `client/src/vite-env.d.ts` + `App.tsx` (`.version` -- 0.75rem, `#888`, matching the smaller/grey
   ask) and `server/src/version.ts` + `index.ts`'s `/healthz` read it, falling back to `"dev"`/`null`
   in local dev.)_
4. [destinations] Right-side area with two lists — channels and destinations: a togglable panel on
   the right edge of the screen showing two separate lists, **channels** (the available destination
   types/mechanisms) and **destinations** (the configured instances created from them), rather than
   the single destinations list `docs/REQUIREMENTS.md` previously described. _(Landed the panel
   itself with dummy/hardcoded data for both lists — see `docs/REQUIREMENTS.md`'s Destination
   sidebar section and `client/src/components/DestinationsPanel.tsx`, toggled from a toolbar
   button. Still open: the actual "create a destination by picking a channel and supplying its
   config" flow — that's real functionality, not layout, and falls out of the still-pending MCP
   Host work above (items 1 and 3).)_
