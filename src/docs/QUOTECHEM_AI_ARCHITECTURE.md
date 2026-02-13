# QuoteChem AI Architecture and Data Plan

## Product Goal
Public users chat without sign-in, describe chemical sourcing needs, receive guidance, and submit contact details to request a quote.

## Core Backend Endpoints
Implemented in `functions/publicQuoteChat.js`:

1. `createPublicSession` (POST)
- Input: `{ sessionId?, metadata? }`
- Output: `{ ok, sessionId, session }`
- Purpose: create/restore anonymous session.

2. `chatPublicAssistant` (POST)
- Input: `{ sessionId, message, metadata? }`
- Output: `{ ok, assistant, profile, leadReady }`
- Purpose: persist user message, call OpenAI, extract quote fields, persist assistant response.

3. `submitQuoteLead` (POST)
- Input: `{ sessionId, email, contactName?, companyName?, phone?, notes? }`
- Output: `{ ok, leadId, sessionId, emailed }`
- Purpose: finalize lead in Firestore and send internal email via SendGrid.

## Firestore Data Model

### `publicChatSessions/{sessionId}`
- `sessionId: string`
- `status: "active" | "closed"`
- `profile: map`
  - `chemicalName`
  - `quantity`
  - `quantityUnit`
  - `puritySpec`
  - `destinationCountry`
  - `destinationPostalCode`
  - `shippingMode`
  - `incoterm`
  - `packagingType`
  - `timeline`
  - `targetPrice`
  - `companyName`
  - `contactName`
  - `email`
  - `phone`
  - `notes`
- `metadata: map`
  - `locale`
  - `referrer`
  - `userAgent`
- `messageCount: number`
- `leadCaptured: boolean`
- `createdAt, updatedAt, lastMessageAt`

### `publicChatSessions/{sessionId}/messages/{messageId}`
- `role: "user" | "assistant"`
- `content: string`
- `createdAt`
- assistant-only metadata:
  - `intent`
  - `confidence`
  - `missingFields[]`
  - `model`

### `quoteLeads/{leadId}`
- `leadId`
- `sessionId`
- `source: "public_chat"`
- `profile` (snapshot of latest extracted info)
- `status: "new"`
- `createdAt`

## AI Behavior
OpenAI is instructed to return strict JSON with:
- `assistant_reply`
- `intent`
- `extracted`
- `missing_fields`
- `confidence`

Required quote fields to reach lead-ready state:
- `chemicalName`
- `quantity`
- `quantityUnit`
- `destinationCountry`
- `shippingMode`
- `timeline`
- `email`

## Session Strategy
Frontend stores `sessionId` in local storage.
- On first visit: call `createPublicSession`.
- On return visit: reuse existing `sessionId` to continue same chat context.

## SendGrid Workflow
On `submitQuoteLead`:
1. write lead to `quoteLeads`
2. if `QUOTECHEM_SALES_EMAIL` exists, send summary email
3. mark session `leadCaptured: true`

## Required Environment Variables
Set in Firebase Functions env/secrets:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
- `SENDGRID_API_KEY`
- `QUOTECHEM_SALES_EMAIL`
- `QUOTECHEM_FROM_EMAIL` (optional)

Set in frontend `.env`:
- `REACT_APP_QUOTECHEM_API_BASE` (recommended)
- `REACT_APP_FIREBASE_PROJECT_ID` (fallback for endpoint auto-build)

## Production Hardening (Next)
1. Add per-session and per-IP throttling.
2. Add abuse filtering and blocked content categories.
3. Add internal quote policy engine (price bands by chemical + location).
4. Add lead routing rules by destination and chemical class.
5. Add scheduled cleanup policy for stale sessions.
