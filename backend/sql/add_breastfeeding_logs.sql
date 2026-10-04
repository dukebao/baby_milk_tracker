-- Add timestamp-only breastfeeding records to an existing PostgreSQL installation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.breastfeeding_logs (
    id SERIAL PRIMARY KEY,
    baby_id INTEGER NOT NULL REFERENCES public.babies(id),
    date DATE NOT NULL,
    created_by INTEGER NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_breastfeeding_logs_id ON public.breastfeeding_logs(id);
CREATE INDEX IF NOT EXISTS ix_breastfeeding_logs_baby_id ON public.breastfeeding_logs(baby_id);
CREATE INDEX IF NOT EXISTS ix_breastfeeding_logs_date ON public.breastfeeding_logs(date);
ALTER TABLE public.breastfeeding_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.breastfeeding_logs FROM anon, authenticated;
COMMIT;
