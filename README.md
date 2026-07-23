# QuoteChem Production App

QuoteChem is a React/Firebase app for a public chemical catalog and an authenticated operations portal.

## Frontend

- React 19 / Create React App
- Firebase Auth, Firestore, Storage, Functions, and optional App Check
- Public catalog at `/`
- Authenticated portal at `/portal`

## Portal Apps

The portal launcher reads app definitions from `src/apps/registry/miniApps.js`.

- `Uniquem`: warehouse and 3D operations views
- `User Access`: admin user invites and app access
- `Account`: profile and sign-in settings

Portal icons are 200px by 200px PNG assets stored in:

```text
public/assets/portal-icons/
```

The launcher uses those image assets with animated load, hover, focus, and press states in `src/apps/launcher/AppLauncher.css`.

## Cloud Functions

Function exports are assembled in `functions/index.js` from the focused API and Uniquem operations modules.

Key groups:

- User access: invites, invite acceptance, and mini-app permissions
- Uniquem operations: products, inventory, receiving, shipping, production, attachments, and safe deletion
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
EMAIL_SMTP_USER
EMAIL_SMTP_PASSWORD
EMAIL_FROM_ADDRESS
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

Production deployment:

```bash
git push origin production
```

The existing GitHub Actions workflows deploy Hosting and Functions. Do not deploy directly from a local machine.
