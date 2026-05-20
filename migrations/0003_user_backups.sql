-- ============================================================
-- 0003_user_backups.sql
-- ============================================================
-- Stopgap pra não perder dados enquanto as Fases 2-4 (migração
-- de schema real) não estão completas. Cada usuário tem 1 row
-- com um snapshot completo do localStorage como jsonb.
--
-- App-side: backup é disparado em mudanças (debounced 5s),
-- periodicamente (a cada 30min) e ao fechar a aba.
--
-- Limites: free tier do Supabase = 500 MB DB. Cada user tem
-- ~5 MB max → ~100 users ativos antes de precisar do tier Pro.
-- Quando as Fases 2-4 entregarem, essa tabela pode ser
-- DEPRECATED (mantida só pra rollback se algo der errado).
-- ============================================================

create table if not exists public.user_backups (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  updated_at  timestamptz not null default now(),
  size_bytes  int not null default 0,
  data        jsonb not null
);

comment on table public.user_backups is
  'Snapshot do localStorage do user. 1 row por user, sobrescrito a cada backup.';

-- ─── Trigger pra atualizar updated_at em UPDATE ─────────────
drop trigger if exists user_backups_set_updated_at on public.user_backups;
create trigger user_backups_set_updated_at
  before update on public.user_backups
  for each row execute function public.tg_set_updated_at();

-- ─── RLS: cada user vê / mexe só no próprio backup ──────────
alter table public.user_backups enable row level security;

drop policy if exists user_backups_select_own on public.user_backups;
create policy user_backups_select_own on public.user_backups
  for select using (user_id = auth.uid());

drop policy if exists user_backups_insert_own on public.user_backups;
create policy user_backups_insert_own on public.user_backups
  for insert with check (user_id = auth.uid());

drop policy if exists user_backups_update_own on public.user_backups;
create policy user_backups_update_own on public.user_backups
  for update using (user_id = auth.uid())
              with check (user_id = auth.uid());

drop policy if exists user_backups_delete_own on public.user_backups;
create policy user_backups_delete_own on public.user_backups
  for delete using (user_id = auth.uid());

-- ============================================================
-- FIM 0003_user_backups.sql
-- ============================================================
