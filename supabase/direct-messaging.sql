-- Run this on existing projects to enable user-to-user direct messaging.

create or replace function public.ensure_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  created_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to start a chat.';
  end if;

  if other_user_id is null or other_user_id = auth.uid() then
    raise exception 'Choose another user to chat with.';
  end if;

  select c.conversation_id
  into existing_id
  from public.conversations c
  join public.conversation_participants mine on mine.conversation_id = c.conversation_id and mine.user_id = auth.uid()
  join public.conversation_participants other on other.conversation_id = c.conversation_id and other.user_id = other_user_id
  where c.type = 'direct'
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations(type)
  values ('direct')
  returning conversation_id into created_id;

  insert into public.conversation_participants(conversation_id, user_id)
  values
    (created_id, auth.uid()),
    (created_id, other_user_id)
  on conflict do nothing;

  return created_id;
end;
$$;

grant execute on function public.ensure_direct_conversation(uuid) to authenticated;

create or replace function public.is_conversation_participant(target_conversation uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = target_conversation
      and cp.user_id = target_user
  );
$$;

grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

drop policy if exists "participants read" on public.conversation_participants;
create policy "participants read" on public.conversation_participants for select using (
  user_id = auth.uid()
  or public.is_conversation_participant(conversation_id, auth.uid())
  or public.is_staff(array['superadmin','useradmin','usermod'])
);
