# Cloud Hosting Path

The app no longer depends on a Raspberry Pi or WebSocket support.

## Recommended Free Path

Use this split:

- Frontend: Cloudflare Pages or Vercel
- Backend API: a Python/FastAPI host
- Database: managed Postgres such as Supabase or Neon

The backend reads `DATABASE_URL`, so local development can use SQLite while cloud hosting can use Postgres.

## Local Development

```powershell
cd C:\Users\steve\Desktop\baby\baby_milk_tracker\deployment
docker compose up --build
```

Local data is stored in:

```text
backend/data/dev_milk_tracking.db
```

## Frontend Environment

Set this on the frontend host:

```text
REACT_APP_API_URL=https://your-api-host.example.com
```

## Backend Environment

Set these on the backend host:

```text
DATABASE_URL=postgresql://user:password@host:5432/database
CORS_ORIGINS=https://your-frontend-host.example.com
```

## Notes

- Do not use cloud local disk or SQLite for real shared data.
- Use SQLite only for local testing.
- When you are ready, Supabase is still the best fit because it gives you Postgres, auth options, and later realtime if you ever want it.
