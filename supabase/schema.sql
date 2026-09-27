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
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  category text not null check (category in ('review','suggestion','question')),
  body text not null check (length(trim(body)) between 1 and 3000),
  published boolean not null default false,
  reply text not null default '' check (length(reply) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists journal_date_idx on public.journal_posts (created_at desc, id desc);
create index if not exists messages_author_date_idx on public.visitor_messages (author_id, created_at desc);
create index if not exists messages_date_idx on public.visitor_messages (created_at desc, id desc);

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
revoke all on function private.touch_record(), private.guard_message() from public, anon, authenticated;
drop trigger if exists touch_site_text on public.site_text;
create trigger touch_site_text before update on public.site_text for each row execute function private.touch_record();
drop trigger if exists touch_journal on public.journal_posts;
create trigger touch_journal before update on public.journal_posts for each row execute function private.touch_record();
drop trigger if exists touch_message on public.visitor_messages;
create trigger touch_message before update on public.visitor_messages for each row execute function private.touch_record();
drop trigger if exists guard_message on public.visitor_messages;
create trigger guard_message before insert on public.visitor_messages for each row execute function private.guard_message();

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
  where published and deleted_at is null order by created_at desc, id desc
  limit 20 offset greatest(0, least(page_offset, 10000));
$$;
revoke all on function public.public_messages(integer) from public;
grant execute on function public.public_messages(integer) to anon, authenticated;
commit;
