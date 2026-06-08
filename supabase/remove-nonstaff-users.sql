-- DESTRUCTIVE ONE-TIME CLEANUP.
-- Keeps profiles/Auth users that have any staff role, including Superadmin.
-- Removes non-staff users and dependent player/team/chat data.
-- Review the count first, then run the full script in Supabase SQL Editor.

begin;

create temporary table purge_nonstaff_ids on commit drop as
select id
from public.profiles
where role not in ('usermod','playermod','tournamentmod','useradmin','playeradmin','tournamentadmin','superadmin')
  and staff_role is null
  and coalesce(array_length(staff_roles, 1), 0) = 0;

-- Review this result before committing the rest of the script.
select count(*) as nonstaff_users_to_remove from purge_nonstaff_ids;

create temporary table purge_team_ids on commit drop as
select distinct t.team_id
from public.teams t
where t.founder_id in (select id from purge_nonstaff_ids)
   or t.team_leader_id in (select id from purge_nonstaff_ids)
   or t.coach_id in (select id from purge_nonstaff_ids)
   or exists (
     select 1
     from jsonb_array_elements(coalesce(t.roster, '[]'::jsonb)) member
     where (member->>'player_id')::uuid in (select id from purge_nonstaff_ids)
   );

delete from public.messages
where sender_id in (select id from purge_nonstaff_ids)
   or receiver_id in (select id from purge_nonstaff_ids)
   or team_id in (select team_id from purge_team_ids);

delete from public.conversations
where team_id in (select team_id from purge_team_ids)
   or assigned_mod_id in (select id from purge_nonstaff_ids)
   or conversation_id in (
     select conversation_id
     from public.conversation_participants
     where user_id in (select id from purge_nonstaff_ids)
   );

delete from public.support_tickets
where user_id in (select id from purge_nonstaff_ids);

update public.support_tickets set assigned_mod_id = null
where assigned_mod_id in (select id from purge_nonstaff_ids);

delete from public.team_approval_requests
where requested_by in (select id from purge_nonstaff_ids);

update public.team_approval_requests set reviewed_by = null
where reviewed_by in (select id from purge_nonstaff_ids);

delete from public.tournament_registrations
where requested_by in (select id from purge_nonstaff_ids);

update public.tournament_registrations set reviewed_by = null
where reviewed_by in (select id from purge_nonstaff_ids);

delete from public.matches
where team_a_id in (select team_id from purge_team_ids)
   or team_b_id in (select team_id from purge_team_ids)
   or winner_team_id in (select team_id from purge_team_ids);

update public.matches set mvp_player_id = null
where mvp_player_id in (select id from purge_nonstaff_ids);

update public.feed_posts set target_team_id = null
where target_team_id in (select team_id from purge_team_ids);

delete from public.teams
where team_id in (select team_id from purge_team_ids);

update public.teams set approved_by = null
where approved_by in (select id from purge_nonstaff_ids);

update public.tournaments set created_by = null
where created_by in (select id from purge_nonstaff_ids);

update public.feed_posts set author_id = null
where author_id in (select id from purge_nonstaff_ids);

update public.feed_posts set target_user_id = null
where target_user_id in (select id from purge_nonstaff_ids);

update public.player_appeals set reviewed_by = null
where reviewed_by in (select id from purge_nonstaff_ids);

update public.audit_logs set admin_id = null
where admin_id in (select id from purge_nonstaff_ids);

delete from auth.users
where id in (select id from purge_nonstaff_ids);

commit;
