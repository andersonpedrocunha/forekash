-- ============================================================
-- 0013_orcamento_year.sql  (Fase 3 — Orçamento)
-- ============================================================
-- Orçamento por ano. Mesmo padrão do fluxo_year:
--   - PK composta (org_id, year)
--   - data jsonb com {versions: [...], ativa: versionId}
--   - activeYear e anosExcluidos ficam local-only (UI state)
-- ============================================================

create table if not exists public.orcamento_year (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  year        text not null,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, year)
);

create index if not exists orcamento_year_org_idx on public.orcamento_year (org_id);

comment on table public.orcamento_year is
  'Orçamento por ano. data jsonb contém versions + qual está ativa.';

drop trigger if exists orcamento_year_set_updated_at on public.orcamento_year;
create trigger orcamento_year_set_updated_at
  before update on public.orcamento_year
  for each row execute function public.tg_set_updated_at();

alter table public.orcamento_year enable row level security;

drop policy if exists orcamento_year_select on public.orcamento_year;
create policy orcamento_year_select on public.orcamento_year
  for select using (org_id = public.current_org_id());

drop policy if exists orcamento_year_insert on public.orcamento_year;
create policy orcamento_year_insert on public.orcamento_year
  for insert with check (org_id = public.current_org_id());

drop policy if exists orcamento_year_update on public.orcamento_year;
create policy orcamento_year_update on public.orcamento_year
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists orcamento_year_delete on public.orcamento_year;
create policy orcamento_year_delete on public.orcamento_year
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0013_orcamento_year.sql
-- ============================================================
