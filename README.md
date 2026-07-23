# QuoteChem Production App

QuoteChem is a React/Firebase app for a public chemical catalog and an authenticated operations portal.

## Frontend

- React 19 / Create React App
- Firebase Auth, Firestore, Storage, Functions, and optional App Check
- Public catalog at `/`
- Authenticated portal at `/portal`

## Portal Apps

The portal launcher reads app definitions from `src/apps/registry/miniApps.js`.

- `Drilling Programs`: AI-assisted mud program extraction and page editing
- `Uniquem`: warehouse and 3D operations views
- `User Access`: admin user invites, app access, and email templates
- `Account`: profile and sign-in settings

Portal icons are 200px by 200px PNG assets stored in:

```text
public/assets/portal-icons/
```

The launcher uses those image assets with animated load, hover, focus, and press states in `src/apps/launcher/AppLauncher.css`.

## Cloud Functions

Main function exports live in `functions/api.js` and are re-exported from `functions/index.js`.

Key groups:

- User access: invites, invite acceptance, and mini-app permissions
- Email templates: list, save, and test send
- Drilling programs: PDF draft creation, extraction, autosave, page improvement, and draft listing
- Uniquem 3D: model generation, versioning, restore, archive, and listing

## Required Configuration

Frontend environment variables:

```text
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
REACT_APP_FIREBASE_MEASUREMENT_ID
REACT_APP_QUOTECHEM_API_BASE
REACT_APP_APPCHECK_SITE_KEY
```

Function secrets include:

```text
OPENAI_API_KEY
SENDGRID_API_KEY
QUOTECHEM_FROM_EMAIL
QUOTECHEM_SALES_EMAIL
```

## Development

Install dependencies:

```bash
npm install
cd functions && npm install
```

Run the frontend:

```bash
npm start
```

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

Deploy functions:

```bash
firebase deploy --project quotechemfb --only functions
```

Deploy hosting:

```bash
firebase deploy --project quotechemfb --only hosting
```
