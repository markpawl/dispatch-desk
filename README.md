# Dispatch Desk

A text editor that acts like a desktop: type freely, then dispatch selected text to configured
destinations (email, cloud storage, a data store, an AI-routed location, and so on). See
`docs/PLATFORM-OVERVIEW.md` for the concept and `docs/REQUIREMENTS.md` for what's actually decided.

## Repository layout

- `client/` — React + Vite + TypeScript desktop UI.
- `server/` — Node.js + TypeScript Sync Server (+ the eventual MCP Host), deployed together with
  the built client as one Fly.io app.
- `docs/` — requirements, architecture, and planning docs.

See `CLAUDE.md` for commands and conventions.
