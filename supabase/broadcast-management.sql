-- Run this once to enable Broadcast Management.

alter table public.feed_posts
  add column if not exists pin_order integer,
  add column if not exists audience_type text not null default 'all',
  add column if not exists target_role text,
  add column if not exists target_user_id uuid references public.profiles(id),
  add column if not exists target_team_id uuid references public.teams(team_id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.feed_posts
  drop constraint if exists feed_posts_audience_type_check;

alter table public.feed_posts
  add constraint feed_posts_audience_type_check
  check (audience_type in ('all','users','players','staff','role','individual','team'));

with ranked as (
  select
    post_id,
    row_number() over (order by created_at desc) as pin_rank
  from public.feed_posts
  where is_pinned = true
)
update public.feed_posts fp
set
  is_pinned = ranked.pin_rank <= 5,
  pin_order = case when ranked.pin_rank <= 5 then ranked.pin_rank else null end
from ranked
where fp.post_id = ranked.post_id;

update public.feed_posts
set pin_order = null
where is_pinned = false and pin_order is not null;

alter table public.feed_posts
  drop constraint if exists feed_posts_pin_order_check;

alter table public.feed_posts
  add constraint feed_posts_pin_order_check
  check ((is_pinned = false and pin_order is null) or (is_pinned = true and pin_order between 1 and 5));

drop index if exists feed_posts_audience_idx;
create index if not exists feed_posts_audience_idx on public.feed_posts(audience_type, target_role, target_user_id, target_team_id);
create unique index if not exists feed_posts_pin_order_unique on public.feed_posts(pin_order) where is_pinned = true and pin_order is not null;

drop trigger if exists feed_posts_updated_at on public.feed_posts;
create trigger feed_posts_updated_at before update on public.feed_posts for each row execute function public.set_updated_at();

create or replace function public.guard_feed_post_author_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_staff text;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  caller_staff := public.current_staff_role();
  if caller_staff is null then
    raise exception 'Only staff can manage broadcasts.';
  end if;

  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_role := caller_staff;
    return new;
  end if;

  new.author_id := old.author_id;
  new.author_role := old.author_role;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists guard_feed_post_author_fields on public.feed_posts;
create trigger guard_feed_post_author_fields before insert or update on public.feed_posts for each row execute function public.guard_feed_post_author_fields();

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

drop policy if exists "feed staff create" on public.feed_posts;
create policy "feed staff create" on public.feed_posts for insert with check (
  public.current_staff_role() is not null
  and author_id = auth.uid()
  and coalesce(pin_order, 1) between 1 and 5
);

drop policy if exists "feed staff update" on public.feed_posts;
create policy "feed staff update" on public.feed_posts for update
using (
  author_id = auth.uid()
  or public.current_staff_role() = 'superadmin'
  or (author_role in ('useradmin','playeradmin','tournamentadmin','usermod','playermod','tournamentmod') and public.current_staff_role() in ('useradmin','playeradmin','tournamentadmin'))
)
with check (
  (author_id = auth.uid()
    or public.current_staff_role() = 'superadmin'
    or (author_role in ('useradmin','playeradmin','tournamentadmin','usermod','playermod','tournamentmod') and public.current_staff_role() in ('useradmin','playeradmin','tournamentadmin')))
  and coalesce(pin_order, 1) between 1 and 5
);

drop policy if exists "feed staff delete" on public.feed_posts;
create policy "feed staff delete" on public.feed_posts for delete using (
  public.current_staff_role() = 'superadmin'
  or (author_id = auth.uid() and author_role <> 'superadmin')
  or (author_role in ('useradmin','playeradmin','tournamentadmin','usermod','playermod','tournamentmod') and public.current_staff_role() in ('useradmin','playeradmin','tournamentadmin'))
);
