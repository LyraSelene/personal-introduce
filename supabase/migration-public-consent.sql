-- Upgrade an existing project after adding sender-controlled publication consent.
-- Existing messages remain private until their sender explicitly allowed publication.
begin;
alter table public.visitor_messages
  add column if not exists allow_public boolean not null default false;
update public.visitor_messages set published = false where published and not allow_public;

create or replace function private.guard_message_publication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.allow_public is distinct from old.allow_public then
    raise exception 'Sender consent cannot be changed';
  end if;
  if new.body is distinct from old.body or new.display_name is distinct from old.display_name or new.category is distinct from old.category then
    raise exception 'Sender content cannot be changed';
  end if;
  if new.published and not new.allow_public then
    raise exception 'This message is private by sender choice';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_message_publication() from public, anon, authenticated;
drop trigger if exists guard_message_publication on public.visitor_messages;
create trigger guard_message_publication before update on public.visitor_messages for each row execute function private.guard_message_publication();

create or replace function public.public_messages(page_offset integer default 0)
returns table (id uuid, display_name text, category text, body text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, display_name, category, body, reply, created_at from public.visitor_messages
  where published and allow_public and deleted_at is null
  order by created_at desc, id desc
  limit 20 offset greatest(0, least(page_offset, 10000));
$$;
revoke all on function public.public_messages(integer) from public;
grant execute on function public.public_messages(integer) to anon, authenticated;
create or replace function public.message_consent_ready() returns boolean
language sql stable set search_path = '' as $$ select true; $$;
revoke all on function public.message_consent_ready() from public;
grant execute on function public.message_consent_ready() to anon, authenticated;
notify pgrst, 'reload schema';
commit;
