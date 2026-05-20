-- ============================================================
-- 0015_user_settings.sql  (Fase 4 — user-scoped storage)
-- ============================================================
-- Settings e progresso do guia/onboarding são per-USER (não
-- per-org). Mesmo user em 2 orgs tem o mesmo nome/foto/preferências.
--
-- Estrutura: 1 row por (user_id, key). Generic kv pra evitar
-- migration por feature nova de settings.
-- ============================================================

create table if not exists public.user_kv (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,            -- 'settings', 'guia_progress', etc
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists user_kv_user_idx on public.user_kv (user_id);

comment on table public.user_kv is
  'KV store per-user. Settings (nome/foto/regimes), guia_progress, etc.';

drop trigger if exists user_kv_set_updated_at on public.user_kv;
create trigger user_kv_set_updated_at
  before update on public.user_kv
  for each row execute function public.tg_set_updated_at();

alter table public.user_kv enable row level security;

drop policy if exists user_kv_select on public.user_kv;
create policy user_kv_select on public.user_kv
  for select using (user_id = auth.uid());

drop policy if exists user_kv_insert on public.user_kv;
create policy user_kv_insert on public.user_kv
  for insert with check (user_id = auth.uid());

drop policy if exists user_kv_update on public.user_kv;
create policy user_kv_update on public.user_kv
  for update using (user_id = auth.uid())
             with check (user_id = auth.uid());

drop policy if exists user_kv_delete on public.user_kv;
create policy user_kv_delete on public.user_kv
  for delete using (user_id = auth.uid());

-- ============================================================
-- FIM 0015_user_settings.sql
-- ============================================================
