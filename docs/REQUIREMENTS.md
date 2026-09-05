# Dispatch Desk — Requirements

Living document. Each section has a **Background** (context, not itself a decision) and
**Requirements** (numbered decisions) subsection.

## Multi-browser access & live sync

### Background
Originally conceived as a single local text editor (see `PLATFORM-OVERVIEW.md`). Decided
2026-09-05: the app needs to be usable from any browser, and behave like a collaborative editor —
not a per-browser local document — so several open browser instances all reflect the same live
desktop state.

### Requirements
1. The app must be reachable and usable from any standards-compliant web browser — no native app,
   browser extension, or local install required.
2. Opening the app in a new browser instance (a different browser, tab, or device) must show the
   desktop's current contents, not an empty or stale local copy.
3. An edit made in one open instance must propagate live to every other open instance — the way a
   collaborative editor (e.g. Google Docs) behaves — not only on next load/refresh.
