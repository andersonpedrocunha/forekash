-- ============================================================
-- 0001_init.sql — Schema fundacional Forekash
-- ============================================================
-- Cria a base multi-tenant: organizations + org_members + helpers
-- de RLS + trigger de seat limit + auto-criação de org no signup.
--
-- Nenhuma tabela de domínio (loans, extrato, etc) é criada aqui —
-- ver migrations 0003+ para isso.
-- ============================================================

-- ─── Extensões ─────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ─── Schema dedicado para helpers de auth ────────────────────
-- Usamos o schema auth (já existe no Supabase) para a function
-- org_id(), que é referenciada pelas policies.

-- ============================================================
-- TABELA: organizations
-- ============================================================
create table if not exists public.organizations (
  id                uuid primary key default gen_random_uuid(),
  cnpj              text unique,                     -- pode ser null até o onboarding preencher
  razao_social      text not null,
  nome_fantasia     text,
  plan              text not null default 'free'
                      check (plan in ('free','team','plus','scale')),
  plan_seat_limit   int  not null default 1,
  owner_user_id     uuid not null references auth.users(id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table  public.organizations is 'Empresa cliente do Forekash. 1 org = 1 CNPJ.';
comment on column public.organizations.plan_seat_limit is
  'Free=1, Team=null (ilimitado pago por usuário). Trigger usa NULL como "sem limite".';

-- ============================================================
-- TABELA: org_members
-- ============================================================
create table if not exists public.org_members (
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid not null references auth.users(id)            on delete cascade,
  role          text not null check (role in ('owner','admin','member')),
  invited_by    uuid references auth.users(id),
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  primary key (org_id, user_id)
);

create index if not exists org_members_user_idx on public.org_members(user_id);

comment on table public.org_members is 'Vincula usuários a organizations. Pivot N:N.';

-- ============================================================
-- TABELA: user_active_org
-- ============================================================
-- Guarda qual é a org "selecionada" agora por cada user.
-- Usada pelo Auth Hook para colocar org_id na JWT claim.
create table if not exists public.user_active_org (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  org_id    uuid not null references public.organizations(id) on delete cascade,
  set_at    timestamptz not null default now()
);

comment on table public.user_active_org is
  'Org "ativa" atual de cada user. JWT claim org_id é gerada a partir daqui.';

-- ============================================================
-- HELPER: auth.org_id()
-- ============================================================
-- Lê o claim "org_id" do JWT. Retorna null se ausente — policies
-- usando isso vão negar tudo se não houver claim, o que é seguro.
create or replace function public.current_org_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::json ->> 'org_id'
  , '')::uuid
$$;

comment on function public.current_org_id is
  'org_id da JWT claim atual. NULL se ausente — policies negam por default.';

-- ============================================================
-- HELPER: trigger genérico de updated_at
-- ============================================================
create or replace function public.tg_set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- TRIGGER: seat limit em org_members
-- ============================================================
-- Bloqueia INSERT se o plano da org não comporta mais users.
-- plan_seat_limit IS NULL = sem limite (pagos).
create or replace function public.tg_org_members_check_seat_limit()
  returns trigger
  language plpgsql
  security definer
as $$
declare
  v_limit int;
  v_count int;
begin
  select plan_seat_limit into v_limit
  from public.organizations
  where id = new.org_id;

  if v_limit is null then
    return new;   -- plano sem limite
  end if;

  select count(*) into v_count
  from public.org_members
  where org_id = new.org_id;

  if v_count >= v_limit then
    raise exception 'seat_limit_exceeded: org % atingiu o limite de % usuário(s) do plano. Faça upgrade.', new.org_id, v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists org_members_check_seat_limit on public.org_members;
create trigger org_members_check_seat_limit
  before insert on public.org_members
  for each row execute function public.tg_org_members_check_seat_limit();

-- ============================================================
-- RPC: org_can_invite (UI consulta antes de mostrar botão)
-- ============================================================
create or replace function public.org_can_invite(p_org_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select case
    when (select plan_seat_limit from organizations where id = p_org_id) is null then true
    when (select count(*) from org_members where org_id = p_org_id)
         < (select plan_seat_limit from organizations where id = p_org_id) then true
    else false
  end
$$;

-- ============================================================
-- TRIGGER: auto-criar org + member ao registrar user
-- ============================================================
-- Quando um user faz signUp no Supabase Auth, cria uma org "pessoal"
-- vinculada com plano free e role owner. CNPJ fica null até o
-- onboarding pedir.
create or replace function public.tg_on_auth_user_created()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid;
begin
  insert into public.organizations (razao_social, plan, plan_seat_limit, owner_user_id)
  values (
    coalesce(new.raw_user_meta_data->>'razao_social', new.email, 'Minha empresa'),
    'free',
    1,
    new.id
  )
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role, accepted_at)
  values (v_org_id, new.id, 'owner', now());

  insert into public.user_active_org (user_id, org_id)
  values (new.id, v_org_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_on_auth_user_created();

-- ============================================================
-- RLS — organizations
-- ============================================================
alter table public.organizations enable row level security;

drop policy if exists organizations_select_own on public.organizations;
create policy organizations_select_own on public.organizations
  for select
  using (
    id in (select org_id from public.org_members where user_id = auth.uid())
  );

drop policy if exists organizations_update_owner on public.organizations;
create policy organizations_update_owner on public.organizations
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Insert via trigger (security definer); user direto não insere.
-- Delete só via service_role.

-- ============================================================
-- RLS — org_members
-- ============================================================
alter table public.org_members enable row level security;

drop policy if exists org_members_select_same_org on public.org_members;
create policy org_members_select_same_org on public.org_members
  for select
  using (
    org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid())
  );

drop policy if exists org_members_insert_admin on public.org_members;
create policy org_members_insert_admin on public.org_members
  for insert
  with check (
    -- Apenas owner/admin da org pode convidar
    exists (
      select 1 from public.org_members om
      where om.org_id = org_members.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner','admin')
    )
  );

drop policy if exists org_members_delete_admin on public.org_members;
create policy org_members_delete_admin on public.org_members
  for delete
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = org_members.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner','admin')
    )
    and role <> 'owner'   -- nunca deletar o owner
  );

-- ============================================================
-- RLS — user_active_org
-- ============================================================
alter table public.user_active_org enable row level security;

drop policy if exists user_active_org_select_own on public.user_active_org;
create policy user_active_org_select_own on public.user_active_org
  for select using (user_id = auth.uid());

drop policy if exists user_active_org_upsert_own on public.user_active_org;
create policy user_active_org_upsert_own on public.user_active_org
  for insert with check (user_id = auth.uid());

drop policy if exists user_active_org_update_own on public.user_active_org;
create policy user_active_org_update_own on public.user_active_org
  for update using (user_id = auth.uid())
                with check (
                  user_id = auth.uid()
                  and org_id in (select org_id from public.org_members where user_id = auth.uid())
                );

-- ============================================================
-- RPC: set_active_org (helper para o frontend trocar de org)
-- ============================================================
create or replace function public.set_active_org(p_org_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- Verifica que o user pertence à org
  if not exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  ) then
    raise exception 'not_a_member_of_org' using errcode = 'P0001';
  end if;

  insert into public.user_active_org (user_id, org_id)
  values (auth.uid(), p_org_id)
  on conflict (user_id) do update set org_id = excluded.org_id, set_at = now();
end;
$$;

-- ============================================================
-- AUTH HOOK: custom_access_token_hook
-- ============================================================
-- Adiciona org_id como claim no JWT. Ler:
--   Settings → Auth → Hooks → Custom Access Token
-- e setar para public.custom_access_token_hook.
create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid;
  v_claims jsonb;
begin
  v_claims := event -> 'claims';

  select org_id into v_org_id
  from public.user_active_org
  where user_id = (event ->> 'user_id')::uuid;

  if v_org_id is not null then
    v_claims := jsonb_set(v_claims, '{org_id}', to_jsonb(v_org_id::text));
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ============================================================
-- FIM 0001_init.sql
-- ============================================================
