# Dispatch Desk Scripts for Manual Testing

Living document.
Contains scripts for manual testing of specific app features.
Manual testing is performed by developers to ensure the app behaves as expected.
Scripts are organized by feature and include steps to reproduce the behavior.
Scripts can be created by developers or by asking AI to generate them.
Scripts are numbered and include a description of the feature being tested.
Numbering allows easier communication between developers and AI.
This document contains two lists:
1. scripts for already implemented features.
2. scripts for pending features.
Format: 1. 
{feature}: {feature description} carriage-return, 
"Expected behavior: " {description of expected behavior} carriage-return,
"Steps to reproduce: " carriage-return,
numbered list of steps to reproduce the behavior.

All the scripts for already implemented features are listed in the "Current" section.
New items should be added at the top of the "Pending" section. When a feature has been implemented then any related script is moved from pending to current.
Kept in sync with what's actually built: if a feature is removed from `docs/REQUIREMENTS.md` and the app, delete its scripts here too (from either section) rather than leaving them stale.

### Manual Testing Scripts

#### Current
1. Login: users should be able to sign in with Google and reach the desktop.
Expected behavior: signed out, the app shows the same desktop shell as signed in (header,
toolbar, Send button, Destinations sidebar, editor area), with everything in it disabled except
the header's corner "Log In" button. Clicking "Log In" opens a popover listing login options
(just "Sign in with Google" for now); it never appears on its own. Choosing it takes the user
through Google's account chooser and back to the desktop, now fully interactive, showing their
name in place of "Log In" and a "CONNECTED" sync status. An account not on the server's
`ALLOWED_EMAILS` allowlist is rejected with a 403 instead of being signed in.
Steps to reproduce:
1. Sign out if currently signed in (account menu, top-right → "Sign out"), or open the app in a
   fresh/incognito session.
2. Confirm the shell renders as normal (header, toolbar, editor box) but every button is disabled
   and the editor isn't typeable, except a "Log In" button in the header's top-right corner.
3. Confirm no login popover is visible yet, then click "Log In".
4. Confirm a popover appears listing "Sign in with Google"; click it.
5. Choose the Google account to sign in with (must be on the allowlist; while the OAuth client is
   in Testing publishing status, it must also be on the Google Cloud Console test-users list).
6. Complete any additional Google verification step if prompted (e.g. a passkey check).
7. Confirm the app returns to the desktop, now fully interactive: the corner button shows the
   signed-in user's name instead of "Log In", and the sync status reads "CONNECTED".
8. (Negative case) Sign out, then attempt steps 3-6 with a Google account *not* on the allowlist;
   confirm it's rejected ("This Google account is not authorized for Dispatch Desk") rather than
   signed in.

2. Create a destination: the destination sidebar creates a new destination (Email, Google Doc, or
Dropbox File) via a channel → form → save flow, with an optional "start with existing" template.
Expected behavior: clicking a channel in the sidebar's Channels list opens a creation form for
that type; submitting its required fields creates the destination, which then appears in the
Destinations list labeled by its `shortLabel`. Picking "start with existing" prefills the form
from a same-type destination, still editable before Save.
Steps to reproduce (Email; Google Doc/Dropbox follow the same shape, see note below):
1. While signed in, click the toolbar's "Destinations" toggle to open the sidebar.
2. Confirm the "Channels" list shows Email, Google Doc, and Dropbox File.
3. Click "Email".
4. Confirm a form appears with Address, Short label, and an optional Email subject label fields
   (plus a "Start with existing" button if any email destination already exists).
5. Enter an address (e.g. your own) and a short label (e.g. "Test Email"); leave the subject
   label blank for now.
6. Click "Save".
7. Confirm the form closes and "Test Email" now appears in the Destinations list.
8. Repeat steps 3-6 once more with a different short label, then click "Start with existing" on
   the new form and pick the first destination — confirm its address/label prefill, still
   editable, before saving.
9. Confirm the "×" next to a Destinations row opens an inline "Delete "<label>"?" confirm, and
   that Delete removes it while Cancel leaves it in place.
Note: Google Doc/Dropbox forms additionally require connecting that provider first (a "Connect
Google"/"Connect Dropbox" link appears in the form if not yet connected) and use a search-and-pick
box in place of a typed address to choose the doc/file.

3. Send content: select text on the desktop and dispatch it to a saved destination.
Expected behavior: the toolbar's "Send" button is enabled only with a non-empty selection;
clicking it lists saved destinations by their short label, and clicking one sends the selected
text to it, then deletes that text from the desktop. With no destinations saved yet, "Send"
opens the create-destination form itself instead of an empty list, and offers a "Send from
<label>" button once one is created. For an email destination, the delivered subject line is
`{emailSubjectLabel or shortLabel} {mm/dd/yyyy HH:mm} {sequence number}`, the sequence number
zero-based and incrementing per send to that destination that day.
Steps to reproduce:
1. Type some text on the desktop (or use existing text) and select it.
2. Confirm "Send" is disabled with no selection, and enabled once text is selected.
3. Click "Send".
4. Confirm a popover lists your saved destinations (e.g. "Test Email" from the Create-a-destination
   script) by their short label.
5. Click that destination.
6. Confirm the popover closes and the selected text is removed from the desktop.
7. For an email destination, check the recipient inbox: confirm the message body matches the sent
   text and the subject matches the expected format, with sequence number 0 for the first send
   that day.
8. Select and send a second piece of text to the same email destination; confirm the sequence
   number increments (e.g. to 1).
9. (Empty-state case) Delete all destinations (see script 2's step 9), then select text and click
   "Send" again; confirm it opens the create-destination form (channel picker) directly, and that
   saving a destination there offers a "Send from <label>" button that sends immediately.

#### Pending
