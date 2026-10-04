-- Fresh Supabase deployment; legacy tables and local history are untouched.
begin;
create table public.tracker_households (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 100),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now());
create table public.tracker_memberships (
 household_id uuid not null references public.tracker_households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','caregiver')), primary key(household_id,user_id));
create index on public.tracker_memberships(user_id);
create table public.tracker_babies (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.tracker_households(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now());
create index on public.tracker_babies(household_id);
create table public.tracker_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 milk_amounts numeric[] not null default array[80,200,-50]::numeric[],
 check(array_ndims(milk_amounts)=1 and cardinality(milk_amounts)=3
   and array_position(milk_amounts,null) is null and 0 <> all(milk_amounts)
   and 'NaN'::numeric <> all(milk_amounts) and 'Infinity'::numeric <> all(milk_amounts)
   and '-Infinity'::numeric <> all(milk_amounts)));
create table public.tracker_invites (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.tracker_households(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(), invited_email text,
 created_by uuid not null default auth.uid() references auth.users(id),
 expires_at timestamptz not null default now()+interval '7 days', used_at timestamptz);

-- Helpers avoid recursive membership policies; callers can only probe their own access.
create function public.tracker_is_member(target_household uuid,owner_only boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tracker_memberships where household_id=target_household
 and user_id=auth.uid() and (not owner_only or role='owner'));
$$;
create function public.tracker_can_access_baby(target_baby uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tracker_babies where id=target_baby and public.tracker_is_member(household_id));
$$;
alter table public.tracker_households enable row level security;
alter table public.tracker_memberships enable row level security;
alter table public.tracker_babies enable row level security;
alter table public.tracker_preferences enable row level security;
alter table public.tracker_invites enable row level security;
revoke all on public.tracker_households,public.tracker_memberships,public.tracker_babies,public.tracker_preferences,public.tracker_invites from anon,authenticated;
grant select on public.tracker_households,public.tracker_memberships,public.tracker_babies,public.tracker_preferences to authenticated;
grant update(name) on public.tracker_households,public.tracker_babies to authenticated;
grant insert(household_id,name) on public.tracker_babies to authenticated;
grant update(milk_amounts) on public.tracker_preferences to authenticated;
create policy read_household on public.tracker_households for select to authenticated using(public.tracker_is_member(id));
create policy rename_household on public.tracker_households for update to authenticated using(public.tracker_is_member(id,true)) with check(public.tracker_is_member(id,true));
create policy read_membership on public.tracker_memberships for select to authenticated using(public.tracker_is_member(household_id));
create policy read_baby on public.tracker_babies for select to authenticated using(public.tracker_is_member(household_id));
create policy add_baby on public.tracker_babies for insert to authenticated with check(public.tracker_is_member(household_id,true) and created_by=auth.uid());
create policy rename_baby on public.tracker_babies for update to authenticated using(public.tracker_is_member(household_id,true)) with check(public.tracker_is_member(household_id,true));
create policy read_preferences on public.tracker_preferences for select to authenticated using(user_id=auth.uid());
create policy save_preferences on public.tracker_preferences for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

do $$
declare suffix text; extras text;
begin
 foreach suffix in array array['milk_entries','pee_logs','poop_logs','breastfeeding_logs','daily_goals','measurements'] loop
  extras := case suffix
   when 'milk_entries' then ', amount numeric not null check(amount <> 0 and amount not in (''NaN''::numeric,''Infinity''::numeric,''-Infinity''::numeric)), notes text not null default '''' check(length(notes)<=10000)'
   when 'daily_goals' then ', goal integer not null check(goal>0), unique(baby_id,date)'
   when 'measurements' then ', weight numeric not null check(weight>0 and weight<1000), height numeric not null check(height>0 and height<1000), unique(baby_id,date)'
   else '' end;
  execute format('create table public.tracker_%I (
   id uuid primary key default gen_random_uuid(), baby_id uuid not null references public.tracker_babies(id) on delete cascade,
   date date not null, created_by uuid not null default auth.uid() references auth.users(id),
   created_at timestamptz not null default now() %s)',suffix,extras);
  execute format('create index on public.tracker_%I(baby_id,date)',suffix);
  execute format('alter table public.tracker_%I enable row level security',suffix);
  execute format('revoke all on public.tracker_%I from anon,authenticated',suffix);
  execute format('grant select,delete on public.tracker_%I to authenticated',suffix);
  execute format('create policy read_records on public.tracker_%I for select to authenticated using(public.tracker_can_access_baby(baby_id))',suffix);
  execute format('create policy add_records on public.tracker_%I for insert to authenticated with check(public.tracker_can_access_baby(baby_id) and created_by=auth.uid())',suffix);
  execute format('create policy edit_records on public.tracker_%I for update to authenticated using(public.tracker_can_access_baby(baby_id)) with check(public.tracker_can_access_baby(baby_id))',suffix);
  execute format('create policy delete_records on public.tracker_%I for delete to authenticated using(public.tracker_can_access_baby(baby_id))',suffix);
  if suffix='milk_entries' then
   execute 'grant insert(baby_id,date,amount,notes), update(amount,notes) on public.tracker_milk_entries to authenticated';
  elsif suffix='daily_goals' then
   execute 'grant insert(baby_id,date,goal), update(baby_id,date,goal) on public.tracker_daily_goals to authenticated';
  elsif suffix='measurements' then
   execute 'grant insert(baby_id,date,weight,height), update(baby_id,date,weight,height) on public.tracker_measurements to authenticated';
  else execute format('grant insert(baby_id,date) on public.tracker_%I to authenticated',suffix);
  end if;
 end loop;
end $$;

-- Initialize once on authenticated profile load, including existing Auth accounts.
create function public.tracker_initialize()
returns void language plpgsql security definer set search_path='' as $$
declare family uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 insert into public.tracker_preferences(user_id) values(auth.uid()) on conflict do nothing;
 if not exists(select 1 from public.tracker_memberships where user_id=auth.uid()) then
  insert into public.tracker_households(name,created_by) values('My family',auth.uid()) returning id into family;
  insert into public.tracker_memberships values(family,auth.uid(),'owner');
  insert into public.tracker_babies(household_id,name,created_by) values(family,'Baby',auth.uid());
 end if;
end $$;
create function public.tracker_members(target_household uuid)
returns table(user_id uuid,email text,role text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.tracker_is_member(target_household) then raise exception 'Household access denied'; end if;
 return query select m.user_id,u.email::text,m.role from public.tracker_memberships m
 join auth.users u on u.id=m.user_id where m.household_id=target_household order by m.role,u.email;
end $$;
create function public.tracker_create_invite(target_household uuid,target_email text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.tracker_invites;
begin
 if not public.tracker_is_member(target_household,true) then raise exception 'Only owners can invite caregivers'; end if;
 insert into public.tracker_invites(household_id,invited_email,created_by)
 values(target_household,nullif(lower(btrim(target_email)),''),auth.uid()) returning * into invitation;
 return jsonb_build_object('join_path','/join/'||invitation.token,'expires_at',invitation.expires_at);
end $$;
create function public.tracker_preview_invite(invite_token uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare invitation public.tracker_invites; family_name text;
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 select * into invitation from public.tracker_invites where token=invite_token;
 if not found then raise exception 'Invite not found'; end if;
 select name into family_name from public.tracker_households where id=invitation.household_id;
 return jsonb_build_object('household',jsonb_build_object('name',family_name),'expires_at',invitation.expires_at,'used_at',invitation.used_at);
end $$;
create function public.tracker_accept_invite(invite_token uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.tracker_invites; user_email text;
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 select * into invitation from public.tracker_invites where token=invite_token for update;
 if not found then raise exception 'Invite not found'; end if;
 if invitation.used_at is not null then raise exception 'This invite has already been used'; end if;
 if invitation.expires_at<=now() then raise exception 'This invite has expired'; end if;
 select lower(email) into user_email from auth.users where id=auth.uid();
 if invitation.invited_email is not null and invitation.invited_email<>user_email then raise exception 'Sign in using the email this invite was created for'; end if;
 insert into public.tracker_memberships values(invitation.household_id,auth.uid(),'caregiver') on conflict do nothing;
 update public.tracker_invites set used_at=now() where id=invitation.id;
 return invitation.household_id;
end $$;
revoke all on function public.tracker_is_member(uuid,boolean),public.tracker_can_access_baby(uuid),public.tracker_initialize(),public.tracker_members(uuid),public.tracker_create_invite(uuid,text),public.tracker_preview_invite(uuid),public.tracker_accept_invite(uuid) from public,anon;
grant execute on function public.tracker_is_member(uuid,boolean),public.tracker_can_access_baby(uuid),public.tracker_initialize(),public.tracker_members(uuid),public.tracker_create_invite(uuid,text),public.tracker_preview_invite(uuid),public.tracker_accept_invite(uuid) to authenticated;
commit;
