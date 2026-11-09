-- Allow household members to correct when a logged event happened.
-- Existing row-level policies still restrict edits to their household's babies.
-- Keep record dates, baby IDs and authors protected by column permissions.
begin;
grant update(created_at) on public.tracker_milk_entries to authenticated;
grant update(created_at) on public.tracker_pee_logs to authenticated;
grant update(created_at) on public.tracker_poop_logs to authenticated;
grant update(created_at) on public.tracker_breastfeeding_logs to authenticated;
commit;
