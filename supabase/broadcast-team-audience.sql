-- Run this on existing projects to let broadcasts target approved teams.

alter table public.feed_posts
  add column if not exists target_team_id uuid references public.teams(team_id);

alter table public.feed_posts
  drop constraint if exists feed_posts_audience_type_check;

alter table public.feed_posts
  add constraint feed_posts_audience_type_check
  check (audience_type in ('all','users','players','staff','role','individual','team'));

drop index if exists feed_posts_audience_idx;
create index if not exists feed_posts_audience_idx on public.feed_posts(audience_type, target_role, target_user_id, target_team_id);

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
