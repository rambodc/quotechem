# quotechem production app

This repository now contains a cleaned production starter focused on:
- `Home`: public QuoteChem chat intake experience
- `More`: product info plus optional account entry
- `Account`: signed-in credential management pages

## Branch and deploy behavior

- `production`: deploys Firebase Hosting to `quotechemfb`
- `dev`: currently not used for deploys

## Firebase project mapping

`.firebaserc` maps both default and prod to:
- `quotechemfb`

## Required GitHub secrets

Add these in GitHub repo settings (Environment `Prod` or repository-level):

- `GCP_WIF_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `FIREBASE_API_KEY`
- `FIREBASE_APP_ID`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_MEASUREMENT_ID` (optional)
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `REACT_APP_APPCHECK_SITE_KEY`

## Workflows

- `.github/workflows/firebase-hosting-merge.yml`: deploy on push to `production`
- `.github/workflows/firebase-hosting-pull-request.yml`: PR preview deploys to `quotechemfb`

## Local env

Use `env.example` as reference for `.env.local` values.

## Public Chat Backend

Implemented endpoints:
- `createPublicSession`
- `chatPublicAssistant`
- `submitQuoteLead`

Detailed architecture:
- `src/docs/QUOTECHEM_AI_ARCHITECTURE.md`

Functions secrets to set:
- `OPENAI_API_KEY`
- `SENDGRID_API_KEY`
- `QUOTECHEM_SALES_EMAIL`
- `QUOTECHEM_FROM_EMAIL`

Functions non-secret env:
- `OPENAI_MODEL` (optional, default `gpt-4o-mini`)

Frontend env:
- `REACT_APP_QUOTECHEM_API_BASE` (recommended, full functions base URL)
- `REACT_APP_FIREBASE_PROJECT_ID` (fallback for endpoint auto-build)
