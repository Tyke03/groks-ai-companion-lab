create table if not exists public.community_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  content_rating text not null default 'SFW' check (content_rating in ('SFW', 'NSFW')),
  card_json jsonb not null,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null
);

alter table public.community_cards enable row level security;
create policy "Anyone can browse community cards" on public.community_cards for select using (true);
create policy "Authenticated users can share community cards" on public.community_cards for insert with check (auth.uid() = user_id);
create index if not exists community_cards_tags_idx on public.community_cards using gin(tags);
create index if not exists community_cards_rating_idx on public.community_cards(content_rating);
