-- Repair user deletion and feed broadcast compatibility.

-- Add missing feed broadcast columns for older databases.
alter table public.feed_posts
  add column if not exists audience_type text,
  add column if not exists target_role text,
  add column if not exists target_user_id uuid,
  add column if not exists target_team_id uuid,
  add column if not exists updated_at timestamptz;

update public.feed_posts
set audience_type = coalesce(audience_type, 'all')
where audience_type is null;

alter table public.feed_posts
  alter column audience_type set default 'all',
  alter column audience_type set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.feed_posts
  drop constraint if exists feed_posts_audience_type_check;

alter table public.feed_posts
  add constraint feed_posts_audience_type_check
  check (audience_type in ('all','users','players','staff','role','individual','team'))
  not valid;

alter table public.feed_posts validate constraint feed_posts_audience_type_check;

-- Repair foreign keys that can block profile deletion.
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
