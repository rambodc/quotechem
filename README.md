# Razzberry CI/CD with Firebase Hosting

Branch-based environments deploy a compiled React app to Firebase Hosting, with API routes rewritten to Cloud Functions.

Branches
- `dev`: deploys to the development Firebase project (`razz6-92831`)
- `prod`: deploys to the production Firebase project (`production1-fbd5d`)
- `main`: default branch; no deployszz

## Setup

1) Firebase projects
- `.firebaserc` already maps:
  - dev → `razz6-92831`
  - prod → `production1-fbd5d`
- Update these IDs only if your project IDs change.

2) GitHub secrets (service accounts + React env)
- Workflows use service account JSON, not `FIREBASE_TOKEN`.
- Add the following repository or environment secrets (names must match the workflows):
  - `FIREBASE_SERVICE_ACCOUNT_RAZZ6_92831` (Dev) – Service account JSON for `razz6-92831`
  - `FIREBASE_SERVICE_ACCOUNT_PRODUCTION1_FBD5D` (Prod) – Service account JSON for `production1-fbd5d`
  - React build env (used to generate `.env`):
    - `FIREBASE_API_KEY`
    - `FIREBASE_APP_ID`
    - `FIREBASE_AUTH_DOMAIN`
    - `FIREBASE_MEASUREMENT_ID` (optional)
    - `FIREBASE_MESSAGING_SENDER_ID`
    - `FIREBASE_PROJECT_ID`
    - `FIREBASE_STORAGE_BUCKET`

3) Branch protection (recommended)
- Protect `prod`/`dev` as needed; keep `main` open for regular work.

## Deploy Behavior
- Push to `dev` → Deploys Hosting to `razz6-92831` (live channel)
- Push to `prod` → Deploys Hosting to `production1-fbd5d` (live channel)
- Pull Request → Builds and publishes a Hosting preview channel URL

## Hosting & Build
- Hosting serves the compiled app from `build/` (see `firebase.json`).
- This repo uses Create React App (`react-scripts build`).
- SPA fallback and API rewrites are configured.

### API Rewrites (firebase.json)
- `/api/createStripeCheckoutSession` → Cloud Function `createStripeCheckoutSession` (us-central1)
- `**` → `/index.html` (SPA fallback)

## Workflows
- `.github/workflows/firebase-hosting-merge-dev.yml` – Deploy on push to `dev`
- `.github/workflows/firebase-hosting-merge.yml` – Deploy on push to `prod`
- `.github/workflows/firebase-hosting-pull-request.yml` – Build + preview on PRs

Each workflow:
- Checks out code
- Creates `.env` from GitHub secrets (`REACT_APP_*` vars)
- Runs `npm ci && npm run build`
- Deploys Hosting using the appropriate `firebaseServiceAccount` secret

## Local Development
- Install deps: `npm ci`
- Run dev server: `npm start`
- Build locally: `npm run build`

## Functions Deploy (not covered by Hosting workflows)
- Current workflows deploy Hosting only. Deploy Functions separately:
  - CLI: `firebase deploy --only functions`
  - Or add a dedicated GitHub Actions workflow for Functions
