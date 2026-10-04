# Backend development

SQLite remains the default. The React frontend continues to use the FastAPI HTTP API; no WebSocket service is required.

## Local startup with Docker

Start Docker Desktop, then from the repository root:

```powershell
cd deployment
docker compose up --build
```

- App: http://localhost:3000
- API documentation: http://localhost:8000/docs
- API health: http://localhost:8000/health

Register a development account on the login screen. Tables are created automatically when the backend starts. Data persists in `backend/data/dev_milk_tracking.db` through the Compose bind mount. Stop with Ctrl+C or `docker compose down`; keep the database file to retain your history.

For phone access, connect to the same home network and open `http://192.168.1.74:3000`. The frontend uses the browser's hostname for the local API. If the computer's IP changes, set `LAN_HOST` to its new IPv4 address before running Docker Compose; the backend uses it to allow requests from that address. The computer and containers must remain running.

## Local startup without Docker

Use Python 3.10+ and Node.js 20+. From the repository root:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

In a second terminal, from the repository root:

```powershell
cd frontend
npm install
npm start
```

Open http://localhost:3000. The existing frontend defaults to http://localhost:8000 for its API.

Optional backend configuration: copy `.env.example` to `.env` in `backend/`. Environment variables override that file. Relative SQLite paths always resolve under `backend/`, including when launching from the repository root.

## Table initialization and Supabase SQL

Create or upgrade local SQLite tables explicitly:

```powershell
backend/.venv/Scripts/python.exe backend/init_db.py
```

Generate PostgreSQL SQL from the same models, without connecting to any database:

```powershell
backend/.venv/Scripts/python.exe backend/generate_schema.py
```

The checked-in output is `backend/sql/supabase_schema.sql`. Paste it into a new Supabase project's SQL Editor and run it when ready. It creates tables, indexes, foreign keys, and uniqueness constraints. It enables RLS and revokes access from Supabase browser roles; this stage uses **FastAPI with a server-only PostgreSQL connection**, not direct browser access or Supabase Auth. See [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).

Later, set `DATABASE_URL` in `backend/.env` to the PostgreSQL connection string from Supabase's Connect panel, including SSL settings, and restart the API. Use the database connection string, not a Supabase HTTP URL or API key. The database role must have permission to read/write these tables despite RLS (the project database owner does). Never put the connection string in the React environment. See [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

The SQL script bootstraps an empty database. Rerunning it does not delete data, but it does not upgrade existing table definitions. It does not import SQLite history, integrate Supabase Auth, or add browser access policies. Those are separate migration steps. PostgreSQL startup validates table presence and does not silently create unprotected tables.

## Layout and compatibility

- `main.py`: API routes, login, and household access checks.
- `database.py`: connection, environment loading, foreign keys, and request sessions.
- `models.py`: shared database table definitions.
- `schemas.py`: JSON request validation.
- `init_db.py`: automatic SQLite initialization and additive legacy upgrades.
- `generate_schema.py`: regenerate the Supabase SQL bootstrap.

Existing milk, diaper, goal, and measurement tables remain separate to preserve compatibility. Existing SQLite upgrades retain records and legacy baby memberships. Old log records without a baby assignment remain unassigned; no automatic guess assigns them to a family. New databases enforce unique household membership and one goal/measurement per baby per date; existing SQLite tables are not rebuilt to add these constraints.

Milk corrections can still be negative. Amounts must be finite, and goals/weight/height must be positive. `PUT /entries/{id}` now accepts JSON `{ "amount": 100, "notes": "corrected" }`. Measurements can be read at `GET /measurements/{date}`. Timestamps are returned with an explicit UTC offset. Custom login sessions expire after 30 days. Authentication remains the local development system until Supabase Auth is implemented.

## Daily use and backups

**Breastfeed** (🤱) saves a timestamp-only record for the selected baby/date. It appears alongside milk and diapers in the timeline, supports confirmed deletion, marks history days, and is included in JSON/CSV exports and backups. It never contributes a made-up amount to ml totals or daily goal progress. SQLite adds `breastfeeding_logs` automatically on backend startup; existing PostgreSQL installations should apply `backend/sql/add_breastfeeding_logs.sql` before restarting the updated backend.

Open **Settings** from the calendar or tracker for milk button preferences, household members, caregiver invites, and exports. **Back up all records** downloads the selected baby's complete tracking history as JSON; it does not include account credentials or other babies. CSV and JSON date-range exports include milk, diapers, goals, and measurements. Imports are not implemented yet.

The calendar marks dates with records and shows weekly totals for the days displayed in that month. **First records** jumps to the earliest date for the selected baby. The tracker offers **Log today** navigation, milk edits, delete confirmation, and user-entered goals and measurements (kg/cm). Dates follow the device's local timezone.

For a complete local database snapshot, including accounts, households, and preferences:

```powershell
backend/.venv/Scripts/python.exe backend/backup_db.py
```

This uses SQLite's online backup API and checks snapshot integrity. It creates a new timestamped file under `backend/data/backups/`; it never overwrites the live database. Copy snapshots to a private backup location. Full snapshots contain login/session data and should be kept private. You can run the command periodically or from Windows Task Scheduler; no background task is installed automatically. PostgreSQL backups use your database provider's tools.

To restore a full SQLite snapshot, stop the backend, preserve the current database, copy the chosen snapshot to the configured database path, and restart. Baby JSON/CSV exports are portable records, not full database restore files.

## Verification commands

The tracker offers **Edit amounts** under **Milk buttons**. Each user can save three nonzero amounts, including negative corrections. Preferences persist in the account across dates, babies, and devices. **Restore defaults** fills in 80, 200, and -50 ml; select **Save amounts** to apply them.

SQLite creates the `user_preferences` table automatically on backend startup. For an existing PostgreSQL installation, run `backend/sql/add_user_preferences.sql` before restarting the updated backend. New databases include the table in `supabase_schema.sql`.

```powershell
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

Tests use temporary SQLite databases and do not modify development data.
