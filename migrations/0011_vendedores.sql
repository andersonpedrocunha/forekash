-- ============================================================
-- 0011_vendedores.sql  (Fase 2 — Vendedores — ÚLTIMO módulo)
-- ============================================================
-- Vendedores com regras de comissão por período + ajustes manuais.
--
-- Decisão de schema: 1 tabela com regras e ajustes como jsonb
-- arrays. Não vale separar em 3 tabelas (vendedores +
-- vendedor_regras + vendedor_ajustes) porque:
--   1. Eles SEMPRE são carregados junto com o vendedor
--   2. Não há queries cross-vendedor por regra/ajuste isolado
--   3. Regras têm sub-arrays (faixas, clientes) que já são jsonb
-- ============================================================

create table if not exists public.vendedores (
  id          bigserial primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  local_id    int not null,
  nome        text,
  regras      jsonb not null default '[]',  -- [{de, ate, modo, faixas:[], clientes:[]}]
  ajustes     jsonb not null default '[]',  -- [{ym, valor, nota, regraId}]
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists vendedores_org_local_uq
  on public.vendedores (org_id, local_id);

create index if not exists vendedores_org_idx
  on public.vendedores (org_id);

comment on table public.vendedores is
  'Vendedores. regras e ajustes ficam como jsonb (sempre carregados junto).';

drop trigger if exists vendedores_set_updated_at on public.vendedores;
create trigger vendedores_set_updated_at
  before update on public.vendedores
  for each row execute function public.tg_set_updated_at();

alter table public.vendedores enable row level security;

drop policy if exists vendedores_select on public.vendedores;
create policy vendedores_select on public.vendedores
  for select using (org_id = public.current_org_id());

drop policy if exists vendedores_insert on public.vendedores;
create policy vendedores_insert on public.vendedores
  for insert with check (org_id = public.current_org_id());

drop policy if exists vendedores_update on public.vendedores;
create policy vendedores_update on public.vendedores
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists vendedores_delete on public.vendedores;
create policy vendedores_delete on public.vendedores
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0011_vendedores.sql
-- ============================================================
