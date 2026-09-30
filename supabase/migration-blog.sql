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
