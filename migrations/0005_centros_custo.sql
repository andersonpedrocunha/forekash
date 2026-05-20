-- ============================================================
-- 0005_centros_custo.sql  (Fase 2 — primeiro módulo)
-- ============================================================
-- Centros de Custo (CC) — tabela real, com RLS por org_id.
--
-- Estratégia local-first → cloud-mirrored:
--   - localStorage continua sendo cache (sync read, instantâneo)
--   - Esta tabela é a source of truth multi-device
--   - local_id preserva o id incrementing do app pra fazer
--     upserts idempotentes (mesmo CC editado em vários devices
--     resolve pelo (org_id, local_id))
-- ============================================================

create table if not exists public.centros_custo (
  id          bigserial primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  local_id    int  not null,            -- id usado pelo app (incrementing per-org)
  nome        text not null,
  cor         text not null default '#7C3AED',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Garantir unicidade pra suportar UPSERT por (org_id, local_id)
create unique index if not exists centros_custo_org_local_uq
  on public.centros_custo (org_id, local_id);

-- Index pra queries por org_id
create index if not exists centros_custo_org_idx
  on public.centros_custo (org_id);

comment on table public.centros_custo is
  'CC — Centros de Custo. local_id preserva o id do app pra upserts idempotentes.';

-- ─── Trigger pra atualizar updated_at em UPDATE ─────────────
drop trigger if exists centros_custo_set_updated_at on public.centros_custo;
create trigger centros_custo_set_updated_at
  before update on public.centros_custo
  for each row execute function public.tg_set_updated_at();

-- ─── RLS: isolado por org ───────────────────────────────────
alter table public.centros_custo enable row level security;

drop policy if exists centros_custo_select on public.centros_custo;
create policy centros_custo_select on public.centros_custo
  for select using (org_id = public.current_org_id());

drop policy if exists centros_custo_insert on public.centros_custo;
create policy centros_custo_insert on public.centros_custo
  for insert with check (org_id = public.current_org_id());

drop policy if exists centros_custo_update on public.centros_custo;
create policy centros_custo_update on public.centros_custo
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists centros_custo_delete on public.centros_custo;
create policy centros_custo_delete on public.centros_custo
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0005_centros_custo.sql
-- ============================================================
