# Baby Milk Tracker Plan

## Current direction

React connects directly to Supabase Auth and PostgreSQL. No custom FastAPI API
is required for the active app. GitHub Pages is the selected static frontend host.
Local SQLite/legacy Python code is retained without importing Aria history.

## Architecture

- Supabase browser client: `frontend/src/supabase.js`.
- Data adapter used by existing screens: `frontend/src/trackerData.js`.
- Fresh database migration and RLS/functions: `supabase/migrations/202610040001_tracker.sql`.
- Project setup: `supabase/README.md`.
- Deployment: `deployment/github-pages.md`; Cloudflare alternative in `deployment/cloud-hosting.md`.
- Auth session persistence and token refresh are managed by the Supabase SDK.
- Theme and selected baby remain local device preferences; milk presets belong
  to the signed-in account.
- The default Docker setup starts the frontend; FastAPI requires the legacy profile.

## Access model

Users are Supabase Auth accounts with UUIDs. Households contain babies.
Memberships have owner/caregiver roles. RLS allows members to share tracking
records and limits baby/household management and invite creation to owners.
Preferences are visible/editable only by their user.

Invites are single-use, expire after seven days, optionally bind to an email,
and are validated/consumed atomically through a database function. Direct
membership writes and anonymous table access are denied.

The initial authenticated profile load creates a default household and baby.
Baby naming and household management live in Settings. Google sign-in is
optional; email/password and recovery use Supabase Auth.

## Validation and remaining setup

25 frontend tests and a static production build pass. Disposable PostgreSQL
tests cover household isolation, owner restrictions, invites, timestamp
protection, preferences, and shared logging. These do not replace real Auth/
SMTP/OAuth testing once a project is connected.

Remaining external setup: project URL and publishable key, SQL application,
Auth providers/email delivery and redirect URLs, then real account/phone tests
and Cloudflare Pages deployment.

## Working notes

Preserve local records and existing uncommitted work. Avoid WebSockets until
needed; writes refetch the affected view. Do not commit without a user request.
