# quotechem production app

This repository now contains a cleaned production starter focused on:
- `Home`: ChatGPT-style assistant workspace UI
- `More`: account entry point + logout
- `Account`: change email, change password, edit username

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

## ChatGPT backend plan

Implementation plan is documented in:
- `src/docs/CHATGPT_IMPLEMENTATION_PLAN.md`
