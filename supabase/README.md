# Supabase setup

## Database

Create a Supabase project and run
`migrations/202610040001_tracker.sql`, then
`migrations/202610040002_household_setup.sql`, then
`migrations/202611090001_log_times.sql` in its SQL Editor once each. The scripts create
new `tracker_*` tables and functions in a transaction. It does not touch legacy
tables or import Aria history. Do not use `backend/sql/supabase_schema.sql` for
this architecture; that old schema was designed for a trusted Python backend.

Every table has row-level security. Members can read/write records for their
household babies. Owners can rename households/babies, add babies and create
invites. Preferences belong to the signed-in user. Household membership writes
are restricted to functions that check the caller and invite token. Invites are
single-use, expire after seven days, and optionally bind to an email address.

The first authenticated profile load creates a default family and baby. New
owners name both on a setup screen before tracking; completion is saved in the
database. Existing customized families and families with records are preserved.
Rename the baby later in Settings. Existing local accounts/passwords do not transfer;
create a new Supabase account.

For an existing installation, run only the new `202611090001_log_times.sql`
migration to enable time corrections for milk, pee, poop and breastfeeding logs.
It grants household members permission to update the existing event timestamp;
row-level security, record dates and authors remain protected. Existing records
are preserved. The frontend's Edit form uses the selected day and device local time.

## Browser configuration

Copy `frontend/.env.example` to `frontend/.env.local`:

```dotenv
REACT_APP_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
REACT_APP_GOOGLE_LOGIN=false
```

Find the URL and publishable key in the project Connect/API Keys panel.
The legacy anon key is also supported as `REACT_APP_SUPABASE_ANON_KEY`.
Never use a secret or service-role key in React. Restart the dev server after
editing these values.

## Authentication

Email/password is enabled in the UI by default. Keep email confirmation enabled.
Configure a custom SMTP provider for confirmation and password-reset emails;
Supabase's default sender only delivers to project team addresses.

Set Auth Site URL and allowed redirect URLs for localhost, your LAN phone-test
address, and the eventual HTTPS hosting address. Allow paths with `/**` so
confirmation and Google callbacks can return to household invite links.

For Google login: create a Google OAuth web client, add the callback URL shown
by Supabase to Google, enter the client ID/secret in Supabase's Google provider
settings, and enable `REACT_APP_GOOGLE_LOGIN=true`. The Google secret stays in
Supabase; it is not a React environment variable.

## Verification

The frontend unit tests cover sessions, email confirmation and data operations.
The migrations can also be checked in a disposable PostgreSQL 17+ database:

1. Run `tests/bootstrap.sql` (minimal Supabase Auth shim and roles).
2. Run all three migration files in order.
3. Run `tests/access.sql` and `tests/setup.sql` with `psql -v ON_ERROR_STOP=1`.

Never run the test bootstrap against a real Supabase project. The access tests
roll back their fixtures and check household isolation, owner restrictions,
single-use/email-bound invitations, shared logging, preferences, log time
corrections and author protection. A real project's login/email/OAuth behavior
still requires a live smoke test after configuration.

References:
- [Auth SDK](https://supabase.com/docs/reference/javascript/auth-signup)
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
