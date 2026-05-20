# Forekash — Database Migrations

DDL versionada para o Postgres do Supabase. Cada arquivo `NNNN_*.sql` é uma migration sequencial e idempotente. **Nunca editar uma migration já aplicada em produção** — sempre criar uma nova.

## Workflow

### Desenvolvimento local

1. Subir Supabase local (opcional, recomendado para testar):
   ```bash
   npx supabase start
   ```
2. Editar/criar migration nova:
   ```bash
   # Editar manualmente migrations/NNNN_descricao.sql
   ```
3. Aplicar localmente:
   ```bash
   npx supabase db reset   # reaplica tudo from scratch
   ```

### Aplicar em produção (Supabase Cloud)

```bash
# Link com o projeto cloud (uma vez só)
npx supabase link --project-ref <ref-do-projeto>

# Aplicar migrations pendentes
npx supabase db push
```

## Convenções

- **Naming**: `NNNN_descricao_curta.sql` (NNNN = 4 dígitos sequenciais)
- **Idempotência**: usar `if not exists`, `create or replace`, `drop ... if exists` quando possível
- **RLS sempre ligado**: toda tabela com dados de org/user precisa `enable row level security` e uma policy
- **org_id é obrigatório**: toda tabela de domínio tem `org_id uuid not null references organizations(id)` + index
- **Trigger updated_at**: tabelas mutáveis ganham trigger `set updated_at = now()` em UPDATE

## Mapa das migrations (planejado)

| # | Arquivo | Fase | O que faz |
|---|---|---|---|
| 0001 | `0001_init.sql` | F0 | Schema fundacional: organizations, org_members, helpers RLS, trigger seat limit, auto-create org on signup |
| 0002 | `0002_user_settings.sql` | F1 | user_settings (preferências por user, não por org) |
| 0003 | `0003_centros_custo.sql` | F2 | centros_custo + RLS |
| 0004 | `0004_catmap.sql` | F2 | catmap_categorias + RLS |
| 0005 | `0005_loans.sql` | F2 | loan_modalidades, loans, loan_extras + RLS |
| 0006 | `0006_cartoes.sql` | F2 | cartoes, cartao_faturas, cartao_lancamentos + RLS |
| 0007 | `0007_extrato.sql` | F2 | extrato_lancamentos (alto volume — indexar por org+data) |
| 0008 | `0008_vendedores.sql` | F2 | vendedores, vendedor_regras, vendedor_ajustes |
| 0009 | `0009_fluxo.sql` | F3 | fluxo_year (jsonb por org+year) + flx_settings |
| 0010 | `0010_orcamento.sql` | F3 | orcamento_year (versionado por org+year+version_id) |
| 0011 | `0011_estrutura.sql` | F3 | estrutura_itens, estrutura_valores, estrutura_tipos, estrutura_tags |
| 0012 | `0012_pessoas.sql` | F3 | pessoas, pessoa_salarios |
| 0013 | `0013_receita.sql` | F3 | receita_clients (matriz cliente×mês) |
| 0014 | `0014_dispo.sql` | F3 | dispo_contas, dispo_saldos (mensal) |
| 0015 | `0015_impostos.sql` | F3 | impostos_correntes, impostos_parcelamentos |
| 0016 | `0016_board.sql` | F4 | board_cards, board_tags, board_subtasks |
| 0017 | `0017_viagens.sql` | F4 | viagens, viagem_despesas + bucket Storage |
| 0018 | `0018_support.sql` | F4 | support_tickets |
| 0019 | `0019_snapshots.sql` | F4 | diagnostico, analise, cac, outras_op (jsonb blobs) |

## Smoke tests

Antes de cada deploy, rodar `migrations/seed_smoke.sql` em ambiente de teste para criar 2 orgs sintéticas e validar que RLS está isolando corretamente. Ver `seed_smoke.sql` quando existir.
