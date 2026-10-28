-- Recap database schema. Run once in Supabase → SQL Editor.
-- Every table uses Row Level Security: the app talks to Postgres with the
-- signed-in user's session, so users can only ever touch their own recaps.

create extension if not exists vector;

create table if not exists public.recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled recap',
  source_type text not null check (source_type in ('upload', 'youtube')),
  source_url text,
  duration_sec real,
  mode text not null default 'overview' check (mode in ('overview', 'study', 'exam', 'meeting')),
  focus text,
  output_language text not null default 'auto',
  -- transcribing → embedding → structuring → analyzing → writing → verifying → studying → done | error
  status text not null default 'transcribing',
  error text,
  transcript jsonb,      -- { language, segments: [{ start, end, text }] }
  chapters jsonb,        -- [{ index, start, end, title, summary, windowIds }]
  key_moments jsonb,     -- [{ windowId, start, end, quote, why, score }]
  concepts jsonb,        -- [{ term, definition, start }]
  summary jsonb,         -- { tldr, sections: [{ heading, claims: [{ id, text, ... }] }] }
  verification jsonb,    -- { before, after, counts, revised }
  flashcards jsonb,      -- [{ front, back, start }]
  quiz jsonb,            -- [{ question, options, answer, explanation, start }]
  trace jsonb not null default '[]'::jsonb, -- what each agent did, how long it took, which model
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recaps_user_created_idx on public.recaps (user_id, created_at desc);

-- Transcript windows (~40 s of speech each) with their embeddings.
-- Used for chapter segmentation, key-moment selection, focus retrieval and fact checking.
create table if not exists public.recap_windows (
  recap_id uuid not null references public.recaps (id) on delete cascade,
  idx int not null,
  start_sec real not null,
  end_sec real not null,
  text text not null,
  embedding vector(768) not null,
  primary key (recap_id, idx)
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists recaps_touch on public.recaps;
create trigger recaps_touch before update on public.recaps
  for each row execute function public.touch_updated_at();

-- Explicit grants (works when "Automatically expose new tables" is off).
-- RLS policies below still decide WHICH rows each user can touch.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.recaps to authenticated;
grant select on public.recaps to anon; -- public share links for visitors without an account
grant select, insert, update, delete on public.recap_windows to authenticated;

alter table public.recaps enable row level security;
alter table public.recap_windows enable row level security;

drop policy if exists "recaps: read own or public" on public.recaps;
create policy "recaps: read own or public" on public.recaps
  for select using (auth.uid() = user_id or is_public);

drop policy if exists "recaps: insert own" on public.recaps;
create policy "recaps: insert own" on public.recaps
  for insert with check (auth.uid() = user_id);

drop policy if exists "recaps: update own" on public.recaps;
create policy "recaps: update own" on public.recaps
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "recaps: delete own" on public.recaps;
create policy "recaps: delete own" on public.recaps
  for delete using (auth.uid() = user_id);

drop policy if exists "windows: own recap" on public.recap_windows;
create policy "windows: own recap" on public.recap_windows
  for all
  using (exists (select 1 from public.recaps r where r.id = recap_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.recaps r where r.id = recap_id and r.user_id = auth.uid()));
