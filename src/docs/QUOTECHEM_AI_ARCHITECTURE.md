# QuoteChem Session + Passwordless Auth Architecture

## Core User Journey
1. User chats anonymously (no sign-in required).
2. System stores temporary session + messages in Firestore.
3. AI collects quote intake fields in chat.
4. After enough intake data, user enters email and requests a 6-digit OTP code.
5. User verifies code in app.
6. Backend creates/finds Firebase user, returns custom token, and frontend signs in passwordlessly.
7. Session data is migrated to user-owned records and temporary session is deleted.

## Intake Fields
Required intake fields:
- `chemicalName`
- `companyName`
- `destinationCountry`
- `quantity`
- `quantityUnit`

Auth-ready gate fields:
- `chemicalName`
- `companyName`
- `destinationCountry`
- `quantity`

And at least 2 user turns in chat.

## Backend Endpoints
Implemented in `functions/publicQuoteChat.js`:

- `createPublicSession` (POST)
- `chatPublicAssistant` (POST)
- `sendLoginCode` (POST)
- `verifyLoginCode` (POST)
- `sendTestEmail` (POST)
- `submitQuoteLead` (POST)

## Firestore Collections

### `publicChatSessions/{sessionId}`
Temporary chat session state.

### `publicChatSessions/{sessionId}/messages/{messageId}`
Temporary session chat history.

### `loginChallenges/{challengeId}`
OTP challenges (hashed code, expiry, attempts, used state).

### `users/{uid}`
User profile and latest quote profile.

### `users/{uid}/chatSessions/{sessionId}`
Migrated session metadata after OTP verification.

### `users/{uid}/chatSessions/{sessionId}/messages/{messageId}`
Migrated session messages.

### `quoteLeads/{leadId}`
Lead records for quote handoff.

## Email Templates for Testing
Admin email test sends support:
- `userInvite`
- `existingUserAccess`
- `rfqConfirmation`
- `genericNotification`

## Secrets Required
- `OPENAI_API_KEY`
- `EMAIL_SMTP_USER`
- `EMAIL_SMTP_PASSWORD`
- `EMAIL_FROM_ADDRESS`
- `QUOTECHEM_SALES_EMAIL`

Optional env:
- `OPENAI_MODEL`
- `EMAIL_SMTP_HOST`
- `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_SECURE`
- `EMAIL_FROM_NAME`
