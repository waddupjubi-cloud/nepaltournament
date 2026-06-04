-- Tournament Players Supabase schema.
-- Run this in the Supabase SQL editor after creating a new project.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.profile_role as enum ('user','player','usermod','playermod','tournamentmod','useradmin','playeradmin','tournamentadmin','superadmin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_role as enum ('usermod','playermod','tournamentmod','useradmin','playeradmin','tournamentadmin','superadmin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.team_status as enum ('recruiting','pending','approved','disbanded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tournament_status as enum ('draft','registration','in_progress','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_status as enum ('scheduled','checkin_open','live','paused','finished','forfeit');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  date_of_birth date,
  ign text,
  game_id text,
  server_id text,
  bio text,
  role public.profile_role not null default 'user',
  staff_role public.staff_role,
  is_verified boolean not null default false,
  is_player_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint superadmin_staff_role check ((role = 'superadmin' and staff_role = 'superadmin') or role <> 'superadmin')
);

create table if not exists public.player_appeals (
  appeal_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  preferred_roles text[] not null default '{}',
  note text,
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.teams (
  team_id uuid primary key default gen_random_uuid(),
  team_name text not null,
  team_tag text not null,
  logo_url text,
  founder_id uuid not null references public.profiles(id),
  team_leader_id uuid not null references public.profiles(id),
  coach_id uuid references public.profiles(id),
  status public.team_status not null default 'recruiting',
  roster jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  constraint roster_size check (jsonb_array_length(roster) between 1 and 8)
);

create table if not exists public.team_members (
  team_member_id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(team_id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('exp','jg','gd','md','rm','coach','sb1','sb2','founder','leader')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(team_id, player_id, left_at)
);

create table if not exists public.team_approval_requests (
  request_id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(team_id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.tournaments (
  tournament_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  game text,
  team_capacity integer not null check (team_capacity in (4,8,16,32,64,128)),
  start_date date not null,
  registration_deadline date not null,
  format_spec jsonb not null default '{}'::jsonb,
  max_matches_per_day integer not null default 6,
  status public.tournament_status not null default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_registrations (
  registration_id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(tournament_id) on delete cascade,
  team_id uuid not null references public.teams(team_id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(tournament_id, team_id)
);

create table if not exists public.matches (
  match_id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(tournament_id) on delete cascade,
  round_name text not null,
  round_number integer,
  team_a_id uuid references public.teams(team_id),
  team_b_id uuid references public.teams(team_id),
  team_a_score integer default 0,
  team_b_score integer default 0,
  winner_team_id uuid references public.teams(team_id),
  status public.match_status not null default 'scheduled',
  scheduled_start_utc timestamptz,
  actual_start_utc timestamptz,
  actual_end_utc timestamptz,
  mvp_player_id uuid references public.profiles(id),
  match_notes text,
  game_scores jsonb not null default '[]'::jsonb,
  lobby_id text,
  lobby_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_stage_tables (
  group_id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(tournament_id) on delete cascade,
  group_name text not null,
  team_id uuid not null references public.teams(team_id) on delete cascade,
  points integer not null default 0,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  goal_difference integer not null default 0,
  tiebreaker_note text,
  unique(tournament_id, group_name, team_id)
);

create table if not exists public.feed_posts (
  post_id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id),
  author_role text not null default 'admin',
  title text not null,
  content text not null,
  media_url text,
  tournament_id uuid references public.tournaments(tournament_id),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','team','support')),
  team_id uuid references public.teams(team_id),
  assigned_mod_id uuid references public.profiles(id),
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(conversation_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  message_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sender_id uuid not null references public.profiles(id),
  receiver_id uuid references public.profiles(id),
  team_id uuid references public.teams(team_id),
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  assigned_mod_id uuid references public.profiles(id),
  subject text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  log_id bigserial primary key,
  admin_id uuid references public.profiles(id),
  action text not null,
  target_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_staff_role_idx on public.profiles(staff_role);
create index if not exists teams_status_idx on public.teams(status);
create index if not exists matches_tournament_idx on public.matches(tournament_id);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, is_read);
create index if not exists messages_team_idx on public.messages(team_id, created_at);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

alter table public.profiles replica identity full;
alter table public.player_appeals replica identity full;
alter table public.teams replica identity full;
alter table public.team_members replica identity full;
alter table public.team_approval_requests replica identity full;
alter table public.tournaments replica identity full;
alter table public.tournament_registrations replica identity full;
alter table public.matches replica identity full;
alter table public.feed_posts replica identity full;
alter table public.notifications replica identity full;
alter table public.messages replica identity full;
alter table public.audit_logs replica identity full;

do $$ begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.player_appeals; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.teams; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.team_members; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.team_approval_requests; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tournaments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tournament_registrations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.matches; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.feed_posts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.audit_logs; exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists tournaments_updated_at on public.tournaments;
create trigger tournaments_updated_at before update on public.tournaments for each row execute function public.set_updated_at();

drop trigger if exists matches_updated_at on public.matches;
create trigger matches_updated_at before update on public.matches for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, date_of_birth, ign, game_id, server_id, is_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
    nullif(new.raw_user_meta_data->>'ign', ''),
    nullif(new.raw_user_meta_data->>'game_id', ''),
    nullif(new.raw_user_meta_data->>'server_id', ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select staff_role::text from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff(required text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_role() = any(required), false);
$$;

create or replace function public.is_team_member(target_team uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teams t
    where t.team_id = target_team
    and t.roster @> jsonb_build_array(jsonb_build_object('player_id', target_user::text))
  );
$$;

create or replace function public.prevent_superadmin_role_change()
returns trigger language plpgsql as $$
begin
  if old.staff_role = 'superadmin' and (new.staff_role is distinct from old.staff_role or new.role is distinct from old.role) then
    raise exception 'The superadmin role is protected.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_superadmin on public.profiles;
create trigger protect_superadmin before update on public.profiles for each row execute function public.prevent_superadmin_role_change();

create or replace function public.prevent_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not public.is_staff(array['superadmin','useradmin','playeradmin','tournamentadmin']) then
    if new.role is distinct from old.role
      or new.staff_role is distinct from old.staff_role
      or new.is_player_approved is distinct from old.is_player_approved
      or new.is_verified is distinct from old.is_verified then
      raise exception 'Users cannot change their own privileges.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_privilege_escalation on public.profiles;
create trigger prevent_self_privilege_escalation before update on public.profiles for each row execute function public.prevent_self_privilege_escalation();

alter table public.profiles enable row level security;
alter table public.player_appeals enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_approval_requests enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.matches enable row level security;
alter table public.group_stage_tables enable row level security;
alter table public.feed_posts enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.support_tickets enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update using (id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod','playeradmin','tournamentadmin'])) with check (id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod','playeradmin','tournamentadmin']));

drop policy if exists "appeals owner read" on public.player_appeals;
create policy "appeals owner read" on public.player_appeals for select using (user_id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod']));
drop policy if exists "appeals owner create" on public.player_appeals;
create policy "appeals owner create" on public.player_appeals for insert with check (user_id = auth.uid());
drop policy if exists "appeals staff update" on public.player_appeals;
create policy "appeals staff update" on public.player_appeals for update using (public.is_staff(array['superadmin','useradmin'])) with check (public.is_staff(array['superadmin','useradmin']));

drop policy if exists "teams read" on public.teams;
create policy "teams read" on public.teams for select using (status in ('approved','recruiting') or founder_id = auth.uid() or team_leader_id = auth.uid() or public.is_staff(array['superadmin','playeradmin','playermod']));
drop policy if exists "teams player create" on public.teams;
create policy "teams player create" on public.teams for insert with check ((public.current_role() in ('player','superadmin') or public.is_staff(array['superadmin'])) and founder_id = auth.uid());
drop policy if exists "teams manager update" on public.teams;
create policy "teams manager update" on public.teams for update using (founder_id = auth.uid() or team_leader_id = auth.uid() or coach_id = auth.uid() or public.is_staff(array['superadmin','playeradmin','playermod'])) with check (founder_id = auth.uid() or team_leader_id = auth.uid() or coach_id = auth.uid() or public.is_staff(array['superadmin','playeradmin','playermod']));

drop policy if exists "team members read" on public.team_members;
create policy "team members read" on public.team_members for select using (true);
drop policy if exists "team members staff write" on public.team_members;
create policy "team members staff write" on public.team_members for all using (public.is_staff(array['superadmin','playeradmin','playermod'])) with check (public.is_staff(array['superadmin','playeradmin','playermod']));

drop policy if exists "team approvals read" on public.team_approval_requests;
create policy "team approvals read" on public.team_approval_requests for select using (requested_by = auth.uid() or public.is_staff(array['superadmin','playeradmin','playermod']));
drop policy if exists "team approvals create" on public.team_approval_requests;
create policy "team approvals create" on public.team_approval_requests for insert with check (requested_by = auth.uid());
drop policy if exists "team approvals staff update" on public.team_approval_requests;
create policy "team approvals staff update" on public.team_approval_requests for update using (public.is_staff(array['superadmin','playeradmin','playermod'])) with check (public.is_staff(array['superadmin','playeradmin','playermod']));

drop policy if exists "tournaments read" on public.tournaments;
create policy "tournaments read" on public.tournaments for select using (status <> 'draft' or public.is_staff(array['superadmin','tournamentadmin','tournamentmod']));
drop policy if exists "tournaments staff write" on public.tournaments;
create policy "tournaments staff write" on public.tournaments for all using (public.is_staff(array['superadmin','tournamentadmin'])) with check (public.is_staff(array['superadmin','tournamentadmin']));

drop policy if exists "registrations read" on public.tournament_registrations;
create policy "registrations read" on public.tournament_registrations for select using (requested_by = auth.uid() or public.is_staff(array['superadmin','tournamentadmin','tournamentmod']));
drop policy if exists "registrations create" on public.tournament_registrations;
create policy "registrations create" on public.tournament_registrations for insert with check (requested_by = auth.uid());
drop policy if exists "registrations staff update" on public.tournament_registrations;
create policy "registrations staff update" on public.tournament_registrations for update using (public.is_staff(array['superadmin','tournamentadmin','tournamentmod'])) with check (public.is_staff(array['superadmin','tournamentadmin','tournamentmod']));

drop policy if exists "matches public read" on public.matches;
create policy "matches public read" on public.matches for select using (lobby_password is null or public.is_staff(array['superadmin','tournamentadmin','tournamentmod']) or public.is_team_member(team_a_id, auth.uid()) or public.is_team_member(team_b_id, auth.uid()));
drop policy if exists "matches staff write" on public.matches;
create policy "matches staff write" on public.matches for all using (public.is_staff(array['superadmin','tournamentadmin','tournamentmod'])) with check (public.is_staff(array['superadmin','tournamentadmin','tournamentmod']));

drop policy if exists "groups read" on public.group_stage_tables;
create policy "groups read" on public.group_stage_tables for select using (true);
drop policy if exists "groups staff write" on public.group_stage_tables;
create policy "groups staff write" on public.group_stage_tables for all using (public.is_staff(array['superadmin','tournamentadmin','tournamentmod'])) with check (public.is_staff(array['superadmin','tournamentadmin','tournamentmod']));

drop policy if exists "feed read" on public.feed_posts;
create policy "feed read" on public.feed_posts for select using (true);
drop policy if exists "feed staff create" on public.feed_posts;
create policy "feed staff create" on public.feed_posts for insert with check (public.is_staff(array['superadmin','tournamentadmin','tournamentmod']) and author_id = auth.uid());
drop policy if exists "feed staff update" on public.feed_posts;
create policy "feed staff update" on public.feed_posts for update using (author_id = auth.uid() or public.is_staff(array['superadmin'])) with check (author_id = auth.uid() or public.is_staff(array['superadmin']));
drop policy if exists "feed staff delete" on public.feed_posts;
create policy "feed staff delete" on public.feed_posts for delete using (author_id = auth.uid() or public.is_staff(array['superadmin']));

drop policy if exists "notifications own read" on public.notifications;
create policy "notifications own read" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications staff insert" on public.notifications;
create policy "notifications staff insert" on public.notifications for insert with check (user_id = auth.uid() or public.is_staff(array['superadmin','useradmin','playeradmin','tournamentadmin','usermod','playermod','tournamentmod']));

drop policy if exists "conversations read" on public.conversations;
create policy "conversations read" on public.conversations for select using (exists (select 1 from public.conversation_participants cp where cp.conversation_id = conversations.conversation_id and cp.user_id = auth.uid()) or public.is_staff(array['superadmin','useradmin','usermod']));
drop policy if exists "conversations create" on public.conversations;
create policy "conversations create" on public.conversations for insert with check (auth.uid() is not null);

drop policy if exists "participants read" on public.conversation_participants;
create policy "participants read" on public.conversation_participants for select using (user_id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod']));
drop policy if exists "participants create" on public.conversation_participants;
create policy "participants create" on public.conversation_participants for insert with check (user_id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod']));

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
  or (team_id is not null and public.is_team_member(team_id, auth.uid()))
  or exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid())
  or public.is_staff(array['superadmin','useradmin','usermod'])
);
drop policy if exists "messages create" on public.messages;
create policy "messages create" on public.messages for insert with check (sender_id = auth.uid());

drop policy if exists "support read" on public.support_tickets;
create policy "support read" on public.support_tickets for select using (user_id = auth.uid() or assigned_mod_id = auth.uid() or public.is_staff(array['superadmin','useradmin']));
drop policy if exists "support create" on public.support_tickets;
create policy "support create" on public.support_tickets for insert with check (user_id = auth.uid());
drop policy if exists "support staff update" on public.support_tickets;
create policy "support staff update" on public.support_tickets for update using (assigned_mod_id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod'])) with check (assigned_mod_id = auth.uid() or public.is_staff(array['superadmin','useradmin','usermod']));

drop policy if exists "audit read" on public.audit_logs;
create policy "audit read" on public.audit_logs for select using (public.is_staff(array['superadmin','useradmin','playeradmin','tournamentadmin']));
drop policy if exists "audit insert" on public.audit_logs;
create policy "audit insert" on public.audit_logs for insert with check (public.is_staff(array['superadmin','useradmin','playeradmin','tournamentadmin']));

create or replace function public.guard_profile_privilege_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_staff text;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  caller_staff := public.current_staff_role();

  if old.staff_role = 'superadmin' and (new.staff_role is distinct from old.staff_role or new.role is distinct from old.role) then
    raise exception 'Superadmin accounts are protected.';
  end if;

  if new.role is not distinct from old.role
    and new.staff_role is not distinct from old.staff_role
    and new.is_player_approved is not distinct from old.is_player_approved
    and new.is_verified is not distinct from old.is_verified then
    return new;
  end if;

  if caller_staff = 'superadmin' then
    return new;
  end if;

  if new.staff_role is distinct from old.staff_role then
    if caller_staff = 'useradmin' and coalesce(old.staff_role::text, '') in ('', 'usermod') and coalesce(new.staff_role::text, '') in ('', 'usermod') then
      return new;
    elsif caller_staff = 'playeradmin' and coalesce(old.staff_role::text, '') in ('', 'playermod') and coalesce(new.staff_role::text, '') in ('', 'playermod') then
      return new;
    elsif caller_staff = 'tournamentadmin' and coalesce(old.staff_role::text, '') in ('', 'tournamentmod') and coalesce(new.staff_role::text, '') in ('', 'tournamentmod') then
      return new;
    else
      raise exception 'You cannot assign that staff role.';
    end if;
  end if;

  if (new.role is distinct from old.role or new.is_player_approved is distinct from old.is_player_approved)
    and caller_staff not in ('useradmin', 'superadmin') then
    raise exception 'Only UserAdmin or Superadmin can approve player role changes.';
  end if;

  if new.is_verified is distinct from old.is_verified and caller_staff not in ('useradmin', 'superadmin') then
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

-- Storage: create a public bucket named team-logos in Supabase Storage UI.
-- Recommended storage policy:
-- bucket_id = 'team-logos' and auth.role() = 'authenticated' for inserts;
-- bucket_id = 'team-logos' for public reads.
