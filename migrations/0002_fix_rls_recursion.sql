-- ============================================================
-- 0002_fix_rls_recursion.sql
-- ============================================================
-- Corrige recursão infinita nas policies de RLS de 0001_init.sql.
--
-- Bug: policies em organizations e org_members consultavam
-- org_members diretamente, o que reaplicava a própria policy de
-- org_members, causando recursão infinita e erro 500.
--
-- Fix: criar funções SECURITY DEFINER que bypassam RLS para
-- responder "quais orgs esse user pertence?" e "esse user é
-- admin de X org?". Usar essas funções dentro das policies.
-- ============================================================

-- ─── Helper 1: orgs que o user atual pertence ────────────────
create or replace function public.user_orgs()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select org_id from public.org_members where user_id = auth.uid()
$$;

comment on function public.user_orgs is
  'SECURITY DEFINER: bypassa RLS de org_members. Use dentro de policies para evitar recursão.';

-- ─── Helper 2: user é owner/admin de uma org? ────────────────
create or replace function public.user_is_admin_of(p_org_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role in ('owner','admin')
  )
$$;

comment on function public.user_is_admin_of is
  'SECURITY DEFINER: checa se user atual é owner/admin da org passada. Bypassa RLS.';

-- ─── Re-criar policies sem recursão ─────────────────────────

-- organizations
drop policy if exists organizations_select_own on public.organizations;
create policy organizations_select_own on public.organizations
  for select
  using (id in (select public.user_orgs()));

-- org_members
drop policy if exists org_members_select_same_org on public.org_members;
create policy org_members_select_same_org on public.org_members
  for select
  using (org_id in (select public.user_orgs()));

drop policy if exists org_members_insert_admin on public.org_members;
create policy org_members_insert_admin on public.org_members
  for insert
  with check (public.user_is_admin_of(org_id));

drop policy if exists org_members_delete_admin on public.org_members;
create policy org_members_delete_admin on public.org_members
  for delete
  using (
    public.user_is_admin_of(org_id)
    and role <> 'owner'
  );

-- user_active_org (também referenciava org_members)
drop policy if exists user_active_org_update_own on public.user_active_org;
create policy user_active_org_update_own on public.user_active_org
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and org_id in (select public.user_orgs())
  );

-- ============================================================
-- FIM 0002_fix_rls_recursion.sql
-- ============================================================
