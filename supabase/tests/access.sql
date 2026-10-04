-- Run after bootstrap.sql and the migration. Transaction rolls back all fixtures.
\set ON_ERROR_STOP on
begin;
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001','owner@example.com'),
 ('00000000-0000-0000-0000-000000000002','caregiver@example.com'),
 ('00000000-0000-0000-0000-000000000003','stranger@example.com');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.tracker_initialize();
select public.tracker_initialize();
select id as family from public.tracker_households \gset
select id as baby from public.tracker_babies \gset
select (public.tracker_create_invite(:'family','caregiver@example.com')->>'join_path') as invitation \gset
select split_part(:'invitation','/',3) as invite_token \gset
insert into public.tracker_milk_entries(baby_id,date,amount,notes) values(:'baby','2026-10-03',80,'Breakfast');
insert into public.tracker_breastfeeding_logs(baby_id,date) values(:'baby','2026-10-03');
insert into public.tracker_daily_goals(baby_id,date,goal) values(:'baby','2026-10-03',800)
 on conflict(baby_id,date) do update set baby_id=excluded.baby_id,date=excluded.date,goal=excluded.goal;
insert into public.tracker_daily_goals(baby_id,date,goal) values(:'baby','2026-10-03',900)
 on conflict(baby_id,date) do update set baby_id=excluded.baby_id,date=excluded.date,goal=excluded.goal;
do $$ begin
 assert (select count(*) from public.tracker_households)=1,'Initialization duplicated a family';
 assert (select goal from public.tracker_daily_goals)=900,'Goal upsert failed';
 begin update public.tracker_preferences set milk_amounts=array[0,200,-50];
  raise exception 'Invalid preferences accepted'; exception when check_violation then null; end;
 begin update public.tracker_preferences set milk_amounts=array[]::numeric[];
  raise exception 'Empty preferences accepted'; exception when check_violation then null; end;
 begin update public.tracker_babies set household_id=gen_random_uuid();
  raise exception 'Baby can be moved'; exception when insufficient_privilege then null; end;
 begin update public.tracker_memberships set role='owner';
  raise exception 'Direct membership writes allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.tracker_breastfeeding_logs(baby_id,date,created_at)
  select id,'2026-10-03',now()-interval '1 year' from public.tracker_babies;
  raise exception 'Timestamp spoofing allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select public.tracker_initialize();
do $$ begin
 assert (select count(*) from public.tracker_milk_entries)=0,'Other family records exposed';
 assert (select count(*) from public.tracker_breastfeeding_logs)=0,'Other family breastfeeding exposed';
end $$;
select set_config('tracker.test_invite',:'invite_token',true);
select set_config('tracker.test_baby',:'baby',true);
select set_config('tracker.test_family',:'family',true);
do $$ begin
 begin perform public.tracker_accept_invite(current_setting('tracker.test_invite')::uuid);
  raise exception 'Wrong email accepted'; exception when raise_exception then
  if sqlerrm <> 'Sign in using the email this invite was created for' then raise; end if; end;
 begin insert into public.tracker_pee_logs(baby_id,date) values(current_setting('tracker.test_baby')::uuid,'2026-10-03');
  raise exception 'Cross-family insert accepted'; exception when insufficient_privilege then null; end;
 begin perform public.tracker_members(current_setting('tracker.test_family')::uuid);
  raise exception 'Other family emails exposed'; exception when raise_exception then
  if sqlerrm <> 'Household access denied' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select public.tracker_accept_invite(:'invite_token');
select public.tracker_initialize();
do $$ begin
 assert (select count(*) from public.tracker_babies)=1,'Caregiver has orphan initial family';
 assert (select count(*) from public.tracker_milk_entries)=1,'Shared records unavailable';
 assert (select count(*) from public.tracker_members(current_setting('tracker.test_family')::uuid))=2,'Member list incorrect';
 begin perform public.tracker_accept_invite(current_setting('tracker.test_invite')::uuid);
  raise exception 'Invite reused'; exception when raise_exception then
  if sqlerrm <> 'This invite has already been used' then raise; end if; end;
 begin perform public.tracker_create_invite(current_setting('tracker.test_family')::uuid);
  raise exception 'Caregiver can invite'; exception when raise_exception then
  if sqlerrm <> 'Only owners can invite caregivers' then raise; end if; end;
 begin perform public.tracker_complete_setup(current_setting('tracker.test_family')::uuid,current_setting('tracker.test_baby')::uuid,'Changed','Changed');
  raise exception 'Caregiver can configure household'; exception when raise_exception then
  if sqlerrm <> 'Only owners can configure a household' then raise; end if; end;
 update public.tracker_households set name='Unauthorized';
 assert not exists(select 1 from public.tracker_households where name='Unauthorized'),'Caregiver renamed household';
 update public.tracker_milk_entries set amount=100;
 assert (select amount from public.tracker_milk_entries)=100,'Caregiver edit failed';
 delete from public.tracker_breastfeeding_logs;
 assert (select count(*) from public.tracker_breastfeeding_logs)=0,'Caregiver delete failed';
end $$;
reset role;
update public.tracker_invites set used_at=null,expires_at=now()-interval '1 day' where token=:'invite_token';
set local role authenticated;
do $$ begin
 begin perform public.tracker_accept_invite(current_setting('tracker.test_invite')::uuid);
  raise exception 'Expired invite accepted'; exception when raise_exception then
  if sqlerrm <> 'This invite has expired' then raise; end if; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.tracker_preview_invite(current_setting('tracker.test_invite')::uuid);
  raise exception 'Anonymous invite access allowed'; exception when insufficient_privilege then null; end;
 begin perform * from public.tracker_babies;
  raise exception 'Anonymous records exposed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo 'Household isolation, ownership, invitations, timestamps, preferences, and shared tracking passed.'
