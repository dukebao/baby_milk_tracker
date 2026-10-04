-- Add account preferences to an existing PostgreSQL installation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES public.users(id),
    milk_amounts JSON NOT NULL
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_preferences FROM anon, authenticated;
COMMIT;
