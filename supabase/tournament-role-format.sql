-- Run this once after schema.sql on existing projects.
-- It enables multi-role profiles and richer automated tournament tie sheets.

alter table public.profiles
  add column if not exists staff_roles text[] not null default '{}',
  add column if not exists player_roles text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_staff_roles_check,
  drop constraint if exists profiles_player_roles_check;

alter table public.profiles
  add constraint profiles_staff_roles_check
  check (staff_roles <@ array['usermod','playermod','tournamentmod','useradmin','playeradmin','tournamentadmin','superadmin']),
  add constraint profiles_player_roles_check
  check (player_roles <@ array['exp','jg','gd','md','rm','coach','sb1','sb2','multirole','founder','leader']);

update public.profiles
set staff_roles = array[staff_role::text]
where staff_role is not null and coalesce(array_length(staff_roles, 1), 0) = 0;

update public.profiles
set player_roles = array['multirole']
where role in ('player','superadmin') and coalesce(array_length(player_roles, 1), 0) = 0;

update public.profiles
set player_roles = array['exp','jg','gd','md','rm','coach','sb1','sb2','multirole','founder','leader']
where role = 'superadmin';

alter table public.matches
  add column if not exists phase text,
  add column if not exists best_of integer not null default 1,
  add column if not exists bracket_position integer,
  add column if not exists group_name text;

create index if not exists matches_phase_idx on public.matches(tournament_id, phase, round_number);

create or replace function public.current_staff_roles()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((
    select array_agg(distinct role_name)
    from public.profiles p
    cross join lateral unnest(coalesce(p.staff_roles, '{}'::text[]) || array[p.staff_role::text]) role_name
    where p.id = auth.uid()
      and role_name is not null
      and role_name <> ''
  ), '{}'::text[]);
$$;

create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select 'superadmin' where 'superadmin' = any(public.current_staff_roles())),
    (select role_name from unnest(public.current_staff_roles()) role_name limit 1)
  );
$$;

create or replace function public.is_staff(required text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_roles() && required, false);
$$;

create or replace function public.prevent_superadmin_role_change()
returns trigger language plpgsql as $$
begin
  if (old.staff_role = 'superadmin' or 'superadmin' = any(coalesce(old.staff_roles, '{}'::text[])))
    and (
      new.staff_role is distinct from old.staff_role
      or new.role is distinct from old.role
      or new.staff_roles is distinct from old.staff_roles
    ) then
    raise exception 'The superadmin role is protected.';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not public.is_staff(array['superadmin','useradmin','playeradmin','tournamentadmin']) then
    if new.role is distinct from old.role
      or new.staff_role is distinct from old.staff_role
      or new.staff_roles is distinct from old.staff_roles
      or new.player_roles is distinct from old.player_roles
      or new.is_player_approved is distinct from old.is_player_approved
      or new.is_verified is distinct from old.is_verified then
      raise exception 'Users cannot change their own privileges.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_profile_privilege_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_staff_roles text[];
  new_staff_roles text[];
  old_staff_roles text[];
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  caller_staff_roles := public.current_staff_roles();
  new_staff_roles := coalesce(new.staff_roles, '{}'::text[]);
  old_staff_roles := coalesce(old.staff_roles, '{}'::text[]);

  if (old.staff_role = 'superadmin' or 'superadmin' = any(old_staff_roles))
    and (
      new.staff_role is distinct from old.staff_role
      or new.role is distinct from old.role
      or new_staff_roles is distinct from old_staff_roles
    ) then
    raise exception 'Superadmin accounts are protected.';
  end if;

  if new.role is not distinct from old.role
    and new.staff_role is not distinct from old.staff_role
    and new_staff_roles is not distinct from old_staff_roles
    and coalesce(new.player_roles, '{}'::text[]) is not distinct from coalesce(old.player_roles, '{}'::text[])
    and new.is_player_approved is not distinct from old.is_player_approved
    and new.is_verified is not distinct from old.is_verified then
    return new;
  end if;

  if 'superadmin' = any(caller_staff_roles) then
    return new;
  end if;

  if new.staff_role is distinct from old.staff_role or new_staff_roles is distinct from old_staff_roles then
    if 'useradmin' = any(caller_staff_roles)
      and coalesce(old.staff_role::text, '') in ('', 'usermod')
      and coalesce(new.staff_role::text, '') in ('', 'usermod')
      and new_staff_roles <@ array['usermod'] then
      return new;
    elsif 'playeradmin' = any(caller_staff_roles)
      and coalesce(old.staff_role::text, '') in ('', 'playermod')
      and coalesce(new.staff_role::text, '') in ('', 'playermod')
      and new_staff_roles <@ array['playermod'] then
      return new;
    elsif 'tournamentadmin' = any(caller_staff_roles)
      and coalesce(old.staff_role::text, '') in ('', 'tournamentmod')
      and coalesce(new.staff_role::text, '') in ('', 'tournamentmod')
      and new_staff_roles <@ array['tournamentmod'] then
      return new;
    else
      raise exception 'You cannot assign that staff role.';
    end if;
  end if;

  if (new.role is distinct from old.role
      or new.is_player_approved is distinct from old.is_player_approved)
    and not public.is_staff(array['useradmin','superadmin']) then
    raise exception 'Only UserAdmin or Superadmin can approve player role changes.';
  end if;

  if coalesce(new.player_roles, '{}'::text[]) is distinct from coalesce(old.player_roles, '{}'::text[])
    and not public.is_staff(array['useradmin','playeradmin','superadmin']) then
    raise exception 'Only PlayerAdmin, UserAdmin, or Superadmin can change player roles.';
  end if;

  if new.is_verified is distinct from old.is_verified and not public.is_staff(array['useradmin','superadmin']) then
    raise exception 'Only UserAdmin or Superadmin can change verification state.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privilege_changes on public.profiles;
create trigger guard_profile_privilege_changes before update on public.profiles for each row execute function public.guard_profile_privilege_changes();

grant execute on function public.current_staff_roles() to authenticated;
