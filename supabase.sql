-- 내모음 온라인 저장소. Supabase 화면의 SQL Editor에 통째로 붙여넣고 Run.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists notes_user_created on public.notes (user_id, created_at desc);

-- 각자 자기 것만 보고 고칠 수 있게
alter table public.notes enable row level security;
drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
