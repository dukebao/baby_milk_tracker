# Baby Milk Tracker

Baby Milk Tracker is a mobile-friendly app for families to record feeds, diapers,
and daily baby measurements. Caregivers in the same household share records.

The current app uses **React + Supabase**, with **GitHub Pages** as the selected
frontend host. The browser talks directly to Supabase Auth and PostgreSQL; no
custom API server is required.

Expected deployment URL: https://dukebao.github.io/baby_milk_tracker/
This URL becomes available after the first successful Pages deployment.

## What the app does

- New owners configure their household and baby names before starting.
- Track bottle feeds in ml, breastfeeding by timestamp, and pee/poop events.
- Edit and save three milk amount buttons as account preferences.
- Browse daily records and weekly totals through the calendar.
- Track daily goals and measurements; edit or delete log entries.
- Manage babies and household details in Settings. Owners can invite caregivers
  with single-use links that expire after seven days, optionally bound to email.
- Switch light/dark appearance in Settings, saved on the current device.
- Export date ranges as CSV/JSON or download all records for the selected baby
  as a JSON backup.
- Sign in with Google or email/password through Supabase Auth.

## Project layout

| Path | Purpose |
| --- | --- |
| `frontend/` | React app, Supabase client, styles and frontend tests |
| `supabase/migrations/` | Database tables, access policies and household setup functions |
| `supabase/tests/` | Permission and setup checks for an isolated test database |
| `.github/workflows/pages.yml` | Test, build and deploy workflow for GitHub Pages |
| `deployment/` | Hosting instructions and local Docker configuration |
| `backend/` | Retained legacy FastAPI/SQLite code, unused by the current app |

## Set up Supabase

Follow [the setup guide](supabase/README.md). Run
[supabase/migrations/202610040001_tracker.sql](supabase/migrations/202610040001_tracker.sql)
and [the household setup update](supabase/migrations/202610040002_household_setup.sql)
in your project's SQL Editor, in that order, before signing in.

Copy `frontend/.env.example` to `frontend/.env.local` and fill in:

```dotenv
REACT_APP_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
REACT_APP_GOOGLE_LOGIN=true
```

Use `true` for Google login only after enabling the Google provider in Supabase.
Configure Supabase Auth redirect URLs for both local development and the hosted
app, following [the deployment guide](deployment/github-pages.md).

The React app reads `frontend/.env.local`; a repository-root `.env` does not
configure the frontend. Restart the dev server after changing environment values.
Local environment files and downloaded Google credentials are ignored by Git.

The project URL and **publishable** key are browser configuration and become
visible in the built app. Database access is protected by Supabase authentication
and row-level security. Never put a secret/service-role key, database password or
Google client secret in frontend configuration. The Google secret belongs in
Supabase's Google provider settings.

## Run locally

Use Node.js 22+:

```powershell
cd frontend
npm ci
npm start
```

Open http://localhost:3000. On a phone on the same Wi-Fi, use your computer's LAN
address with port 3000; add that address to Supabase's allowed Auth redirect URLs.

With Docker Desktop, from the repository root:

```powershell
docker compose -f deployment/docker-compose.yml up --build frontend
```

The default compose setup runs only the frontend. The `backend/` folder is retained
as legacy practice code and a source of local backups. It is not used by this app.
An already-running legacy container can be stopped separately; its SQLite data
remains in `backend/data/`.

## Deploy to GitHub Pages

Follow [the detailed GitHub setup guide](deployment/github-pages.md):

1. Enable GitHub Actions and set **Settings > Pages > Source** to **GitHub Actions**.
2. Add repository **Actions variables**, using values from `frontend/.env.local`:
   `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_PUBLISHABLE_KEY`.
3. Configure Supabase and Google redirects for the production address.
4. Commit and push the application and workflow to `main`.

The **Deploy tracker to GitHub Pages** workflow installs dependencies, runs tests,
builds the frontend and publishes it. Google login is enabled in the workflow;
`PUBLIC_URL` is derived from GitHub Pages automatically. Configuration changes
require another build/deployment to reach the browser.

Invitations created locally use the local origin. Create new invitations from the
hosted app to share production links. Direct date/invite URLs use the generated
`404.html` to load the app on GitHub Pages.

Cloudflare Pages remains an [alternative host](deployment/cloud-hosting.md).

## Development checks

```powershell
cd frontend
npm test -- --watchAll=false --runInBand
npm run build
```

Database permission tests are in `supabase/tests/`. They run against an isolated
PostgreSQL database with the test Auth shim, not your real Supabase project.

For a browser review of the GitHub Pages build using simulated Supabase responses:

```powershell
cd frontend
$env:PUBLIC_URL='/baby_milk_tracker'
npm run build
node scripts/review-ui.cjs --pages
Remove-Item Env:PUBLIC_URL
```

Existing SQLite history in `backend/data/` is preserved locally and is not imported
into Supabase. The new database starts with no legacy tracking records.
