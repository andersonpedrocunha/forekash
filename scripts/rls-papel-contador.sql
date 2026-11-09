-- ════════════════════════════════════════════════════════════════════
-- ACESSO DO CONTADOR: só o módulo Contador, só leitura — NO BANCO.
--
-- Rodar no SQL Editor do Supabase (projeto xgjqnwdhqlxhkgwowwej).
--
-- POR QUE NO BANCO E NÃO NA TELA
-- Esconder módulo por CSS não protege nada: o index.html inteiro já foi
-- baixado pro navegador do contador, com os dados e todas as funções. Quem
-- abre o inspetor vê tudo e pode gravar. A única barreira real é o Postgres
-- recusar a linha.
--
-- O QUE MUDA
-- Hoje a política de toda tabela é `org_id = current_org_id()`: qualquer
-- membro da organização lê e escreve tudo. Aqui o PAPEL entra na conta.
--
-- SEGURANÇA DA MIGRAÇÃO
-- Hoje só existe um membro (anderson@taller.net.br, papel `owner`). Todas as
-- condições novas são "menos restritivas pra quem não é contador", então
-- nada muda pro owner nem pra admin. Verifique no fim com a consulta de
-- conferência.
-- ════════════════════════════════════════════════════════════════════

begin;

-- Papel do usuário na org corrente. SECURITY DEFINER porque consultar
-- org_members de dentro de uma política de org_members recursaria.
create or replace function fk_papel() returns text
language sql stable security definer set search_path = public, auth as $$
  select m.role
    from org_members m
   where m.org_id = current_org_id()
     and m.user_id = auth.uid()
   limit 1
$$;

-- Contador não escreve em lugar nenhum. Função separada pra ficar óbvia na
-- leitura das políticas e pra um papel novo não exigir mexer em 60 lugares.
create or replace function fk_pode_escrever() returns boolean
language sql stable set search_path = public as $$
  select coalesce(fk_papel(), '') <> 'contador'
$$;

-- ── 1. NENHUMA ESCRITA PRO CONTADOR, EM NENHUMA TABELA ──────────────
do $$
declare r record; expr text;
begin
  for r in
    select c.relname as tbl, p.polname as nome, p.polcmd::text as cmd
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where p.polcmd::text in ('a','w','d')
       and pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) like '%current_org_id()%'
  loop
    expr := '(org_id = current_org_id()) and fk_pode_escrever()';
    if r.cmd = 'a' then
      execute format('alter policy %I on public.%I with check (%s)', r.nome, r.tbl, expr);
    elsif r.cmd = 'd' then
      execute format('alter policy %I on public.%I using (%s)', r.nome, r.tbl, expr);
    else
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.nome, r.tbl, expr, expr);
    end if;
  end loop;
end $$;

-- ── 2. LEITURA: só o que a tela do Contador precisa ─────────────────
-- O módulo monta o Extrato gerencial a partir de extrato_lancamentos e usa
-- os rótulos de conta e de categoria. Fora isso, nada.
alter policy module_blobs_select on public.module_blobs
  using (
    org_id = current_org_id()
    and (
      fk_pode_escrever()
      or module in ('contador','dispo','catmap_local','empresas')
    )
  );

-- extrato_lancamentos, catmap_categorias e centros_custo seguem liberados
-- para leitura: é deles que sai o extrato que ele exporta e os nomes que a
-- tela mostra.

-- Todo o resto fica fora do alcance do contador.
do $$
declare r record;
begin
  for r in
    select c.relname as tbl, p.polname as nome
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where p.polcmd::text = 'r'
       and c.relname in ('cartao_faturas','cartao_lancamentos','cartoes',
                         'extrato_ignorados','fluxo_year','kash_almanaque_eventos',
                         'loan_modalidades','loans','orcamento_year','vendedores')
       and pg_get_expr(p.polqual, p.polrelid) like '%current_org_id()%'
  loop
    execute format(
      'alter policy %I on public.%I using ((org_id = current_org_id()) and fk_pode_escrever())',
      r.nome, r.tbl);
  end loop;
end $$;

commit;

-- ── CONFERÊNCIA ─────────────────────────────────────────────────────
-- Toda política de dado deve mencionar fk_pode_escrever(). O SELECT de
-- extrato_lancamentos, catmap_categorias e centros_custo é a exceção
-- proposital: o contador precisa deles.
--
--   select c.relname, p.polname, p.polcmd::text,
--          pg_get_expr(p.polqual, p.polrelid) as usando
--     from pg_policy p join pg_class c on c.oid = p.polrelid
--     join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
--    where pg_get_expr(coalesce(p.polqual,p.polwithcheck), p.polrelid) like '%current_org_id%'
--    order by 1, 3;
--
-- E o seu próprio acesso, que não pode ter mudado:
--   select fk_papel();        -- deve devolver 'owner'
--   select fk_pode_escrever(); -- deve devolver true
