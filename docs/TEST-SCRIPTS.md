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
Login: users should be able to log in with valid credentials.
Expected behavior: submitting valid credentials from the login form should log the user in and redirect to the main application page.

#### Pending
