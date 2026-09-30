-- Run once in Supabase SQL Editor. Safe to run again; no content is removed.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.site_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid unique not null references auth.users(id) on delete restrict
);
revoke all on private.site_owner from public, anon, authenticated;
create or replace function public.is_site_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.site_owner where user_id = auth.uid());
$$;
revoke all on function public.is_site_owner() from public;
grant execute on function public.is_site_owner() to anon, authenticated;

create table if not exists public.site_text (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  value text not null check (length(value) <= 20000),
  updated_at timestamptz not null default now()
);
create table if not exists public.journal_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 30000),
  category text not null check (category in ('self','life','thoughts')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.visitor_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  journal_id uuid references public.journal_posts(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  category text not null check (category in ('review','suggestion','question')),
  body text not null check (length(trim(body)) between 1 and 3000),
  allow_public boolean not null default false,
  published boolean not null default false,
  reply text not null default '' check (length(reply) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.visitor_messages add column if not exists allow_public boolean not null default false;
alter table public.visitor_messages add column if not exists journal_id uuid references public.journal_posts(id) on delete set null;
update public.visitor_messages set published = false where published and not allow_public;
create index if not exists journal_date_idx on public.journal_posts (created_at desc, id desc);
create index if not exists messages_author_date_idx on public.visitor_messages (author_id, created_at desc);
create index if not exists messages_date_idx on public.visitor_messages (created_at desc, id desc);
create index if not exists messages_journal_idx on public.visitor_messages (journal_id, created_at desc, id desc);

create or replace function private.touch_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if tg_table_name <> 'site_text' then
    new.created_at := old.created_at;
    new.id := old.id;
  end if;
  if tg_table_name = 'visitor_messages' then new.author_id := old.author_id; end if;
  return new;
end;
$$;
create or replace function private.guard_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.visitor_messages where author_id = auth.uid() and created_at > clock_timestamp() - interval '1 minute') then
    raise exception 'Please wait one minute before sending again';
  end if;
  if (select count(*) from public.visitor_messages where author_id = auth.uid() and created_at > clock_timestamp() - interval '24 hours') >= 20 then
    raise exception 'Daily message limit reached';
  end if;
  new.author_id := auth.uid();
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  new.published := false;
  new.reply := '';
  new.deleted_at := null;
  return new;
end;
$$;
-- Publication is a two-party decision: the sender must have granted permission.
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
revoke all on function private.touch_record(), private.guard_message(), private.guard_message_publication() from public, anon, authenticated;
drop trigger if exists touch_site_text on public.site_text;
create trigger touch_site_text before update on public.site_text for each row execute function private.touch_record();
drop trigger if exists touch_journal on public.journal_posts;
create trigger touch_journal before update on public.journal_posts for each row execute function private.touch_record();
drop trigger if exists touch_message on public.visitor_messages;
create trigger touch_message before update on public.visitor_messages for each row execute function private.touch_record();
drop trigger if exists guard_message on public.visitor_messages;
create trigger guard_message before insert on public.visitor_messages for each row execute function private.guard_message();
drop trigger if exists guard_message_publication on public.visitor_messages;
create trigger guard_message_publication before update on public.visitor_messages for each row execute function private.guard_message_publication();

alter table public.site_text enable row level security;
alter table public.journal_posts enable row level security;
alter table public.visitor_messages enable row level security;
revoke all on public.site_text, public.journal_posts, public.visitor_messages from public, anon, authenticated;
grant select on public.site_text, public.journal_posts to anon, authenticated;
grant insert, update, delete on public.site_text to authenticated;
grant insert, update on public.journal_posts to authenticated;
grant select, insert, update on public.visitor_messages to authenticated;

drop policy if exists text_read on public.site_text;
create policy text_read on public.site_text for select to anon, authenticated using (true);
drop policy if exists text_owner on public.site_text;
create policy text_owner on public.site_text for all to authenticated using (public.is_site_owner()) with check (public.is_site_owner());
drop policy if exists journal_read on public.journal_posts;
create policy journal_read on public.journal_posts for select to anon, authenticated using ((published and deleted_at is null) or public.is_site_owner());
drop policy if exists journal_insert on public.journal_posts;
create policy journal_insert on public.journal_posts for insert to authenticated with check (public.is_site_owner());
drop policy if exists journal_update on public.journal_posts;
create policy journal_update on public.journal_posts for update to authenticated using (public.is_site_owner()) with check (public.is_site_owner());
drop policy if exists message_read on public.visitor_messages;
create policy message_read on public.visitor_messages for select to authenticated using (public.is_site_owner() or (author_id = auth.uid() and deleted_at is null));
drop policy if exists message_insert on public.visitor_messages;
create policy message_insert on public.visitor_messages for insert to authenticated with check (author_id = auth.uid() and not published and reply = '' and deleted_at is null);
drop policy if exists message_update on public.visitor_messages;
create policy message_update on public.visitor_messages for update to authenticated using (public.is_site_owner()) with check (public.is_site_owner());

-- Public messages deliberately omit author_id and email. Private rows are never returned.
create or replace function public.public_messages(page_offset integer default 0)
returns table (id uuid, display_name text, category text, body text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, display_name, category, body, reply, created_at from public.visitor_messages
  where published and allow_public and deleted_at is null order by created_at desc, id desc
  limit 20 offset greatest(0, least(page_offset, 10000));
$$;
revoke all on function public.public_messages(integer) from public;
grant execute on function public.public_messages(integer) to anon, authenticated;
create or replace function public.message_consent_ready() returns boolean
language sql stable set search_path = '' as $$ select true; $$;
revoke all on function public.message_consent_ready() from public;
grant execute on function public.message_consent_ready() to anon, authenticated;
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
alter table public.journal_posts add column if not exists image_data text;
alter table public.visitor_messages add column if not exists image_data text;
alter table public.journal_posts drop constraint if exists journal_image_data_check;
alter table public.visitor_messages drop constraint if exists message_image_data_check;
alter table public.journal_posts add constraint journal_image_data_check check (
  image_data is null or (length(image_data) <= 700000 and image_data ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
);
alter table public.visitor_messages add constraint message_image_data_check check (
  image_data is null or (length(image_data) <= 700000 and image_data ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
);

create or replace function private.guard_message_publication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.withdrawn_at is not null then raise exception 'Withdrawn messages cannot be changed'; end if;
  if new.withdrawn_at is not null then
    if auth.uid() is distinct from old.author_id then raise exception 'Only the sender may withdraw'; end if;
    if new.body <> '（来信已撤回）' or new.reply <> '' or new.image_data is not null or new.published
      or new.display_name is distinct from old.display_name or new.category is distinct from old.category
      or new.allow_public is distinct from old.allow_public or new.read_at is distinct from old.read_at
      or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Invalid withdrawal';
    end if;
    new.withdrawn_at := clock_timestamp();
    return new;
  end if;
  if new.allow_public is distinct from old.allow_public then raise exception 'Sender consent cannot be changed'; end if;
  if new.body is distinct from old.body or new.display_name is distinct from old.display_name or new.category is distinct from old.category
    or new.image_data is distinct from old.image_data then
    raise exception 'Sender content cannot be changed';
  end if;
  if new.published and not new.allow_public then raise exception 'This message is private by sender choice'; end if;
  if new.reply <> '' and new.reply is distinct from old.reply then new.read_at := coalesce(old.read_at, clock_timestamp()); end if;
  return new;
end;
$$;

create or replace function public.public_messages_images(page_offset integer default 0)
returns table (id uuid, display_name text, category text, body text, image_data text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, display_name, category, body, image_data, reply, created_at from public.visitor_messages
  where published and allow_public and deleted_at is null and withdrawn_at is null and journal_id is null
  order by created_at desc, id desc limit 20 offset greatest(0, least(page_offset, 10000));
$$;
revoke all on function public.public_messages_images(integer) from public;
grant execute on function public.public_messages_images(integer) to anon, authenticated;

create or replace function public.public_journal_messages_images(target_journal_id uuid, page_offset integer default 0)
returns table (id uuid, display_name text, category text, body text, image_data text, reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.category, m.body, m.image_data, m.reply, m.created_at from public.visitor_messages m
  join public.journal_posts p on p.id = m.journal_id and p.published and p.deleted_at is null
  where m.journal_id = target_journal_id and m.published and m.allow_public and m.deleted_at is null and m.withdrawn_at is null
  order by m.created_at desc, m.id desc limit 20 offset greatest(0, least(page_offset, 10000));
$$;
revoke all on function public.public_journal_messages_images(uuid, integer) from public;
grant execute on function public.public_journal_messages_images(uuid, integer) to anon, authenticated;

create or replace function public.withdraw_message(target_message_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare target public.visitor_messages;
begin
  select * into target from public.visitor_messages where id = target_message_id and author_id = auth.uid() for update;
  if not found then raise exception 'This letter is not yours or is unavailable'; end if;
  if target.withdrawn_at is not null then return true; end if;
  update public.visitor_messages set withdrawn_at = clock_timestamp(), body = '（来信已撤回）', image_data = null, reply = '', published = false
    where id = target.id;
  return true;
end;
$$;
revoke all on function public.withdraw_message(uuid) from public, anon;
grant execute on function public.withdraw_message(uuid) to authenticated;
create or replace function public.search_journals_images(search_query text default '', category_filter text default 'all', page_offset integer default 0)
returns table (id uuid, title text, body text, image_data text, category text, published boolean, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.title, p.body, p.image_data, p.category, p.published, p.created_at, p.updated_at from public.journal_posts p
  where p.published and p.deleted_at is null and (category_filter = 'all' or p.category = category_filter)
    and (coalesce(trim(search_query), '') = '' or strpos(lower(p.title || E'\n' || p.body || E'\n' ||
      case p.category when 'self' then '关于自己' when 'life' then '日常碎片' else '胡思乱想' end), lower(left(trim(search_query), 120))) > 0)
  order by p.created_at desc, p.id desc limit 12 offset greatest(0, page_offset);
$$;
revoke all on function public.search_journals_images(text, text, integer) from public;
grant execute on function public.search_journals_images(text, text, integer) to anon, authenticated;
create or replace function public.images_ready() returns boolean language sql stable set search_path = '' as $$ select true; $$;
revoke all on function public.images_ready() from public;
grant execute on function public.images_ready() to anon, authenticated;
commit;

-- Blog posts for the site owner. Repeatable; does not modify journal or letter content.
begin;
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  excerpt text not null default '' check (length(excerpt) <= 500),
  body text not null check (length(trim(body)) between 1 and 50000),
  category text not null default 'tech' check (category in ('tech','ai','notes')),
  tags text not null default '' check (length(tags) <= 300),
  image_data text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.blog_posts add column if not exists excerpt text not null default '';
alter table public.blog_posts add column if not exists tags text not null default '';
alter table public.blog_posts add column if not exists image_data text;
alter table public.blog_posts add column if not exists deleted_at timestamptz;
alter table public.blog_posts drop constraint if exists blog_image_data_check;
alter table public.blog_posts add constraint blog_image_data_check check (
  image_data is null or (length(image_data) <= 700000 and image_data ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
);
create index if not exists blog_posts_date_idx on public.blog_posts (created_at desc, id desc);
create index if not exists blog_posts_public_idx on public.blog_posts (published, deleted_at, updated_at desc);
drop trigger if exists touch_blog on public.blog_posts;
create trigger touch_blog before update on public.blog_posts for each row execute function private.touch_record();
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from public, anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant insert, update on public.blog_posts to authenticated;
drop policy if exists blog_read on public.blog_posts;
create policy blog_read on public.blog_posts for select to anon, authenticated using ((published and deleted_at is null) or public.is_site_owner());
drop policy if exists blog_insert on public.blog_posts;
create policy blog_insert on public.blog_posts for insert to authenticated with check (public.is_site_owner());
drop policy if exists blog_update on public.blog_posts;
create policy blog_update on public.blog_posts for update to authenticated using (public.is_site_owner()) with check (public.is_site_owner());
create or replace function public.public_blog_posts(search_query text default '', category_filter text default 'all', page_offset integer default 0)
returns table (id uuid,title text,excerpt text,body text,category text,tags text,image_data text,published boolean,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select p.id,p.title,p.excerpt,p.body,p.category,p.tags,p.image_data,p.published,p.created_at,p.updated_at
 from public.blog_posts p
 where p.published and p.deleted_at is null
   and (category_filter = 'all' or p.category = category_filter)
   and (trim(search_query) = '' or strpos(lower(p.title||' '||p.excerpt||' '||p.body||' '||p.tags),lower(trim(search_query))) > 0)
 order by p.updated_at desc,p.id desc limit 12 offset greatest(0,least(page_offset,10000));
$$;
revoke all on function public.public_blog_posts(text,text,integer) from public;
grant execute on function public.public_blog_posts(text,text,integer) to anon,authenticated;
create or replace function public.blog_ready() returns boolean language sql stable set search_path = '' as $$ select to_regclass('public.blog_posts') is not null; $$;
revoke all on function public.blog_ready() from public;
grant execute on function public.blog_ready() to anon,authenticated;
commit;
