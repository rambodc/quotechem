# quotechem production app

QuoteChem is now structured around:
- public session-first chat intake on `Home`
- passwordless 6-digit email authentication after intake fields are collected
- session-to-user migration after code verification
- email testing tools in `More`

## Public Flow

1. User starts anonymous chat session.
2. AI collects intake fields:
- chemical name
- company
- destination
- quantity + unit
3. Once enough data is collected, user can request a 6-digit login code by email.
4. User enters code; app signs in with Firebase custom token (no password).
5. Session profile/messages are copied to user data and temp session is deleted.

## Functions

Implemented HTTP functions:
- `createPublicSession`
- `chatPublicAssistant`
- `sendLoginCode`
- `verifyLoginCode`
- `sendTestEmail`
- `submitQuoteLead`

## Required Functions Secrets

Set these with Firebase secrets:
- `OPENAI_API_KEY`
- `SENDGRID_API_KEY`
- `QUOTECHEM_FROM_EMAIL`
- `QUOTECHEM_SALES_EMAIL`

Optional non-secret env:
- `OPENAI_MODEL` (default `gpt-4o-mini`)

## Frontend Env

- `REACT_APP_QUOTECHEM_API_BASE` (recommended)
- `REACT_APP_FIREBASE_PROJECT_ID` (fallback)

## Deploy (functions only)

```bash
firebase deploy --project quotechemfb --only functions
```
