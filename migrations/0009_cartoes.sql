-- ============================================================
-- 0009_cartoes.sql  (Fase 2 — Cartões: 3 tabelas relacionadas)
-- ============================================================
-- Cartões de crédito: list (cartões), faturas, lancamentos.
-- 3 tabelas no mesmo arquivo porque são intimamente ligadas e
-- migram juntas.
--
-- Schema híbrido (igual loans):
--   - Colunas pra filter/sort essencial
--   - jsonb 'data' pro shape completo
--   - Soft FK via *_local_id (sem FK real — sync pode chegar
--     fora de ordem entre tabelas)
-- ============================================================

-- ─── 1) cartoes ──────────────────────────────────────────────
create table if not exists public.cartoes (
  id              bigserial primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  local_id        int not null,
  nome            text,
  banco           text,
  bandeira        text,
  ultimos4        text,
  dia_fechamento  int,
  dia_vencimento  int,
  limite          numeric,
  cor             text,
  ativo           boolean not null default true,
  data            jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists cartoes_org_local_uq on public.cartoes (org_id, local_id);
create index if not exists cartoes_org_idx on public.cartoes (org_id);

drop trigger if exists cartoes_set_updated_at on public.cartoes;
create trigger cartoes_set_updated_at
  before update on public.cartoes
  for each row execute function public.tg_set_updated_at();

alter table public.cartoes enable row level security;
drop policy if exists cartoes_select on public.cartoes;
create policy cartoes_select on public.cartoes for select using (org_id = public.current_org_id());
drop policy if exists cartoes_insert on public.cartoes;
create policy cartoes_insert on public.cartoes for insert with check (org_id = public.current_org_id());
drop policy if exists cartoes_update on public.cartoes;
create policy cartoes_update on public.cartoes for update using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
drop policy if exists cartoes_delete on public.cartoes;
create policy cartoes_delete on public.cartoes for delete using (org_id = public.current_org_id());

-- ─── 2) cartao_faturas ───────────────────────────────────────
create table if not exists public.cartao_faturas (
  id                bigserial primary key,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  local_id          int not null,
  cartao_local_id   int,                              -- soft FK pro cartoes.local_id
  mes_ref           text,                              -- ex: '2026-05'
  status            text,                              -- 'aberta', 'fechada', 'paga', etc
  valor_total       numeric,
  valor_pago        numeric,
  data_vencimento   date,
  data              jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists cartao_faturas_org_local_uq on public.cartao_faturas (org_id, local_id);
create index if not exists cartao_faturas_org_cartao_idx on public.cartao_faturas (org_id, cartao_local_id, mes_ref);

drop trigger if exists cartao_faturas_set_updated_at on public.cartao_faturas;
create trigger cartao_faturas_set_updated_at
  before update on public.cartao_faturas
  for each row execute function public.tg_set_updated_at();

alter table public.cartao_faturas enable row level security;
drop policy if exists cartao_faturas_select on public.cartao_faturas;
create policy cartao_faturas_select on public.cartao_faturas for select using (org_id = public.current_org_id());
drop policy if exists cartao_faturas_insert on public.cartao_faturas;
create policy cartao_faturas_insert on public.cartao_faturas for insert with check (org_id = public.current_org_id());
drop policy if exists cartao_faturas_update on public.cartao_faturas;
create policy cartao_faturas_update on public.cartao_faturas for update using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
drop policy if exists cartao_faturas_delete on public.cartao_faturas;
create policy cartao_faturas_delete on public.cartao_faturas for delete using (org_id = public.current_org_id());

-- ─── 3) cartao_lancamentos ───────────────────────────────────
create table if not exists public.cartao_lancamentos (
  id                bigserial primary key,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  local_id          int not null,
  cartao_local_id   int,
  fatura_local_id   int,
  data_compra       date,
  valor             numeric,
  descricao         text,
  parcela           int,                               -- num. da parcela atual
  parcelas          int,                               -- total de parcelas
  data              jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists cartao_lancamentos_org_local_uq on public.cartao_lancamentos (org_id, local_id);
create index if not exists cartao_lancamentos_org_cartao_data_idx on public.cartao_lancamentos (org_id, cartao_local_id, data_compra desc);
create index if not exists cartao_lancamentos_org_fatura_idx on public.cartao_lancamentos (org_id, fatura_local_id);

drop trigger if exists cartao_lancamentos_set_updated_at on public.cartao_lancamentos;
create trigger cartao_lancamentos_set_updated_at
  before update on public.cartao_lancamentos
  for each row execute function public.tg_set_updated_at();

alter table public.cartao_lancamentos enable row level security;
drop policy if exists cartao_lancamentos_select on public.cartao_lancamentos;
create policy cartao_lancamentos_select on public.cartao_lancamentos for select using (org_id = public.current_org_id());
drop policy if exists cartao_lancamentos_insert on public.cartao_lancamentos;
create policy cartao_lancamentos_insert on public.cartao_lancamentos for insert with check (org_id = public.current_org_id());
drop policy if exists cartao_lancamentos_update on public.cartao_lancamentos;
create policy cartao_lancamentos_update on public.cartao_lancamentos for update using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
drop policy if exists cartao_lancamentos_delete on public.cartao_lancamentos;
create policy cartao_lancamentos_delete on public.cartao_lancamentos for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0009_cartoes.sql
-- ============================================================
