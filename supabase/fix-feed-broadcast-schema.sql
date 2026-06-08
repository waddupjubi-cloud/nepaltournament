-- Repair older feed tables so broadcast posts work for all users and targeted recipients.

alter table public.feed_posts
  add column if not exists audience_type text default 'all',
  add column if not exists target_role text,
  add column if not exists target_user_id uuid references public.profiles(id),
  add column if not exists target_team_id uuid references public.teams(team_id),
  add column if not exists updated_at timestamptz not null default now();

update public.feed_posts
set audience_type = coalesce(audience_type, 'all')
where audience_type is null;

alter table public.feed_posts
  alter column audience_type set default 'all',
  alter column audience_type set not null;

alter table public.feed_posts
  drop constraint if exists feed_posts_audience_type_check;

alter table public.feed_posts
  add constraint feed_posts_audience_type_check
  check (audience_type in ('all','users','players','staff','role','individual','team'));

drop index if exists feed_posts_audience_idx;
create index if not exists feed_posts_audience_idx on public.feed_posts(audience_type, target_role, target_user_id, target_team_id);

drop trigger if exists feed_posts_updated_at on public.feed_posts;
create trigger feed_posts_updated_at before update on public.feed_posts for each row execute function public.set_updated_at();

drop policy if exists "feed read" on public.feed_posts;
create policy "feed read" on public.feed_posts for select using (
  audience_type = 'all'
  or (audience_type = 'users' and auth.uid() is not null)
  or (audience_type = 'players' and public.current_role() in ('player','superadmin'))
  or (audience_type = 'staff' and public.current_staff_role() is not null)
  or (audience_type = 'role' and (
    public.current_role() = target_role
    or public.current_staff_role() = target_role
    or exists (select 1 from public.profiles p where p.id = auth.uid() and target_role = any(p.player_roles))
  ))
  or (audience_type = 'individual' and target_user_id = auth.uid())
  or (audience_type = 'team' and target_team_id is not null and public.is_team_member(target_team_id, auth.uid()))
  or author_id = auth.uid()
  or public.current_staff_role() is not null
);
