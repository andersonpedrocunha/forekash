-- ============================================================
-- 0012_fluxo_year.sql  (Fase 3 — Fluxo de Caixa)
-- ============================================================
-- Fluxo de Caixa por ano. PK composta (org_id, year) — cada ano
-- vira uma row independente. Conflito multi-device fica reduzido
-- a "mesmo year editado em 2 devices" em vez de "qualquer
-- mudança no fluxo".
--
-- data jsonb contém todo o estado por ano:
--   {
--     inputs: {impostos, creditoAlv, outrasRec, outrasDesp},
--     saldoInicial: number,
--     saldoInicialMes: int (0..11),
--     rowModes: {receita: 'auto'|'manual', folha:..., ...},
--     manualOverrides: {<rowKey>: {<mIdx>: value}},
--     confirmed: {<rowKey>: {<mIdx>: true}}
--   }
-- ============================================================

create table if not exists public.fluxo_year (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  year        text not null,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, year)
);

create index if not exists fluxo_year_org_idx on public.fluxo_year (org_id);

comment on table public.fluxo_year is
  'Fluxo de Caixa por ano. 1 row = 1 ano. Estado todo em data jsonb.';

drop trigger if exists fluxo_year_set_updated_at on public.fluxo_year;
create trigger fluxo_year_set_updated_at
  before update on public.fluxo_year
  for each row execute function public.tg_set_updated_at();

alter table public.fluxo_year enable row level security;

drop policy if exists fluxo_year_select on public.fluxo_year;
create policy fluxo_year_select on public.fluxo_year
  for select using (org_id = public.current_org_id());

drop policy if exists fluxo_year_insert on public.fluxo_year;
create policy fluxo_year_insert on public.fluxo_year
  for insert with check (org_id = public.current_org_id());

drop policy if exists fluxo_year_update on public.fluxo_year;
create policy fluxo_year_update on public.fluxo_year
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists fluxo_year_delete on public.fluxo_year;
create policy fluxo_year_delete on public.fluxo_year
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0012_fluxo_year.sql
-- ============================================================
