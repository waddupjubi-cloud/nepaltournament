-- Seed data after schema.sql.
-- Create the first superadmin user in Supabase Auth first:
-- Dashboard > Authentication > Add user
-- Email: bzumarhajn2@gmail.com
-- Password: #Batman007
-- Mark "Email confirmed".
-- Then run this SQL.

update public.profiles
set
  full_name = 'Super Admin',
  role = 'superadmin',
  staff_role = 'superadmin',
  is_verified = true,
  is_player_approved = true,
  updated_at = now()
where id = (
  select id from auth.users where email = 'bzumarhajn2@gmail.com' limit 1
);

insert into public.feed_posts (author_id, author_role, title, content, is_pinned, pin_order)
select id, 'superadmin', 'Welcome to Tournament Players', 'The arena is open. Watch this feed for tournament announcements, staff updates, and live match posts.', true, 1
from public.profiles
where staff_role = 'superadmin'
on conflict do nothing;

insert into public.tournaments (name, description, game, team_capacity, start_date, registration_deadline, status, created_by, format_spec)
select
  'Nepal Open Cup',
  'A demo tournament using the built-in bracket preview and Supabase real-time match updates.',
  'Mobile Legends',
  16,
  current_date + interval '14 days',
  current_date + interval '7 days',
  'registration',
  id,
  '{"format":"single_elimination","grand_final":"BO5"}'::jsonb
from public.profiles
where staff_role = 'superadmin'
on conflict do nothing;
