-- ============================================================
-- 0007_loan_modalidades.sql  (Fase 2 — Empréstimos parte 1)
-- ============================================================
-- Modalidades de empréstimo (Price, SAC, customizadas).
--
-- Observação: builtins (price, sac) NÃO vão pra cloud — o app
-- sempre re-adiciona elas em memória (linha 17171 do index.html).
-- Cloud guarda só as customizadas que o user criou.
--
-- local_id é text pq IDs podem ser 'price', 'sac' ou string
-- lowercase do nome custom (ex: 'pronampe').
-- ============================================================

create table if not exists public.loan_modalidades (
  id          bigserial primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  local_id    text not null,
  nome        text not null,
  engine      text not null check (engine in ('price','sac')),
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists loan_modalidades_org_local_uq
  on public.loan_modalidades (org_id, local_id);

create index if not exists loan_modalidades_org_idx
  on public.loan_modalidades (org_id);

comment on table public.loan_modalidades is
  'Modalidades customizadas de empréstimo. Builtins (price/sac) ficam só no app.';

drop trigger if exists loan_modalidades_set_updated_at on public.loan_modalidades;
create trigger loan_modalidades_set_updated_at
  before update on public.loan_modalidades
  for each row execute function public.tg_set_updated_at();

alter table public.loan_modalidades enable row level security;

drop policy if exists loan_modalidades_select on public.loan_modalidades;
create policy loan_modalidades_select on public.loan_modalidades
  for select using (org_id = public.current_org_id());

drop policy if exists loan_modalidades_insert on public.loan_modalidades;
create policy loan_modalidades_insert on public.loan_modalidades
  for insert with check (org_id = public.current_org_id());

drop policy if exists loan_modalidades_update on public.loan_modalidades;
create policy loan_modalidades_update on public.loan_modalidades
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists loan_modalidades_delete on public.loan_modalidades;
create policy loan_modalidades_delete on public.loan_modalidades
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0007_loan_modalidades.sql
-- ============================================================
