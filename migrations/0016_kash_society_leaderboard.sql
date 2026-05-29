-- ============================================================
-- 0016_kash_society_leaderboard.sql  (KASH SOCIETY · ranking universal)
-- ============================================================
-- Leaderboard global da Kash Society. Todos os usuários autenticados
-- podem LER o ranking inteiro (é o ponto — "todos veem um do outro").
-- Apenas o dono pode escrever a própria linha.
--
-- Identidade pública = member_id (mesmo pseudônimo #XXXXX da A PAREDE,
-- hash determinístico do memberToken). user_id fica em coluna interna
-- só pra RLS — não é exposto na UI.
-- ============================================================

create table if not exists public.kash_society_leaderboard (
  user_id     uuid not null references auth.users(id) on delete cascade,
  member_id   text not null,                       -- '#XXXXX' (hash do token, == A PAREDE)
  score       integer not null default 0,
  caste_n     smallint not null default 0,         -- 0..5
  caste_nome  text not null default 'ASPIRANTE',
  caste_cor   text not null default '#94A3B8',
  streak      integer not null default 0,          -- streak atual (decorativo)
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  primary key (user_id)
);

-- Index pra ordenação rápida do leaderboard
create index if not exists ks_leaderboard_score_idx
  on public.kash_society_leaderboard (score desc);

-- Index pra lookup por member_id (pode ter relatórios, etc)
create index if not exists ks_leaderboard_member_idx
  on public.kash_society_leaderboard (member_id);

comment on table public.kash_society_leaderboard is
  'Ranking universal da Kash Society. Anônimo via member_id (mesmo pseudônimo de A PAREDE).';

-- updated_at trigger (reusa função existente em 0001)
drop trigger if exists ks_leaderboard_set_updated_at
  on public.kash_society_leaderboard;
create trigger ks_leaderboard_set_updated_at
  before update on public.kash_society_leaderboard
  for each row execute function public.tg_set_updated_at();

alter table public.kash_society_leaderboard enable row level security;

-- ─── RLS ───────────────────────────────────────────────────
-- SELECT: qualquer usuário autenticado vê TODOS (é universal)
drop policy if exists ks_leaderboard_select on public.kash_society_leaderboard;
create policy ks_leaderboard_select on public.kash_society_leaderboard
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE: só o dono
drop policy if exists ks_leaderboard_insert on public.kash_society_leaderboard;
create policy ks_leaderboard_insert on public.kash_society_leaderboard
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists ks_leaderboard_update on public.kash_society_leaderboard;
create policy ks_leaderboard_update on public.kash_society_leaderboard
  for update to authenticated using (user_id = auth.uid())
                             with check (user_id = auth.uid());

drop policy if exists ks_leaderboard_delete on public.kash_society_leaderboard;
create policy ks_leaderboard_delete on public.kash_society_leaderboard
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- FIM 0016_kash_society_leaderboard.sql
-- ============================================================
