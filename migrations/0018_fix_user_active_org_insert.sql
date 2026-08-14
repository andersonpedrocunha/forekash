-- ============================================================
-- 0018_fix_user_active_org_insert.sql
-- ============================================================
-- ISOLAMENTO ENTRE EMPRESAS · a política de INSERT não validava a org.
--
-- current_org_id() lê o org_id do JWT, e quem coloca esse claim é o
-- custom_access_token_hook, que simplesmente copia user_active_org.org_id.
-- O hook não valida nada — ele confia na tabela.
--
-- A política de UPDATE já exigia que a org fosse do usuário:
--     with_check: user_id = auth.uid() AND org_id IN (select user_orgs())
-- mas a de INSERT checava só o dono da linha:
--     with_check: user_id = auth.uid()
--
-- Como o cadastro é aberto e usuário novo não tem linha nessa tabela, dava
-- pra criar conta, inserir user_active_org apontando pra QUALQUER org e
-- receber um JWT com o org_id dela — lendo todo o financeiro daquela
-- empresa. São três empresas distintas nesta base.
--
-- Correção: INSERT passa a exigir o mesmo que UPDATE — a org precisa ser uma
-- em que o usuário é membro (org_members).
-- ============================================================

drop policy if exists user_active_org_upsert_own on public.user_active_org;

create policy user_active_org_upsert_own
  on public.user_active_org
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and org_id in (select user_orgs())
  );
