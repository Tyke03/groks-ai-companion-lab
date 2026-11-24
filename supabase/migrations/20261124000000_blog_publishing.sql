create table public.blog_posts (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 160),
  title text not null,
  excerpt text not null default '',
  category text not null default 'Guides',
  date date not null default current_date,
  read_time text not null,
  tags text[] not null default '{}',
  sections jsonb not null default '[]' check (jsonb_typeof(sections) = 'array'),
  markdown text,
  html text,
  meta_title text,
  meta_description text,
  image_url text,
  source text not null check (source in ('legacy', 'ai-seo-crew')),
  status text not null default 'draft' check (status in ('draft', 'published'))
);

create index blog_posts_listing_idx on public.blog_posts (date desc, slug) where status = 'published';
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from public, anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant select, insert, update, delete on public.blog_posts to service_role;
create policy "Read published blog posts" on public.blog_posts
  for select to anon, authenticated using (status = 'published');
