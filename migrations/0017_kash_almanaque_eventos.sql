-- ============================================================
-- 0017_kash_almanaque_eventos.sql  (ALMANAQUE cloud-sync)
-- ============================================================
-- Permite que o ALMANAQUE da KASH SOCIETY se atualize sozinho com
-- novos eventos históricos sem deploy. Tabela é append-only:
--
--   • Frontend SELECT todos eventos com approved=true
--   • Insert vem de 2 fontes:
--       (a) GitHub Action semanal · usa SERVICE_ROLE pra inserir
--           direto, marcando approved=true após validar via Gemini
--       (b) Admin manual no dashboard do Supabase
--
-- Estrutura espelha o shape dos eventos seed em KS_ALM_EVENTS:
-- ============================================================

create table if not exists public.kash_almanaque_eventos (
  id          uuid primary key default gen_random_uuid(),
  d           text not null check (d ~ '^[0-1][0-9]-[0-3][0-9]$'),  -- 'MM-DD'
  y           integer not null check (y between 1500 and 2100),
  lugar       text not null,                          -- bandeira emoji
  evento      text not null,                          -- título curto
  "desc"      text not null,                          -- sumário 1-2 frases
  tipo        text not null default 'evento'
              check (tipo in ('evento','doutrina')),
  severidade  smallint not null default 3
              check (severidade between 1 and 5),
  detalhes    text,                                   -- narrativa longa (modal)
  economistas jsonb not null default '[]'::jsonb,     -- array de strings
  doutrinas   jsonb not null default '[]'::jsonb,     -- array de strings
  fontes      jsonb not null default '[]'::jsonb,     -- [{n,u},...]
  approved    boolean not null default false,         -- visível só quando true
  source      text,                                   -- 'gemini-cron' | 'manual' | etc
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ks_almanaque_year_idx
  on public.kash_almanaque_eventos (y);
create index if not exists ks_almanaque_date_idx
  on public.kash_almanaque_eventos (d);
create index if not exists ks_almanaque_approved_idx
  on public.kash_almanaque_eventos (approved) where approved = true;

comment on table public.kash_almanaque_eventos is
  'Eventos do ALMANAQUE (KASH SOCIETY). Cloud-sync pra atualizar sem deploy.';

drop trigger if exists ks_almanaque_updated_at
  on public.kash_almanaque_eventos;
create trigger ks_almanaque_updated_at
  before update on public.kash_almanaque_eventos
  for each row execute function public.tg_set_updated_at();

alter table public.kash_almanaque_eventos enable row level security;

-- ─── RLS ───────────────────────────────────────────────────
-- SELECT: qualquer usuário autenticado vê eventos APROVADOS
drop policy if exists ks_almanaque_select on public.kash_almanaque_eventos;
create policy ks_almanaque_select on public.kash_almanaque_eventos
  for select to authenticated using (approved = true);

-- INSERT autenticado: cria proposta (approved=false). Aprovação manual.
drop policy if exists ks_almanaque_insert on public.kash_almanaque_eventos;
create policy ks_almanaque_insert on public.kash_almanaque_eventos
  for insert to authenticated
    with check (created_by = auth.uid() and approved = false);

-- UPDATE: só o autor enquanto não aprovado (editar proposta)
drop policy if exists ks_almanaque_update on public.kash_almanaque_eventos;
create policy ks_almanaque_update on public.kash_almanaque_eventos
  for update to authenticated
    using (created_by = auth.uid() and approved = false)
    with check (created_by = auth.uid() and approved = false);

-- DELETE: só o autor enquanto não aprovado
drop policy if exists ks_almanaque_delete on public.kash_almanaque_eventos;
create policy ks_almanaque_delete on public.kash_almanaque_eventos
  for delete to authenticated
    using (created_by = auth.uid() and approved = false);

-- ─── Nota: SERVICE_ROLE bypassa RLS ───
-- A GitHub Action usa a service_role key, então insere direto com
-- approved=true. Pra UI de admin futura, criar role 'almanaque_admin'
-- e adicionar policy permitindo UPDATE approved=true por essa role.
-- ============================================================
-- FIM 0017_kash_almanaque_eventos.sql
-- ============================================================
