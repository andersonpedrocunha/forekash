-- ============================================================
-- 0014_module_blobs.sql  (Fase 3 — Tabela genérica de módulos)
-- ============================================================
-- Tabela genérica pra módulos com state complexo que não vale a
-- pena decompor em colunas/tabelas separadas. 1 row por
-- (org_id, module) com data jsonb com o blob inteiro.
--
-- Módulos previstos:
--   - estrutura        (itens, tipos, tags, valores/pagos por mês)
--   - pessoas          (people, tipos, years, salarios)
--   - receita          (years.clients matriz cliente×mês)
--   - dispo            (bancos, contas, valores mensais)
--   - impostos         (correntes + parcelamentos)
--   - cac              (config de CAC)
--   - outras_op        (operações fora dos módulos principais)
--   - diag             (snapshot de diagnóstico IA)
--   - analise          (snapshot de análise)
--   - sup_tickets      (tickets de suporte)
--   - board            (kanban global)
--   - viagens          (despesas de viagem — anexos vão pro Storage depois)
--
-- Cuidado: 1 row por módulo significa que qualquer save do
-- módulo sobrescreve o blob inteiro. Multi-device conflict
-- resolve por "last write wins". O auto-backup user_backups
-- mantém histórico de 20 snapshots como safety net.
-- ============================================================

create table if not exists public.module_blobs (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  module      text not null,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, module)
);

create index if not exists module_blobs_org_idx on public.module_blobs (org_id);

comment on table public.module_blobs is
  'Storage genérico para state complexo de módulos. 1 row por (org, module).';

drop trigger if exists module_blobs_set_updated_at on public.module_blobs;
create trigger module_blobs_set_updated_at
  before update on public.module_blobs
  for each row execute function public.tg_set_updated_at();

alter table public.module_blobs enable row level security;

drop policy if exists module_blobs_select on public.module_blobs;
create policy module_blobs_select on public.module_blobs
  for select using (org_id = public.current_org_id());

drop policy if exists module_blobs_insert on public.module_blobs;
create policy module_blobs_insert on public.module_blobs
  for insert with check (org_id = public.current_org_id());

drop policy if exists module_blobs_update on public.module_blobs;
create policy module_blobs_update on public.module_blobs
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists module_blobs_delete on public.module_blobs;
create policy module_blobs_delete on public.module_blobs
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0014_module_blobs.sql
-- ============================================================
