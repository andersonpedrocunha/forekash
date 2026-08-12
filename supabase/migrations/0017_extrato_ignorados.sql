-- Registro de movimentos que passaram pela importação ou pela conciliação e o
-- usuário decidiu NÃO trazer pro sistema.
--
-- Tabela separada de extrato_lancamentos de propósito: ignorado não é
-- lançamento. Não pode entrar em saldo, relatório ou demonstrativo por
-- descuido de um filtro esquecido em alguma query.
--
-- local_id é TEXT (e não integer como em extrato_lancamentos) porque o id
-- local vem no formato 'ign42'.

create table if not exists public.extrato_ignorados (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  local_id     text not null,
  data         date,
  valor        numeric,
  tipo         text,
  descricao    text,
  conta        text,
  categoria    text,
  contraparte  text,
  fitid        text,
  origem       text,          -- 'importacao' | 'conciliacao'
  arquivo      text,
  motivo       text,
  ignorado_em  timestamptz,
  criado_em    timestamptz not null default now(),
  unique (org_id, local_id)
);

-- o reconhecimento automático consulta por FITID e por data+valor
create index if not exists extrato_ignorados_org_fitid_idx
  on public.extrato_ignorados (org_id, fitid);
create index if not exists extrato_ignorados_org_data_valor_idx
  on public.extrato_ignorados (org_id, data, valor);

alter table public.extrato_ignorados enable row level security;

drop policy if exists extrato_ignorados_select on public.extrato_ignorados;
drop policy if exists extrato_ignorados_insert on public.extrato_ignorados;
drop policy if exists extrato_ignorados_update on public.extrato_ignorados;
drop policy if exists extrato_ignorados_delete on public.extrato_ignorados;

create policy extrato_ignorados_select on public.extrato_ignorados
  for select using (org_id = current_org_id());
create policy extrato_ignorados_insert on public.extrato_ignorados
  for insert with check (org_id = current_org_id());
create policy extrato_ignorados_update on public.extrato_ignorados
  for update using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy extrato_ignorados_delete on public.extrato_ignorados
  for delete using (org_id = current_org_id());
