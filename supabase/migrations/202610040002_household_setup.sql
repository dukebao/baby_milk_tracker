-- Run once after the initial tracker migration. Existing records are preserved.
begin;
alter table public.tracker_households add column setup_completed boolean not null default false;

-- Families that have already customized names or tracked records keep their setup.
update public.tracker_households h set setup_completed=true
where h.name <> 'My family'
 or exists(select 1 from public.tracker_babies b where b.household_id=h.id and b.name <> 'Baby')
 or exists(select 1 from public.tracker_babies b where b.household_id=h.id and (
   exists(select 1 from public.tracker_milk_entries r where r.baby_id=b.id)
   or exists(select 1 from public.tracker_breastfeeding_logs r where r.baby_id=b.id)
   or exists(select 1 from public.tracker_pee_logs r where r.baby_id=b.id)
   or exists(select 1 from public.tracker_poop_logs r where r.baby_id=b.id)
   or exists(select 1 from public.tracker_daily_goals r where r.baby_id=b.id)
   or exists(select 1 from public.tracker_measurements r where r.baby_id=b.id)));

create function public.tracker_complete_setup(target_household uuid,target_baby uuid,household_name text,baby_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare family public.tracker_households; baby public.tracker_babies;
begin
 if not public.tracker_is_member(target_household,true) then raise exception 'Only owners can configure a household'; end if;
 if household_name is null or length(btrim(household_name)) not between 1 and 100
  or baby_name is null or length(btrim(baby_name)) not between 1 and 100 then
  raise exception 'Enter a household name and baby name (up to 100 characters each)';
 end if;
 select * into family from public.tracker_households where id=target_household for update;
 select * into baby from public.tracker_babies where id=target_baby and household_id=target_household for update;
 if not found then raise exception 'Baby does not belong to this household'; end if;
 update public.tracker_babies set name=btrim(baby_name) where id=target_baby returning * into baby;
 update public.tracker_households set name=btrim(household_name),setup_completed=true
  where id=target_household returning * into family;
 return jsonb_build_object('household',to_jsonb(family),'baby',to_jsonb(baby));
end $$;
revoke all on function public.tracker_complete_setup(uuid,uuid,text,text) from public,anon;
grant execute on function public.tracker_complete_setup(uuid,uuid,text,text) to authenticated;
commit;
