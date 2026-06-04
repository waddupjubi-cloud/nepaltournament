-- Run this if Player Management cannot delete teams.
-- It adds a safe department-aware delete RPC that clears dependent references first.

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
  if caller_staff not in ('superadmin', 'playeradmin') then
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
