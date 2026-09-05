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

**Destinations are modeled as MCP (Model Context Protocol) tools.** Dispatch Desk acts as an MCP
host: each connected MCP server can expose one or more tools, and each such tool is a selectable
destination (e.g. an email-sending tool, a project-directory write/append tool, a data-store insert
tool). Sending text to a destination is calling that tool with the selected text. This means:
- Destination integrations — including their auth — come largely for free by connecting to
  existing MCP servers, rather than building bespoke connectors per destination type.
- The Smart-destination feature is standard MCP tool-selection: hand an LLM the selected text plus
  the connected servers' tool descriptions (from `list_tools`) and have it pick one — the same
  mechanism that powers tool use generally, pointed at destinations instead of arbitrary tools.
- The destination sidebar is a live view over `list_tools`/`list_resources` across connected
  servers.
- Purgatory's re-check trigger lines up with MCP's own connect/disconnect lifecycle: re-run
  matching against the current tool descriptions whenever a server connects or its tool list
  changes.

See `docs/REQUIREMENTS.md`'s Destination Architecture section for the decision, and its Open
Flags/Risks for what's still unresolved (destination granularity, local vs. remote transport).

This is still an early concept — see `IDEAS.md` for open ideas/questions and
`PLATFORM-COMPONENTS.md` / `PLATFORM-ARCHITECTURE.md` for design once components and structure are
decided.

## Authentication
Not yet decided — no auth/identity model has been discussed for this app.
