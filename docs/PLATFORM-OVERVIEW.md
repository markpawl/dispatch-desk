## Description
Dispatch Desk is an app that fronts as a text editor but behaves like a desktop: a freeform space
for typing whatever comes to mind, with no destination decided up front. Later, selected text is
routed to one of a set of configured **destinations** rather than being filed away as you write.

The core interaction: select text, right-click, choose "destinations," pick one, and confirm send.
On send, the app writes a log entry and then deletes the sent text from the desktop — the desktop
is meant to stay a transient working surface, not an archive. Destination examples: email to
someone, a new file in a project folder, appended to an existing document, a row in a data store,
or merged by AI into whichever of several files in a project directory it best fits.

Two features build on top of that base flow:
- **Smart destination** — right-click → Destination → Smart invokes AI to suggest which registered
  destination a selection belongs to, instead of the user picking manually.
- **Destination sidebar** — a togglable panel on the right edge of the screen listing all
  destinations, so text can be sent without going through the right-click menu.

A third feature, **Purgatory**, holds text that doesn't currently match any registered destination.
When a new destination is registered, the system re-checks Purgatory's contents and moves over
anything that now qualifies.

**Not yet decided: how destinations connect under the hood.** One idea being explored — modeling
each destination as an MCP (Model Context Protocol) tool, with Dispatch Desk itself acting as an
MCP host — is recorded in `IDEAS.md` rather than here, since it's a proposed direction, not a
settled design.

This is still an early concept — see `IDEAS.md` for open ideas/questions and
`PLATFORM-COMPONENTS.md` / `PLATFORM-ARCHITECTURE.md` for design once components and structure are
decided.

## Authentication
Not yet decided — no auth/identity model has been discussed for this app.
