-- Add article-linked public discussion to an existing project.
-- Sender consent remains required; private comments never leave the database.
begin;
alter table public.visitor_messages
  add column if not exists journal_id uuid references public.journal_posts(id) on delete set null;
create index if not exists messages_journal_idx on public.visitor_messages (journal_id, created_at desc, id desc);
create or replace function private.guard_journal_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.journal_id is distinct from old.journal_id then raise exception 'Message article cannot be changed'; end if;
  elsif new.journal_id is not null then
    if not exists (select 1 from public.journal_posts where id = new.journal_id and published and deleted_at is null) then
      raise exception 'This journal is not available for replies';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_journal_link() from public, anon, authenticated;
drop trigger if exists guard_journal_link on public.visitor_messages;
create trigger guard_journal_link before insert or update on public.visitor_messages for each row execute function private.guard_journal_link();

-- The general wall contains unlinked letters; article discussion stays with its article.
create or replace function public.public_messages(page_offset integer default 0)
returns table (id uuid, display_name text, category text, body text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, display_name, category, body, reply, created_at from public.visitor_messages
  where published and allow_public and deleted_at is null and journal_id is null
  order by created_at desc, id desc limit 20 offset greatest(0, least(page_offset, 10000));
$$;
revoke all on function public.public_messages(integer) from public;
grant execute on function public.public_messages(integer) to anon, authenticated;
create or replace function public.public_journal_messages(target_journal_id uuid, page_offset integer default 0)
returns table (id uuid, display_name text, category text, body text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.category, m.body, m.reply, m.created_at
  from public.visitor_messages m
  join public.journal_posts p on p.id = m.journal_id and p.published and p.deleted_at is null
  where m.journal_id = target_journal_id and m.published and m.allow_public and m.deleted_at is null
  order by m.created_at desc, m.id desc limit 20 offset greatest(0, least(page_offset, 10000));
$$;
revoke all on function public.public_journal_messages(uuid, integer) from public;
grant execute on function public.public_journal_messages(uuid, integer) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
