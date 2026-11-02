-- GFC Floor Quote: online database (Supabase / Postgres)
-- The app may only INSERT (anon key). Only Luis (dashboard / service role) can read.
-- company_id is here so the app can serve other contractors later (phase "license").

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id text not null default 'gfc',
  name text, email text not null, phone text, zip text,
  mail_ok boolean not null default false,   -- promo email opt-in (unchecked by default)
  text_ok boolean not null default false,   -- promo SMS opt-in (TCPA, separate box)
  consent_at date,
  source text default 'app',
  interests text,                           -- summary of what they browsed
  activity jsonb                            -- first-party browsing log (disclosed at collection)
);

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id text not null default 'gfc',
  status text not null default 'new',       -- new / contacted / approved / work_order / done / lost
  name text, email text, phone text, zip text, city text, best_time text,
  quote_total numeric, rooms jsonb, extras jsonb,
  summary text,                             -- the same text the office work-order page parses
  interests text,
  video_paths text[] default '{}'
);

create table if not exists public.sample_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id text not null default 'gfc',
  status text not null default 'new',       -- new / paid / mailed
  name text, phone text, address text, samples jsonb, summary text
);

alter table public.contacts enable row level security;
alter table public.quote_requests enable row level security;
alter table public.sample_requests enable row level security;

drop policy if exists app_insert on public.contacts;
drop policy if exists app_insert on public.quote_requests;
drop policy if exists app_insert on public.sample_requests;
create policy app_insert on public.contacts for insert to anon with check (true);
create policy app_insert on public.quote_requests for insert to anon with check (true);
create policy app_insert on public.sample_requests for insert to anon with check (true);

-- Private bucket for walkthrough videos; app can upload, nobody public can read.
insert into storage.buckets (id, name, public, file_size_limit)
values ('walkthroughs', 'walkthroughs', false, 524288000)
on conflict (id) do nothing;
drop policy if exists app_upload on storage.objects;
create policy app_upload on storage.objects for insert to anon with check (bucket_id = 'walkthroughs');
