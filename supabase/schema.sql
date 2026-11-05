-- IELTS course app: run this once in Supabase → SQL Editor → New query → Run.

-- Every user's data, one row per document (same paths the app uses: "weeks/w1", "words/analyse", …)
create table if not exists public.docs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  coll       text not null,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, coll, id)
);
alter table public.docs enable row level security;
drop policy if exists "own docs" on public.docs;
create policy "own docs" on public.docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Daily AI request counter (only the server can touch it)
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  n       int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create or replace function public.ai_bump(uid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into ai_usage(user_id, day, n) values (uid, current_date, 1)
  on conflict (user_id, day) do update set n = ai_usage.n + 1
  returning n into c;
  return c;
end $$;
revoke execute on function public.ai_bump(uuid) from public, anon, authenticated;
