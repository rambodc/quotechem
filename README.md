# quotechem production app

QuoteChem now runs as a chat-only application.

## Product behavior
- no separate sign-in/sign-up pages
- no form-based auth UI
- all interaction is through chat messages on `/home`
- passwordless authentication is triggered and completed through chat

## Chat-only auth flow
1. User chats anonymously in a temporary session.
2. AI collects required intake fields.
3. User sends email in chat when auth is ready.
4. Backend sends 6-digit code by email.
5. User replies with code in chat.
6. Backend verifies code, returns custom token, frontend signs in.
7. Session data migrates into user data and temp session is removed.

## Functions
- `createPublicSession`
- `chatPublicAssistant`
- `sendLoginCode`
- `verifyLoginCode`
- `sendTestEmail`
- `submitQuoteLead`

## Chat test commands
- `/test basic you@company.com`
- `/test quote_status you@company.com`

## Required Functions Secrets
- `OPENAI_API_KEY`
- `SENDGRID_API_KEY`
- `QUOTECHEM_FROM_EMAIL`
- `QUOTECHEM_SALES_EMAIL`

Optional non-secret env:
- `OPENAI_MODEL` (default `gpt-4o-mini`)

## Frontend env
- `REACT_APP_QUOTECHEM_API_BASE`
- `REACT_APP_FIREBASE_PROJECT_ID` (fallback)

## Deploy (functions only)
```bash
firebase deploy --project quotechemfb --only functions
```
