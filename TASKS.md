# Baby Milk Tracker Tasks

## In Progress / Recent

- GitHub Pages workflow prepared in `.github/workflows/pages.yml`: tests, repository-path build, generated deep-link fallback, and Pages deployment. App links and invites now include the configured Pages base path. Local Google credential exports are ignored. Remaining before publication: Pages Source = GitHub Actions, the two Supabase repository variables, then reviewed commit/push and live hosted smoke checks.

- Home/calendar, tracker, and sign-in now share `Controls.css` for bordered buttons, contrasting editable fields, keyboard focus, and distinct disabled states in both themes. Calendar dates are visibly clickable; the custom milk form has persistent visible labels. Phone browser review includes entry fields and expanded goal/measurement forms.

- First-login setup collects household and baby names before tracking, saves both atomically, and persists completion in Supabase. Apply `202610040002_household_setup.sql` after the initial migration. Shared-family invitations bypass unrelated owner setup.
- Settings controls now use contrasting surfaces, visible borders, dropdown arrows, and focus states in light/dark modes. Read-only member/account information has separate styling. Browser review now intercepts Supabase Auth/data requests using isolated sample sessions.

- React now connects directly to Supabase Auth and PostgreSQL; FastAPI is retained as legacy practice code. The default Docker setup runs only the frontend.
- Migration and RLS/invite functions: `supabase/migrations/202610040001_tracker.sql`. Setup: `supabase/README.md`. Free frontend hosting: `deployment/cloud-hosting.md`.
- Verified 25 frontend tests, production build, and isolated PostgreSQL permission tests. Remaining: supply project URL/publishable key, apply the SQL to the real project, configure Auth email/provider redirects, and smoke-test real accounts on phone before deployment.
- Older FastAPI/SQLite planning entries below describe the previous implementation.

- Timestamp-only breastfeeding tracking is available via the 🤱 Breastfeed action. Records are baby-scoped, appear in the timeline/history/exports, and can be deleted with confirmation; milk ml totals and goals exclude them.

- Dark mode has a separate `frontend/src/DarkMode.css` palette and a saved Appearance toggle in Settings. Registration collects credentials only; baby names are added/edited in Settings, with owner authorization and existing history preserved.

- Daily-use improvements implemented: local calendar dates and month navigation, connection recovery without logging out on network errors, duplicate-tap guards, shared settings drawer, compact mobile summaries, today/day navigation and baby switching, milk edits and confirmed deletion, history markers and weekly totals, goals and measurements, household members and copyable invites, baby-scoped JSON/CSV exports, and an online SQLite backup utility.
- Verification covers the settings drawer, connection recovery, date boundaries, safe logging, history/export authorization, and backup integrity. Browser layout review uses sample records only.

- Backend preparation completed: separate database/models/schemas/init modules, stable SQLite path, PostgreSQL bootstrap generator and checked-in Supabase SQL, validation/UTC timestamps, atomic invite claims, session expiry, and isolated integration tests. See `backend/README.md` for startup and compatibility notes.

- Household model is being added:
  - Backend tables for households, household members, and household invites.
  - Babies belong to households.
  - Invite link route `/join/:token`.
  - Calendar page has Manage Household for rename, add baby, and invite link creation.
- These household changes are currently uncommitted unless later committed explicitly.

## Next High-Value Tasks

- Test the household invite flow manually:
  - Create account A.
  - Create invite link.
  - Create/login account B.
  - Open `/join/<token>`.
  - Confirm account B sees the same baby.

- Improve invite UX:
  - Preserve invite token through login/register if unauthenticated.
  - Add copy-link button.
  - Show clearer invite status/errors.

- Improve household management UX:
  - Decide whether caregivers can add babies and create invites, or owners only.
  - Show household members and roles.
  - Add remove member / revoke invite later.

- Replace dev auth with production auth:
  - Preferred: Supabase Auth with Google.
  - Backend should verify Supabase JWT or data access should move directly to Supabase with Row Level Security.

- Data model cleanup:
  - Consider replacing separate milk/pee/poop tables with a unified `events` table.
  - Keep `type`, `amount`, `notes`, `occurred_at`, `created_by`.

- Production database:
  - Move from SQLite to managed Postgres.
  - Add real migrations instead of SQLite-only `ALTER TABLE` helpers.

- Security hardening:
  - Add secure session handling for production auth.
  - Tighten CORS to hosted frontend domain.
  - Add role checks for owner/caregiver/viewer behavior.
  - Add revoke invite / list household members.

- Backup/export:
  - Add JSON or CSV export for baby logs.
  - Later add automated backup if using managed Postgres.

## Known Technical Debt

- `backend/main.py` is getting large and should eventually be split into models, schemas, auth, and routes.
- Current password login is dev-only and should not be treated as final production auth.
- SQLite migration helpers are convenience code for local development, not a production migration strategy.
- Some older files remain, such as `BabyMilkTrackerBackup.js`.
- UI still uses text buttons where icons could later improve polish.

## Verification Policy

Default for small changes:

- Lightweight syntax/diff checks only if useful.

Use full checks when:

- Something crashes.
- Backend schema/auth/routing changes are large.
- Deployment/Docker behavior changes.
- User explicitly asks.

Useful checks:

```powershell
python -c "compile(open('backend/main.py', encoding='utf-8').read(), 'backend/main.py', 'exec')"
npm run build
docker compose run --rm backend python -c "import main; print('backend import ok')"
git diff --check
```
