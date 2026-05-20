-- ============================================================
-- 0010_extrato_lancamentos.sql  (Fase 2 — Extrato)
-- ============================================================
-- Lançamentos do extrato bancário. Maior volume de dados — uma
-- empresa pode ter milhares de lançamentos por ano.
--
-- Schema:
--   - Colunas pra filter/sort/agregação (data, valor, conta, tipo)
--   - jsonb metadata pra campos extras
--   - Soft FK pra centros_custo.local_id (sem constraint real)
--
-- Indexes pesados pq queries comuns são:
--   - "lançamentos do mês X" (org_id + data range)
--   - "lançamentos da conta Y" (org_id + conta)
--   - "receitas vs gastos" (org_id + tipo)
-- ============================================================

create table if not exists public.extrato_lancamentos (
  id                bigserial primary key,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  local_id          int not null,
  data              date,
  valor             numeric,
  descricao         text,
  categoria         text,
  contraparte       text,
  conta             text,
  status            text,                              -- 'pago', 'pendente', etc
  tipo              text,                              -- 'gasto', 'receita'
  centro_custo_id   int,                               -- soft FK pra centros_custo.local_id
  numero_documento  text,
  data_pagamento    date,
  notas             text,
  importado_de      text,
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists extrato_lancamentos_org_local_uq
  on public.extrato_lancamentos (org_id, local_id);

-- Index principal: filter/sort por data dentro da org
create index if not exists extrato_lancamentos_org_data_idx
  on public.extrato_lancamentos (org_id, data desc);

-- Index pra filter por conta
create index if not exists extrato_lancamentos_org_conta_data_idx
  on public.extrato_lancamentos (org_id, conta, data desc);

-- Index pra agregação por tipo (receita vs gasto)
create index if not exists extrato_lancamentos_org_tipo_idx
  on public.extrato_lancamentos (org_id, tipo);

-- Index pra busca por centro de custo
create index if not exists extrato_lancamentos_org_cc_idx
  on public.extrato_lancamentos (org_id, centro_custo_id);

comment on table public.extrato_lancamentos is
  'Lançamentos do extrato. Alto volume — indexes pesados em (org_id, data) e variantes.';

drop trigger if exists extrato_lancamentos_set_updated_at on public.extrato_lancamentos;
create trigger extrato_lancamentos_set_updated_at
  before update on public.extrato_lancamentos
  for each row execute function public.tg_set_updated_at();

alter table public.extrato_lancamentos enable row level security;

drop policy if exists extrato_lancamentos_select on public.extrato_lancamentos;
create policy extrato_lancamentos_select on public.extrato_lancamentos
  for select using (org_id = public.current_org_id());

drop policy if exists extrato_lancamentos_insert on public.extrato_lancamentos;
create policy extrato_lancamentos_insert on public.extrato_lancamentos
  for insert with check (org_id = public.current_org_id());

drop policy if exists extrato_lancamentos_update on public.extrato_lancamentos;
create policy extrato_lancamentos_update on public.extrato_lancamentos
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists extrato_lancamentos_delete on public.extrato_lancamentos;
create policy extrato_lancamentos_delete on public.extrato_lancamentos
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0010_extrato_lancamentos.sql
-- ============================================================
