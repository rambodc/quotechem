# quotechem production app

QuoteChem uses:
- public session-first chat on `Home`
- chat-only passwordless sign-in (6-digit email code)
- authenticated routes (`More`, `Account`) after chat sign-in

## Chat-only auth behavior
- user chats as guest session
- once intake is sufficient, user sends email in chat
- backend sends OTP to email
- user sends OTP in chat
- backend returns Firebase custom token
- frontend signs in with custom token

## Functions
- `createPublicSession`
- `chatPublicAssistant`
- `sendLoginCode`
- `verifyLoginCode`
- `sendTestEmail`
- `submitQuoteLead`

## Chat commands
- `/test basic you@company.com`
- `/test quote_status you@company.com`

## Required Functions Secrets
- `OPENAI_API_KEY`
- `SENDGRID_API_KEY`
- `QUOTECHEM_FROM_EMAIL`
- `QUOTECHEM_SALES_EMAIL`

## Frontend env
- `REACT_APP_QUOTECHEM_API_BASE`
- `REACT_APP_FIREBASE_PROJECT_ID` (fallback)

## Deploy functions only
```bash
firebase deploy --project quotechemfb --only functions
```
