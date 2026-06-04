-- One-time helper for an existing Supabase project.
-- This changes/promotes the Superadmin Auth user to:
-- Email: bzumaharjan2@gmail.com
-- Password: #Batman007
--
-- Safe path:
-- 1. Run this in Supabase SQL Editor.
-- 2. Log out of the app.
-- 3. Log in at staff.html with bzumaharjan2@gmail.com / #Batman007.
--
-- Notes:
-- - If bzumaharjan2@gmail.com already exists in Auth, this script promotes that user.
-- - If only super@tournament.com exists, this script changes that Auth user email/password.
-- - If both users exist, this script promotes bzumaharjan2@gmail.com and demotes super@tournament.com.

do $$
declare
  new_email text := 'bzumaharjan2@gmail.com';
  old_email text := 'super@tournament.com';
  new_password text := '#Batman007';
  new_user_id uuid;
  old_user_id uuid;
begin
  select id into new_user_id from auth.users where email = new_email limit 1;
  select id into old_user_id from auth.users where email = old_email limit 1;

  if new_user_id is null and old_user_id is null then
    raise exception 'No superadmin Auth user found. Create % in Authentication > Users first, then run this again.', new_email;
  end if;

  if new_user_id is null then
    update auth.users
    set
      email = new_email,
      encrypted_password = crypt(new_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now(),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email_verified', true)
    where id = old_user_id
    returning id into new_user_id;

    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', new_email, 'email_verified', true),
      updated_at = now()
    where user_id = new_user_id and provider = 'email';
  else
    update auth.users
    set
      encrypted_password = crypt(new_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now(),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email_verified', true)
    where id = new_user_id;

    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', new_email, 'email_verified', true),
      updated_at = now()
    where user_id = new_user_id and provider = 'email';
  end if;

  if exists (select 1 from pg_trigger where tgname = 'protect_superadmin' and tgrelid = 'public.profiles'::regclass) then
    alter table public.profiles disable trigger protect_superadmin;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'guard_profile_privilege_changes' and tgrelid = 'public.profiles'::regclass) then
    alter table public.profiles disable trigger guard_profile_privilege_changes;
  end if;

  insert into public.profiles (id, full_name, username, role, staff_role, is_verified, is_player_approved)
  values (new_user_id, 'Super Admin', public.generate_username('Super Admin'), 'superadmin', 'superadmin', true, true)
  on conflict (id) do update
  set
    full_name = 'Super Admin',
    username = coalesce(public.profiles.username, excluded.username),
    role = 'superadmin',
    staff_role = 'superadmin',
    is_verified = true,
    is_player_approved = true,
    updated_at = now();

  if old_user_id is not null and old_user_id <> new_user_id then
    update public.profiles
    set role = 'user', staff_role = null, updated_at = now()
    where id = old_user_id;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'protect_superadmin' and tgrelid = 'public.profiles'::regclass) then
    alter table public.profiles enable trigger protect_superadmin;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'guard_profile_privilege_changes' and tgrelid = 'public.profiles'::regclass) then
    alter table public.profiles enable trigger guard_profile_privilege_changes;
  end if;
end $$;
