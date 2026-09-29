-- Run after migration-journal-comments.sql. Repeatable; existing letters are preserved.
begin;
alter table public.visitor_messages add column if not exists withdrawn_at timestamptz;
alter table public.visitor_messages add column if not exists read_at timestamptz;
create index if not exists messages_unread_idx on public.visitor_messages(created_at desc)
  where read_at is null and withdrawn_at is null and deleted_at is null;

create or replace function private.guard_message_publication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.withdrawn_at is not null then raise exception 'Withdrawn messages cannot be changed'; end if;
  if new.withdrawn_at is not null then
    if auth.uid() is distinct from old.author_id then raise exception 'Only the sender may withdraw'; end if;
    if new.body <> '（来信已撤回）' or new.reply <> '' or new.published
      or new.display_name is distinct from old.display_name or new.category is distinct from old.category
      or new.allow_public is distinct from old.allow_public or new.read_at is distinct from old.read_at
      or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Invalid withdrawal';
    end if;
    new.withdrawn_at := clock_timestamp();
    return new;
  end if;
  if new.allow_public is distinct from old.allow_public then raise exception 'Sender consent cannot be changed'; end if;
  if new.body is distinct from old.body or new.display_name is distinct from old.display_name or new.category is distinct from old.category then
    raise exception 'Sender content cannot be changed';
  end if;
  if new.published and not new.allow_public then raise exception 'This message is private by sender choice'; end if;
  if new.reply <> '' and new.reply is distinct from old.reply then new.read_at := coalesce(old.read_at, clock_timestamp()); end if;
  return new;
end;
$$;
create or replace function private.reset_message_status() returns trigger
language plpgsql set search_path = '' as $$
begin new.withdrawn_at := null; new.read_at := null; return new; end;
$$;
revoke all on function private.reset_message_status() from public, anon, authenticated;
drop trigger if exists reset_message_status on public.visitor_messages;
create trigger reset_message_status before insert on public.visitor_messages for each row execute function private.reset_message_status();

-- Senders can see their own receipt even if the owner archived it, but still have no UPDATE grant through RLS.
drop policy if exists message_read on public.visitor_messages;
create policy message_read on public.visitor_messages for select to authenticated
  using (public.is_site_owner() or author_id = auth.uid());
create or replace function public.withdraw_message(target_message_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare target public.visitor_messages;
begin
  select * into target from public.visitor_messages where id = target_message_id and author_id = auth.uid() for update;
  if not found then raise exception 'This letter is not yours or is unavailable'; end if;
  if target.withdrawn_at is not null then return true; end if;
  update public.visitor_messages set withdrawn_at = clock_timestamp(), body = '（来信已撤回）', reply = '', published = false
    where id = target.id;
  return true;
end;
$$;
revoke all on function public.withdraw_message(uuid) from public, anon;
grant execute on function public.withdraw_message(uuid) to authenticated;
create or replace function public.unread_message_count() returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_site_owner() then raise exception 'Owner access required'; end if;
  return (select count(*) from public.visitor_messages where read_at is null and withdrawn_at is null and deleted_at is null);
end;
$$;
revoke all on function public.unread_message_count() from public, anon;
grant execute on function public.unread_message_count() to authenticated;

create or replace function public.public_messages(page_offset integer default 0)
returns table (id uuid, display_name text, category text, body text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, display_name, category, body, reply, created_at from public.visitor_messages
  where published and allow_public and deleted_at is null and withdrawn_at is null and journal_id is null
  order by created_at desc, id desc limit 20 offset greatest(0, least(page_offset, 10000));
$$;
create or replace function public.public_journal_messages(target_journal_id uuid, page_offset integer default 0)
returns table (id uuid, display_name text, category text, body text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.category, m.body, m.reply, m.created_at from public.visitor_messages m
  join public.journal_posts p on p.id = m.journal_id and p.published and p.deleted_at is null
  where m.journal_id = target_journal_id and m.published and m.allow_public and m.deleted_at is null and m.withdrawn_at is null
  order by m.created_at desc, m.id desc limit 20 offset greatest(0, least(page_offset, 10000));
$$;
create or replace function public.journal_discussion_counts(journal_ids uuid[])
returns table (journal_id uuid, total bigint, replied bigint)
language sql stable security definer set search_path = '' as $$
  select m.journal_id, count(*), count(*) filter (where m.reply <> '') from public.visitor_messages m
  join public.journal_posts p on p.id = m.journal_id and p.published and p.deleted_at is null
  where m.journal_id = any(journal_ids[1:100]) and m.published and m.allow_public and m.deleted_at is null and m.withdrawn_at is null
  group by m.journal_id;
$$;
revoke all on function public.journal_discussion_counts(uuid[]) from public;
grant execute on function public.journal_discussion_counts(uuid[]) to anon, authenticated;

create or replace function public.search_journals(search_query text default '', category_filter text default 'all', page_offset integer default 0)
returns table (id uuid, title text, body text, category text, published boolean, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.title, p.body, p.category, p.published, p.created_at, p.updated_at from public.journal_posts p
  where p.published and p.deleted_at is null and (category_filter = 'all' or p.category = category_filter)
    and (coalesce(trim(search_query), '') = '' or strpos(lower(p.title || E'\n' || p.body || E'\n' ||
      case p.category when 'self' then '关于自己' when 'life' then '日常碎片' else '胡思乱想' end), lower(left(trim(search_query), 120))) > 0)
  order by p.created_at desc, p.id desc limit 12 offset greatest(0, page_offset);
$$;
revoke all on function public.search_journals(text, text, integer) from public;
grant execute on function public.search_journals(text, text, integer) to anon, authenticated;
create or replace function public.community_ready() returns boolean language sql stable set search_path = '' as $$ select true; $$;
revoke all on function public.community_ready() from public;
grant execute on function public.community_ready() to anon, authenticated;
commit;
