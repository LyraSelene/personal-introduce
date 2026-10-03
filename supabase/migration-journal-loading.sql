-- Compact public journal lists; no content is changed. Safe to run again.
begin;
create or replace function public.journal_summaries(
  search_query text default '', category_filter text default 'all',
  page_offset integer default 0, recent_first boolean default false
)
returns table(id uuid,title text,excerpt text,has_image boolean,category text,published boolean,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id,p.title,left(p.body,120),p.image_data is not null,p.category,p.published,p.created_at,p.updated_at
  from public.journal_posts p
  where p.published and p.deleted_at is null
    and (category_filter='all' or p.category=category_filter)
    and (coalesce(trim(search_query),'')='' or strpos(lower(p.title||E'\n'||p.body||E'\n'||
      case p.category when 'self' then '关于自己' when 'life' then '日常碎片' else '胡思乱想' end),lower(left(trim(search_query),120)))>0)
  order by (case when recent_first then p.updated_at else p.created_at end) desc,p.id desc
  limit (case when recent_first then 3 else 12 end) offset greatest(0,page_offset);
$$;
revoke all on function public.journal_summaries(text,text,integer,boolean) from public;
grant execute on function public.journal_summaries(text,text,integer,boolean) to anon,authenticated;
commit;
