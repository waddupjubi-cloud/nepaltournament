-- Run this after schema.sql/fix-grants.sql to enable the upgraded dashboard CRUD.

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

  if (new.role is distinct from old.role or new.is_player_approved is distinct from old.is_player_approved)
    and not public.is_staff(array['useradmin', 'superadmin']) then
    raise exception 'Only UserAdmin or Superadmin can approve player role changes.';
  end if;

  if coalesce(new.player_roles, '{}'::text[]) is distinct from coalesce(old.player_roles, '{}'::text[])
    and not public.is_staff(array['useradmin', 'playeradmin', 'superadmin']) then
    raise exception 'Only PlayerAdmin, UserAdmin, or Superadmin can change player roles.';
  end if;

  if new.is_verified is distinct from old.is_verified and not public.is_staff(array['useradmin', 'superadmin']) then
    raise exception 'Only UserAdmin or Superadmin can change verification state.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privilege_changes on public.profiles;
create trigger guard_profile_privilege_changes before update on public.profiles for each row execute function public.guard_profile_privilege_changes();

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update
using (id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod','playeradmin','tournamentadmin']))
with check (id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod','playeradmin','tournamentadmin']));

drop policy if exists "profiles superadmin delete" on public.profiles;
create policy "profiles superadmin delete" on public.profiles for delete using (public.is_staff(array['superadmin']) and staff_role <> 'superadmin');

drop policy if exists "teams staff delete" on public.teams;
create policy "teams staff delete" on public.teams for delete using (public.is_staff(array['superadmin','playeradmin']));

create or replace function public.admin_delete_team(target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_staff text;
begin
  caller_staff := public.current_staff_role();
  if not public.is_staff(array['superadmin', 'playeradmin']) then
    raise exception 'Only Superadmin or PlayerAdmin can delete teams.';
  end if;

  update public.matches
  set
    team_a_id = case when team_a_id = target_team_id then null else team_a_id end,
    team_b_id = case when team_b_id = target_team_id then null else team_b_id end,
    winner_team_id = case when winner_team_id = target_team_id then null else winner_team_id end,
    updated_at = now()
  where team_a_id = target_team_id
     or team_b_id = target_team_id
     or winner_team_id = target_team_id;

  delete from public.tournament_registrations where team_id = target_team_id;
  delete from public.team_approval_requests where team_id = target_team_id;
  delete from public.team_members where team_id = target_team_id;
  delete from public.messages where team_id = target_team_id;
  delete from public.conversations where team_id = target_team_id;
  delete from public.teams where team_id = target_team_id;
end;
$$;

grant execute on function public.admin_delete_team(uuid) to authenticated;

drop policy if exists "registrations staff delete" on public.tournament_registrations;
create policy "registrations staff delete" on public.tournament_registrations for delete using (public.is_staff(array['superadmin','tournamentadmin']));

drop policy if exists "team approvals staff delete" on public.team_approval_requests;
create policy "team approvals staff delete" on public.team_approval_requests for delete using (public.is_staff(array['superadmin','playeradmin']));

drop policy if exists "appeals superadmin all" on public.player_appeals;
create policy "appeals superadmin all" on public.player_appeals for all using (public.is_staff(array['superadmin'])) with check (public.is_staff(array['superadmin']));

drop policy if exists "notifications superadmin all" on public.notifications;
create policy "notifications superadmin all" on public.notifications for all using (public.is_staff(array['superadmin'])) with check (public.is_staff(array['superadmin']));

drop policy if exists "conversations superadmin all" on public.conversations;
create policy "conversations superadmin all" on public.conversations for all using (public.is_staff(array['superadmin'])) with check (public.is_staff(array['superadmin']));

drop policy if exists "participants superadmin all" on public.conversation_participants;
create policy "participants superadmin all" on public.conversation_participants for all using (public.is_staff(array['superadmin'])) with check (public.is_staff(array['superadmin']));

drop policy if exists "messages superadmin all" on public.messages;
create policy "messages superadmin all" on public.messages for all using (public.is_staff(array['superadmin'])) with check (public.is_staff(array['superadmin']));

drop policy if exists "support superadmin all" on public.support_tickets;
create policy "support superadmin all" on public.support_tickets for all using (public.is_staff(array['superadmin'])) with check (public.is_staff(array['superadmin']));

drop policy if exists "audit read" on public.audit_logs;
create policy "audit read" on public.audit_logs for select using (public.is_staff(array['superadmin','useradmin','usermod','playeradmin','playermod','tournamentadmin','tournamentmod']));
drop policy if exists "audit insert" on public.audit_logs;
create policy "audit insert" on public.audit_logs for insert with check (public.is_staff(array['superadmin','useradmin','usermod','playeradmin','playermod','tournamentadmin','tournamentmod']));
