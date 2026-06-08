-- Repair foreign keys that can block user deletion when a profile is removed.
-- Apply this in Supabase SQL editor on the live database.

-- Profiles referenced by team and player workflows.
alter table public.teams drop constraint if exists teams_founder_id_fkey;
alter table public.teams add constraint teams_founder_id_fkey foreign key (founder_id) references public.profiles(id) on delete cascade;

alter table public.teams drop constraint if exists teams_team_leader_id_fkey;
alter table public.teams add constraint teams_team_leader_id_fkey foreign key (team_leader_id) references public.profiles(id) on delete cascade;

alter table public.teams drop constraint if exists teams_coach_id_fkey;
alter table public.teams add constraint teams_coach_id_fkey foreign key (coach_id) references public.profiles(id) on delete set null;

alter table public.teams drop constraint if exists teams_approved_by_fkey;
alter table public.teams add constraint teams_approved_by_fkey foreign key (approved_by) references public.profiles(id) on delete set null;

alter table public.player_appeals drop constraint if exists player_appeals_user_id_fkey;
alter table public.player_appeals add constraint player_appeals_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.player_appeals drop constraint if exists player_appeals_reviewed_by_fkey;
alter table public.player_appeals add constraint player_appeals_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.team_approval_requests drop constraint if exists team_approval_requests_requested_by_fkey;
alter table public.team_approval_requests add constraint team_approval_requests_requested_by_fkey foreign key (requested_by) references public.profiles(id) on delete cascade;

alter table public.team_approval_requests drop constraint if exists team_approval_requests_reviewed_by_fkey;
alter table public.team_approval_requests add constraint team_approval_requests_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.tournaments drop constraint if exists tournaments_created_by_fkey;
alter table public.tournaments add constraint tournaments_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.tournament_registrations drop constraint if exists tournament_registrations_requested_by_fkey;
alter table public.tournament_registrations add constraint tournament_registrations_requested_by_fkey foreign key (requested_by) references public.profiles(id) on delete cascade;

alter table public.tournament_registrations drop constraint if exists tournament_registrations_reviewed_by_fkey;
alter table public.tournament_registrations add constraint tournament_registrations_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.matches drop constraint if exists matches_mvp_player_id_fkey;
alter table public.matches add constraint matches_mvp_player_id_fkey foreign key (mvp_player_id) references public.profiles(id) on delete set null;

-- Feed, messaging, and audit references.
alter table public.feed_posts drop constraint if exists feed_posts_author_id_fkey;
alter table public.feed_posts add constraint feed_posts_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;

alter table public.feed_posts drop constraint if exists feed_posts_target_user_id_fkey;
alter table public.feed_posts add constraint feed_posts_target_user_id_fkey foreign key (target_user_id) references public.profiles(id) on delete set null;

alter table public.conversations drop constraint if exists conversations_assigned_mod_id_fkey;
alter table public.conversations add constraint conversations_assigned_mod_id_fkey foreign key (assigned_mod_id) references public.profiles(id) on delete set null;

alter table public.messages drop constraint if exists messages_sender_id_fkey;
alter table public.messages add constraint messages_sender_id_fkey foreign key (sender_id) references public.profiles(id) on delete cascade;

alter table public.messages drop constraint if exists messages_receiver_id_fkey;
alter table public.messages add constraint messages_receiver_id_fkey foreign key (receiver_id) references public.profiles(id) on delete set null;

alter table public.support_tickets drop constraint if exists support_tickets_user_id_fkey;
alter table public.support_tickets add constraint support_tickets_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.support_tickets drop constraint if exists support_tickets_assigned_mod_id_fkey;
alter table public.support_tickets add constraint support_tickets_assigned_mod_id_fkey foreign key (assigned_mod_id) references public.profiles(id) on delete set null;

alter table public.audit_logs drop constraint if exists audit_logs_admin_id_fkey;
alter table public.audit_logs add constraint audit_logs_admin_id_fkey foreign key (admin_id) references public.profiles(id) on delete set null;
