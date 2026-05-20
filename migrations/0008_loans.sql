-- ============================================================
-- 0008_loans.sql  (Fase 2 — Empréstimos parte 2)
-- ============================================================
-- Empréstimos. Schema híbrido: campos essenciais como colunas
-- (filter/sort/dashboard), shape completo em jsonb 'data'.
--
-- Por que jsonb pro corpo? Cada loan tem ~14 campos + 3 arrays
-- aninhados (parcelaHist, saldoHist, contratos, registros) que
-- mudam frequentemente. Schema híbrido evita migration toda
-- vez que adiciona campo derivado.
--
-- Sem FK pra loan_modalidades porque modalidade_id pode ser
-- 'price' ou 'sac' (builtins que não existem no cloud).
-- ============================================================

create table if not exists public.loans (
  id              bigserial primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  local_id        int not null,
  banco           text,
  banco_manual    text,
  descricao       text,
  valor           numeric,
  taxa            numeric,                 -- taxa mensal (%)
  inicio          date,
  termino         date,
  parcelas        int,
  parcelas_pagas  int,
  modalidade_id   text,                    -- 'price', 'sac', ou custom (sem FK)
  data            jsonb not null default '{}',  -- shape completo (parcelaHist, saldoHist, contratos, etc)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists loans_org_local_uq
  on public.loans (org_id, local_id);

create index if not exists loans_org_inicio_idx
  on public.loans (org_id, inicio desc);

create index if not exists loans_org_banco_idx
  on public.loans (org_id, banco);

comment on table public.loans is
  'Empréstimos. Schema híbrido: colunas essenciais + jsonb data com shape completo.';

drop trigger if exists loans_set_updated_at on public.loans;
create trigger loans_set_updated_at
  before update on public.loans
  for each row execute function public.tg_set_updated_at();

alter table public.loans enable row level security;

drop policy if exists loans_select on public.loans;
create policy loans_select on public.loans
  for select using (org_id = public.current_org_id());

drop policy if exists loans_insert on public.loans;
create policy loans_insert on public.loans
  for insert with check (org_id = public.current_org_id());

drop policy if exists loans_update on public.loans;
create policy loans_update on public.loans
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists loans_delete on public.loans;
create policy loans_delete on public.loans
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0008_loans.sql
-- ============================================================
