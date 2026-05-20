-- ============================================================
-- 0006_catmap_categorias.sql  (Fase 2 — segundo módulo)
-- ============================================================
-- Categorias (catmap) — mapping de Categoria → Módulo → DRC → DRE.
-- Estrutura mais rica que CC: tem origem, flags de auto-discovery,
-- e relação opcional com tags do módulo Estrutura.
--
-- Estratégia: mesma do CC (local-first, cloud-mirrored, upsert
-- por (org_id, local_id), JS cloudCatmapFetch/Sync).
-- ============================================================

create table if not exists public.catmap_categorias (
  id                  bigserial primary key,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  local_id            int  not null,
  nome                text not null,
  modulo_id           text,                  -- 'receita', 'folha', 'estrutura', 'emprestimos', 'comissoes', 'impostos', 'outrasRec', 'outrasDesp', 'extrato'...
  drc_line_id         text,                  -- linha da DRC vinculada
  dre_line_id         text,                  -- linha da DRE vinculada
  cor                 text,
  tipo                text,                  -- 'estrutura', 'outrasRec', 'outrasDesp', 'extrato' (UI category type)
  origem              text,                  -- texto livre de onde veio (ex: 'Estrutura · tag', 'auto-discovery')
  auto_discovered     boolean not null default false,
  user_created        boolean not null default true,
  suggestion_applied  boolean not null default false,
  metadata            jsonb   not null default '{}',  -- catch-all pra campos futuros
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists catmap_categorias_org_local_uq
  on public.catmap_categorias (org_id, local_id);

create index if not exists catmap_categorias_org_modulo_idx
  on public.catmap_categorias (org_id, modulo_id);

comment on table public.catmap_categorias is
  'Mapping Categoria → Módulo → linha DRC/DRE. local_id preserva o id do app.';

-- Trigger updated_at
drop trigger if exists catmap_categorias_set_updated_at on public.catmap_categorias;
create trigger catmap_categorias_set_updated_at
  before update on public.catmap_categorias
  for each row execute function public.tg_set_updated_at();

-- RLS por org
alter table public.catmap_categorias enable row level security;

drop policy if exists catmap_categorias_select on public.catmap_categorias;
create policy catmap_categorias_select on public.catmap_categorias
  for select using (org_id = public.current_org_id());

drop policy if exists catmap_categorias_insert on public.catmap_categorias;
create policy catmap_categorias_insert on public.catmap_categorias
  for insert with check (org_id = public.current_org_id());

drop policy if exists catmap_categorias_update on public.catmap_categorias;
create policy catmap_categorias_update on public.catmap_categorias
  for update using (org_id = public.current_org_id())
             with check (org_id = public.current_org_id());

drop policy if exists catmap_categorias_delete on public.catmap_categorias;
create policy catmap_categorias_delete on public.catmap_categorias
  for delete using (org_id = public.current_org_id());

-- ============================================================
-- FIM 0006_catmap_categorias.sql
-- ============================================================
