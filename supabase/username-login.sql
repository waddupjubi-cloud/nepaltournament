-- Run this once to add unique lowercase username login support.

alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_unique on public.profiles(username);

create or replace function public.username_base(display_name text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(regexp_replace(lower(split_part(trim(coalesce(display_name, 'user')), ' ', 1)), '[^a-z0-9]', '', 'g'), ''), 'user');
$$;

create or replace function public.generate_username(display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  serial integer := 1;
begin
  base := public.username_base(display_name);
  loop
    candidate := base || serial::text;
    if not exists (select 1 from public.profiles where username = candidate) then
      return candidate;
    end if;
    serial := serial + 1;
  end loop;
end;
$$;

create or replace function public.resolve_login_email(login_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when position('@' in lower(trim(login_identifier))) > 0 then lower(trim(login_identifier))
    else (
      select lower(au.email)
      from public.profiles p
      join auth.users au on au.id = p.id
      where p.username = lower(trim(login_identifier))
      limit 1
    )
  end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;

do $$
declare
  profile_record record;
begin
  for profile_record in
    select id, full_name, ign
    from public.profiles
    where username is null
    order by created_at
  loop
    update public.profiles
    set username = public.generate_username(coalesce(profile_record.full_name, profile_record.ign, profile_record.id::text))
    where id = profile_record.id;
  end loop;
end;
$$;

alter table public.profiles alter column username set not null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, username, date_of_birth, ign, game_id, server_id, is_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), public.generate_username(coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))),
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
