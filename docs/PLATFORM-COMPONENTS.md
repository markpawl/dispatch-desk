# Dispatch Desk Components
This file documents the app's components.

---

## 1. Editor Client

### Dispatch Desk (web client)
* **Purpose:** the desktop/editor UI — freeform typing surface, plus the select → right-click (or
  sidebar) → destination → confirm dispatch flow, Smart-destination request, and Purgatory display.
* **Runtime & Environment:** React web app, runs in any standards-compliant browser; holds a local
  CRDT (Yjs) replica of the desktop's content.
* **Actor Interactions:** used directly by the desktop's user.
* **Component Interactions:** holds a live WebSocket connection to the **Sync Server** for
  real-time content sync; calls the **MCP Host** to list available destinations and to dispatch
  selected text to a chosen one.

---

## 2. Sync & Persistence

### Sync Server
* **Purpose:** relay CRDT updates between every open Dispatch Desk client instance, so all of them
  reflect the same live desktop.
* **Runtime & Environment:** a process holding long-lived WebSocket connections — needs an
  always-on host, not a plain serverless function. Whether this is self-hosted (e.g. a small Node
  relay) or a managed realtime backend (PartyKit, Liveblocks) isn't decided yet.
* **Actor Interactions:** none directly — a backend piece.
* **Component Interactions:** every open **Dispatch Desk** client connects here over WebSocket;
  writes content snapshots to the **Datastore**.

### Datastore
* **Purpose:** durable storage for the desktop's content, so it survives Sync Server restarts and
  a client opening later sees current content rather than an empty one.
* **Runtime & Environment:** a real datastore — which one (Postgres/SQLite/Redis) isn't decided
  yet.
* **Actor Interactions:** none directly.
* **Component Interactions:** written to by the **Sync Server**.

---

## 3. Destination Routing

### MCP Host
* **Purpose:** Dispatch Desk's own role as an MCP client — it knows about every connected
  destination, dispatches selected text to whichever one is chosen, and powers the
  Smart-destination feature by matching selected text against connected servers' tool
  descriptions.
* **Runtime & Environment:** not yet decided whether this runs in-browser or as a separate backend
  service — see `docs/REQUIREMENTS.md`'s Open Flags/Risks (local stdio vs. remote HTTP transport).
* **Actor Interactions:** invoked by the desktop's user via the **Dispatch Desk** client (right-click
  → destination, sidebar send, or Smart request).
* **Component Interactions:** connects to every registered **MCP Server**; calls an LLM for
  Smart-destination matching.

### MCP Server (one per destination, or one per group of destinations)
* **Purpose:** exposes one or more tools, each a selectable destination (e.g. send-email,
  append-to-file, insert-into-data-store).
* **Runtime & Environment:** varies per server — a local stdio process or a remote HTTP service;
  existing/off-the-shelf MCP servers can be connected directly rather than built from scratch.
* **Actor Interactions:** none directly.
* **Component Interactions:** registered with the **MCP Host**; invoked (tool call) when text is
  dispatched to one of its destinations.
