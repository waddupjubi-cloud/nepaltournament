-- Run this on existing projects to allow founder and leader player role tags.

alter table public.profiles
  drop constraint if exists profiles_player_roles_check;

alter table public.profiles
  add constraint profiles_player_roles_check
  check (player_roles <@ array['exp','jg','gd','md','rm','coach','sb1','sb2','multirole','founder','leader']);

update public.profiles
set player_roles = array['exp','jg','gd','md','rm','coach','sb1','sb2','multirole','founder','leader']
where role = 'superadmin';
