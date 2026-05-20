-- ============================================================
-- 0004_user_backups_history.sql
-- ============================================================
-- Substitui o user_backups (single-row UPSERT) por versão com
-- HISTÓRICO. Cada backup vira uma row nova; trigger mantém só
-- os últimos N (=20) por user. Assim, se você sobrescrever o
-- estado errado, dá pra voltar pra um ponto anterior.
--
-- O backup do dia anterior é o "freio" pra erros acidentais
-- (limpar tudo no app, bug, etc) — mesmo que o auto-backup
-- sobrescreva o snapshot atual em segundos, ainda existem
-- 19 versões anteriores na nuvem.
-- ============================================================

-- ─── Recria a tabela com schema versionado ──────────────────
drop trigger if exists user_backups_set_updated_at on public.user_backups;
drop table if exists public.user_backups;

create table public.user_backups (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  size_bytes  int not null,
  data        jsonb not null
);

create index user_backups_user_created_idx
  on public.user_backups (user_id, created_at desc);

comment on table public.user_backups is
  'Snapshots versionados do localStorage. Trigger mantém últimos 20 por user.';

-- ─── Trigger: depois de cada INSERT, deleta o que excede 20 ─
create or replace function public.tg_user_backups_prune()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  keep_n constant int := 20;
begin
  delete from public.user_backups
  where user_id = new.user_id
    and id not in (
      select id from public.user_backups
      where user_id = new.user_id
      order by created_at desc
      limit keep_n
    );
  return null;
end;
$$;

drop trigger if exists user_backups_prune on public.user_backups;
create trigger user_backups_prune
  after insert on public.user_backups
  for each row execute function public.tg_user_backups_prune();

-- ─── RLS: user vê/insere/deleta só os próprios backups ──────
alter table public.user_backups enable row level security;

drop policy if exists user_backups_select_own on public.user_backups;
create policy user_backups_select_own on public.user_backups
  for select using (user_id = auth.uid());

drop policy if exists user_backups_insert_own on public.user_backups;
create policy user_backups_insert_own on public.user_backups
  for insert with check (user_id = auth.uid());

drop policy if exists user_backups_delete_own on public.user_backups;
create policy user_backups_delete_own on public.user_backups
  for delete using (user_id = auth.uid());

-- Nota: NÃO criamos policy de UPDATE — backups são imutáveis
-- (insere novo em vez de editar antigo). Isso é parte da
-- proteção: nem o próprio user consegue corromper histórico.

-- ============================================================
-- FIM 0004_user_backups_history.sql
-- ============================================================
