\set ON_ERROR_STOP on
begin;
insert into auth.users values
 ('00000000-0000-0000-0000-000000000010','new-owner@example.com'),
 ('00000000-0000-0000-0000-000000000011','other-owner@example.com');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
select public.tracker_initialize();
select id as family from public.tracker_households \gset
select id as baby from public.tracker_babies \gset
select set_config('tracker.test_family',:'family',true);
select set_config('tracker.test_baby',:'baby',true);
do $$ begin
 assert not (select setup_completed from public.tracker_households),'New family skipped setup';
 begin update public.tracker_households set setup_completed=true;
  raise exception 'Client can bypass setup'; exception when insufficient_privilege then null; end;
 begin perform public.tracker_complete_setup(current_setting('tracker.test_family')::uuid,current_setting('tracker.test_baby')::uuid,'Family','  ');
  raise exception 'Blank baby name accepted'; exception when raise_exception then
  if sqlerrm <> 'Enter a household name and baby name (up to 100 characters each)' then raise; end if; end;
 assert (select name from public.tracker_households)='My family','Invalid setup partially saved';
end $$;
select public.tracker_complete_setup(:'family',:'baby','  Chen family  ','  Aria  ');
do $$ begin
 assert (select name from public.tracker_households)='Chen family','Household name not saved';
 assert (select name from public.tracker_babies)='Aria','Baby name not saved';
 assert (select setup_completed from public.tracker_households),'Setup completion not saved';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select public.tracker_initialize();
select id as other_baby from public.tracker_babies \gset
select set_config('tracker.other_baby',:'other_baby',true);
do $$ begin
 begin perform public.tracker_complete_setup(current_setting('tracker.test_family')::uuid,current_setting('tracker.test_baby')::uuid,'Hacked','Hacked');
  raise exception 'Other family setup allowed'; exception when raise_exception then
  if sqlerrm <> 'Only owners can configure a household' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
do $$ begin
 begin perform public.tracker_complete_setup(current_setting('tracker.test_family')::uuid,current_setting('tracker.other_baby')::uuid,'Changed','Changed');
  raise exception 'Wrong household baby allowed'; exception when raise_exception then
  if sqlerrm <> 'Baby does not belong to this household' then raise; end if; end;
 assert (select name from public.tracker_households)='Chen family','Wrong baby partially renamed household';
end $$;
rollback;
\echo 'First-login setup, saved completion, validation, and owner isolation passed.'
