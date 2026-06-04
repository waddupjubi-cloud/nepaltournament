-- Run this once on an existing Supabase project so browser realtime subscriptions fire.

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
