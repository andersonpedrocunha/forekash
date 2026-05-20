# Forekash — Plano de Migração para Supabase

Plano de migração do app single-file Forekash (74.970 linhas, 100% localStorage) para uma arquitetura multi-tenant em Supabase (Postgres + Auth + Realtime).

> **Decisões travadas pelo owner (2026-05-19):**
> 1. **Catálogos isolados por org** — usuários em N orgs não compartilham CC, modalidades, vendedores etc.
> 2. **Seat limit R$0** aplicado em **ambos** UI + DB trigger (defesa em profundidade).
> 3. **Região Supabase: `sa-east-1`** (São Paulo) — minimiza latência para usuários brasileiros.

---

## 1. Schema design

### 1.1 Decision matrix por chave

Princípio geral: dados **estruturalmente relacionais** (loans, lançamentos do extrato, faturas de cartão, pessoas) → tabelas reais. Dados que são **um único blob de configuração por org/ano** (fluxo, orçamento, estrutura de custos com matriz mês×categoria, settings) → `jsonb` com PK composta. Estados de UI (collapsed, hidden, view mode) → **ficam no localStorage**, não migram.

| Chave (linha) | Shape | Tratamento |
|---|---|---|
| `taller_loans_v3` (loadData/saveData `index.html:17091`/`17106`, KEY_NOW `:16357`) | `{loans:[...], nextId}` array of records, cada loan tem `extras[]`, `parcelaHist[]`, `saldoHist[]` | **Tabela** `loans` + `loan_extras` (1-N) |
| `taller_loan_modalidades_v1` (`:16359`) | array `[{id, nome, engine, builtin}]` | **Tabela** `loan_modalidades` |
| `taller_receita_v1` (`:20872`) | `{years:{[year]:{clients:[...]}}}` matriz cliente×mês | **Tabela** `receita_clients` (org, year, client_id, pais, meses jsonb) |
| `taller_pessoas_v1` (`:39575`) | `{people, tipos, years, reajSim, ...}`, headcount com `salarios[YYYY-MM]` | **Tabela** `pessoas` + `pessoa_salarios` |
| `taller_estrutura_v1` (`:55228`) | `{years, tipos, tags, itens, nextId}` itens com `valores[YYYY-MM]` e `pagos[YYYY-MM]` | **Tabela** `estrutura_itens` + `estrutura_valores` (mensal) + `estrutura_tipos`, `estrutura_tags` (small lookup) |
| `taller_fluxo_v1` (`:27532`) | blob complexo por ano: `inputs, saldoInicial, rowModes, manualOverrides, confirmed` | **jsonb** — `fluxo_year(org_id, year PK, data jsonb)` |
| `flx_analise_v1` / `flx_view_v1` / `flx_struct_v1` (`:28305`/`:28325`/`:28358`) | view/analysis settings | `flx_settings(org_id, key, value jsonb)` ou ficam em localStorage |
| `taller_orcamento_v1` (`:30282`) | `{years:{[year]:{versoes:[...]}}, anosExcluidos}` versionado, comparativo previsto×realizado | **jsonb** — `orcamento_year(org_id, year, version_id, data jsonb)` (uma row por versão) |
| `taller_diag_v2` (`:31770`) | snapshot de diagnóstico (estado de IA) | `jsonb` blob — `diagnostico(org_id, data jsonb, generated_at)` |
| `forekash_cac_v2_v1` (`:36626`) | configuração de CAC | `cac(org_id, data jsonb)` |
| `taller_outras_op_v1` (`:37313`) | outras operações | `outras_op(org_id, data jsonb)` |
| `forekash:support:tickets:v1` (`:37520`) | array de tickets | **Tabela** `support_tickets` (org_id, user_id, status, body, attachments jsonb) — também útil pra suporte real |
| `taller_vendedores_v1` (`:40559`) | `{lista, nextId}` cada vendedor tem `regras[]`, `faixas[]`, `ajustes[]` | **Tabela** `vendedores` + `vendedor_regras` + `vendedor_ajustes` |
| `forekash_viagens_v1` (`:40799`) | `{itens:[{despesas:[{anexo, ocr,...}]}], nextId}` com anexos base64 | **Tabela** `viagens` + `viagem_despesas` + **Supabase Storage** para anexos |
| `forekash_viag_settings_v1` (`:40800`) | settings de view kanban | `flx_settings` (kv) ou localStorage |
| `forekash_board_v1` (`:42704`) | `{globalTags, cards:[{subtasks, attachments, notes,...}], nCard, nTag}` | **Tabela** `board_cards` + `board_tags` + `board_subtasks` |
| `forekash:cartoes:v1` (`:45549`) | `{list, faturas, lancamentos, nextCartaoId,...}` 3 entidades relacionadas | **Tabelas** `cartoes`, `cartao_faturas`, `cartao_lancamentos` |
| `forekash:extrato:v1` (`:47138`) | `{lancamentos:[{conta, descricao, contraparte, centroCustoId, valor, data,...}], nextId}` | **Tabela** `extrato_lancamentos` (alto volume — indexar por org+data) |
| `forekash:cc:v1` (`:50770`) | `{centros:[{id,nome,cor}], nextId}` | **Tabela** `centros_custo` |
| `forekash:catmap:v1` (`:50941`) | `{categorias:[{nome, moduloId, drcLineId, dreLineId}], nextId}` | **Tabela** `catmap_categorias` |
| `taller_impostos_v1` (`:56629`) | impostos correntes + parcelamentos | **Tabela** `impostos_correntes` + `impostos_parcelamentos` |
| `taller_disponibilidades_v1` (`:59509`) | `{bancos, contas, tipos, valores[YYYY-MM]}` | **Tabela** `dispo_contas` + `dispo_saldos` (mensal) |
| `taller_analise_v1` (`:59708`) | snapshot de análise | `jsonb` blob — `analise(org_id, data jsonb)` |
| `taller_settings_v1` (`:70713`) | perfil + preferências do usuário | **Tabela** `user_settings` (por user, não por org — `auth.uid()` RLS) |
| `forekash:sbGroups:v1` (`:70916`) | sidebar groups state | **localStorage** (per device) — não migra |
| `taller_guia_progress_v1` (`:72534`) | progresso do onboarding | `user_settings.guide_progress jsonb` |
| `forekash:auth:v1` (`:72921`) | users + session local | **Supabase Auth** substitui inteiro |
| `forekash:pomodoro:v1` (`:74367`) | timer state | **localStorage** (per device) |
| UI state vários (`emp_pdf_guide_hidden_v1`, `reg_*`, `home_*`, `*collapsed`, `wf_sidebar_collapsed`, etc) | UI state ou cache | **Ficam em localStorage** (preferências de dispositivo) |

### 1.2 Foundational schema (DDL sketch)

```sql
-- ─── Multi-tenant ──────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  cnpj text unique not null,                 -- 1 org = 1 CNPJ
  razao_social text not null,
  plan text not null default 'free',         -- 'free'|'team'|'plus'|'scale'
  plan_seat_limit int not null default 1,    -- 1 / null / null / null
  created_at timestamptz default now(),
  owner_user_id uuid not null references auth.users(id)
);

create table org_members (
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  primary key (org_id, user_id)
);

create index on org_members(user_id);  -- "quais orgs eu pertenço"

-- ─── Helper: claim org_id atual a partir do JWT ───
create function auth.org_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'org_id','')::uuid
$$;

-- ─── Template para tabelas de domínio ──────────────
create table loans (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  banco text, valor numeric, parcelas int,
  taxa numeric, tipo text, data_inicio date,
  parcela_val numeric, parcelas_pagas int,
  parcela_hist jsonb default '[]',
  saldo_hist  jsonb default '[]',
  banco_manual text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on loans(org_id);

alter table loans enable row level security;
create policy loans_all on loans
  using (org_id = auth.org_id())
  with check (org_id = auth.org_id());
```

Mesmo padrão repetido para todas as ~22 tabelas relacionais. Tabelas "jsonb blob por ano" (fluxo, orçamento) usam PK composta `(org_id, year[, version_id])`.

### 1.3 Storage (anexos)

Bucket `forekash-attachments`, path `<org_id>/<entity>/<id>/<filename>`. Política de bucket: `bucket_id = 'forekash-attachments' AND (storage.foldername(name))[1] = auth.org_id()::text`. Migra anexos de **viagens** (despesas com `dataUrl` base64 → upload) e **support tickets**.

---

## 2. Multi-tenant + auth model

### 2.1 Roles

- `owner` — único, herda da criação da org, único que pode dar upgrade/downgrade de plan ou deletar org.
- `admin` — convida/remove membros, edita tudo.
- `member` — edita dados financeiros, **não** convida nem altera plano.

No plano R$0 só existe owner; roles começam a importar a partir do Team.

### 2.2 R$0 seat limit (1 user/org)

**Defesa em profundidade**:
1. **DB trigger** em `org_members` (BEFORE INSERT) checa `(select count(*) from org_members where org_id = NEW.org_id) >= (select plan_seat_limit from organizations where id = NEW.org_id)` e levanta `raise exception 'seat_limit_exceeded'` — não tem como burlar pelo client.
2. **UI** chama RPC `org_can_invite(org_id)` antes de mostrar o botão "Convidar" e mostra o paywall ("Faça upgrade para o Team").

Quando o plano muda, `plan_seat_limit` é atualizado via webhook do gateway de pagamento (Stripe/Cielo/Pagar.me — fora do escopo desta migração mas já preparar coluna).

### 2.3 Usuário em múltiplas orgs

Pattern padrão do Supabase: JWT claim `org_id` colocada via **Auth Hook (PostgreSQL function)** que lê de uma tabela `user_active_org(user_id pk, org_id)`. Trocar de org = `update user_active_org set org_id=X`, depois `supabase.auth.refreshSession()` para regerar JWT com a nova claim. UI ganha um "Seletor de Org" no header (próximo do avatar `index.html:72955`).

Todas as policies usam `auth.org_id()` (a function). Trocar org muda o que retorna sem precisar alterar policy.

### 2.4 Email/senha + reset

Supabase Auth built-in. `signUp({email, password})` cria `auth.users`; trigger `on_auth_user_created` cria automaticamente uma `organizations` (com CNPJ pendente — pede no onboarding) + `org_members` com role `owner`. Reset por email é feature padrão. Forekash hoje (`fkHash` em `index.html:72936`) usa SHA-256 client-side — esse código todo (`:72921`-`:73450`) é **substituído** pelo gate Supabase.

### 2.5 Cutover do user local

Dia D: a página detecta `localStorage['forekash:auth:v1']`. Como hoje só **um user** (o owner) existe, ele entra na tela nova de login (signup Supabase com o mesmo email), recebe um modal "Detectamos dados locais. Importar para a nuvem?" → roda script da seção 4. Se já tem conta Supabase, login direto + opção de importar. **O hash SHA-256 antigo é descartado** (senha precisa ser re-cadastrada — UX aceitável pra 1 owner + early customers).

---

## 3. Phasing (3-5 semanas)

### Fase 0 — Setup (Dia 1-2)
- Provisionar projeto Supabase `sa-east-1`, ligar Auth com confirmação de email, criar bucket Storage, configurar SMTP transacional.
- Adicionar `<script src="https://esm.sh/@supabase/supabase-js@2">` e `window.sb = createClient(...)` no `index.html` próximo às outras CDNs (`index.html:7`). **Não usa ainda.**
- Criar arquivo separado `migrations/` (versionado em git, não no HTML) com DDL completa.
- **Deploy**: idêntico ao atual (Cloudflare Workers, asset estático). Nada visível mudou.
- **Rollback**: trivial — apenas remover a tag `<script>`.

### Fase 1 — Auth real + scaffolding multi-tenant (3-4 dias)
- Substituir o gate `index.html:11671-11800` (HTML) e bloco JS `:72921-73450` por integração `supabase.auth`.
- Criar `organizations` + `org_members` + trigger `on_auth_user_created`.
- Adicionar seletor de org no header (próximo a `:12521`).
- Implementar **dual-mode flag** `window.FK_MODE` = `'local' | 'cloud'`. Default `'local'`. Toggle via `localStorage['fk_cloud_mode']='1'`. Todas as funções `*Load`/`*Save` ganham `if(FK_MODE==='cloud') return cloudLoad(...)` (refatoração mecânica, não muda o shape).
- **Modal de migração**: aparece após primeiro login bem-sucedido se localStorage tem dados. UX com checkboxes por módulo + barra de progresso.
- **Deploy**: cloud-mode escondido atrás da flag. Owner ativa manualmente pra testar.
- **Rollback**: remove flag, app volta a usar localStorage. Dados locais nunca foram apagados — flag de migração só **copia**, não deleta.

### Fase 2 — Migrar dados "relacionais simples" (5-7 dias)
Ordem por risco (do mais isolado pro mais conectado):
1. `centros_custo` (CC_KEY) — isolado, sem FK.
2. `catmap_categorias` (CATMAP_KEY).
3. `loan_modalidades` + `loans` + `loan_extras` (KEY_NOW + LOAN_MODALIDADES_KEY) — feature original, mais testada.
4. `cartoes` + `cartao_faturas` + `cartao_lancamentos` (CART_KEY).
5. `extrato_lancamentos` (EXTRATO_KEY) — alto volume.
6. `vendedores` + `vendedor_regras` + `vendedor_ajustes` (VEND_KEY).

Para cada módulo: refatorar `xxLoad()`/`xxSave()` para chamarem Supabase em cloud-mode. Manter shape em memória idêntico (a função `xxLoad()` continua populando a variável global `cartoes`, `extratoData`, etc. — só muda a origem). Isso evita tocar nas funções de render, que são o grosso do código.

- **Deploy**: incremental — cada módulo migrado faz seu próprio commit, owner testa em produção em modo cloud (ele é o único user).
- **Rollback por módulo**: setar `FK_MODE='local'` temporariamente; dados em Supabase ficam órfãos mas não são perdidos.

### Fase 3 — Migrar "jsonb blobs por ano" (4-5 dias)
- `fluxo_year` (FLX_KEY) — `index.html:27540`.
- `orcamento_year` (ORC_KEY) — `:30306`.
- `estrutura_itens` + `estrutura_valores` (EST_KEY) — `:55271`.
- `pessoas` + `pessoa_salarios` (PES_KEY) — `:39588`.
- `receita_clients` (REC_KEY) — `:20872`.
- `dispo_contas` + `dispo_saldos` (DISPO_KEY) — `:59509`.
- `impostos_correntes` + `impostos_parcelamentos` (IMP_KEY) — `:56629`.

Esses módulos têm **mais código de render dependendo do shape**. Estratégia: migrar pra schema híbrido — colunas escalares pra campos consultados em filtro/agregação (`year`, `tipo_id`), e `jsonb` pra arrays/mapas que sempre são lidos inteiros (`valores`, `pagos`).

- **Deploy**: igual fase 2, feature por feature.

### Fase 4 — Migrar features secundárias + anexos (2-3 dias)
- `board_cards` (BD_KEY) — `:42758`.
- `viagens` + Storage upload de anexos (VIAGENS_KEY) — `:40799`.
- `support_tickets` (SUP_TICKETS_KEY) — `:37520`.
- `user_settings` (SETTINGS_KEY + GUIA_KEY) — `:70713`/`:72534`.
- Snapshots: DIAG, ANA, CAC, OUTRAS_OP como `jsonb`.

### Fase 5 — Cutover + cleanup (2-3 dias)
- Tornar cloud-mode default (`FK_MODE='cloud'` sem flag).
- Telemetria: log de erros de RLS, tempo de query, falhas de save.
- Banner "Modo local descontinuado em 30 dias" para users ainda em local mode.
- Remover código dual-mode após 30 dias (segundo deploy).
- **Rollback**: feature flag de servidor (cookie ou query param) que força local mode em caso de incidente Supabase.

### Total: ~17-22 dias úteis (≈ 4 semanas), com folga de 3-5 dias pra polish e bugs.

---

## 4. Data migration on first login

Arquitetura do script (lazy-load, ~300 linhas separadas em `index.html`):

```text
async function migrateLocalToCloud(orgId, opts) {
  const log = [];
  const steps = [
    {key: CC_KEY,         fn: migrateCC,         label: 'Centros de custo'},
    {key: CATMAP_KEY,     fn: migrateCatmap,     label: 'Categorias'},
    {key: LOAN_MODALIDADES_KEY, fn: migrateLoanModalidades, label: 'Modalidades'},
    {key: KEY_NOW,        fn: migrateLoans,      label: 'Empréstimos'},
    {key: EST_KEY,        fn: migrateEstrutura,  label: 'Estrutura'},
    // ... ordem importa: FKs primeiro (CC antes de Extrato)
  ];
  for (const step of steps) {
    try {
      const raw = localStorage.getItem(step.key);
      if (!raw) { log.push({step: step.label, status: 'skip'}); continue; }
      const parsed = JSON.parse(raw);
      const result = await step.fn(orgId, parsed);  // insere em Supabase
      log.push({step: step.label, status: 'ok', rows: result.rows});
      opts.onProgress?.(log);
    } catch (e) {
      log.push({step: step.label, status: 'error', err: e.message});
      // continua — não aborta, só marca o que falhou
    }
  }
  const okKeys = log.filter(l => l.status === 'ok').map(l => l.key);
  localStorage.setItem('forekash:migrated:v1', JSON.stringify({orgId, okKeys, at: Date.now()}));
  return log;
}
```

Cada `migrateXxx(orgId, parsed)`:
1. Transforma shape local → shape cloud (mapeia `nextId` em sequências do Postgres, gera novos `bigint`/`uuid` ids e mantém um `oldId → newId` map para reescrever FKs em payloads seguintes na mesma sessão).
2. Faz `INSERT` em batches de 500 via `supabase.from('xxx').insert(rows)`.
3. Em erro de duplicata (`PGRST` 23505), faz `UPSERT` para idempotência (re-rodar a migração não duplica).
4. Retorna `{rows: n}`.

Idempotência crítica: usar `localStorage['forekash:migrated:v1']` como guarda — se já migrou OK, não re-importa. **Não deletar** os dados locais (cache de fallback até user explicitamente confirmar "Tudo certo, limpar dados locais").

---

## 5. Risks & mitigations

| Risco | Mitigação |
|---|---|
| **Single HTML dificulta feature flags** | A flag `window.FK_MODE` + refatoração de `xxLoad/xxSave` pra branch interno confina a mudança aos pontos de I/O — funções de render não tocam. Cache do HTML pode atrasar deploy: adicionar `?v=hash` no `forekash.com.br` ou usar header `Cache-Control: no-cache` no Worker. |
| **Migração falha no meio** | Script é incremental por módulo + idempotente (UPSERT em duplicata). UI mostra log granular: "Empréstimos: OK (47), Extrato: ERRO (timeout)". User pode re-rodar só os com erro. Dados locais nunca são deletados na migração. |
| **2 abas abertas (conflito)** | Curto prazo: `BroadcastChannel('forekash')` mostra "Outra aba está editando — atualize esta página". Médio prazo: Supabase Realtime — assinar mudanças por org e re-fetch automático. Optimistic locking via `updated_at` + `if-match`. |
| **Supabase free tier (500MB DB, 50k MAU)** | 50k MAU é folgado pra B2B brasileiro de nicho. 500MB DB: cada org com 5 anos de dados pesados ≈ 5-10MB; quebra em ~100 orgs ativas. Migrar para tier Pro ($25/mo) quando bater 80% — alerta automático aos 70%. Anexos vão pra Storage (1GB free, separado). |
| **DDL changes pós-launch** | Versionar migrations em git (`/migrations/0001_*.sql`...), aplicar via `supabase db push` ou CI. Nunca editar tabela em prod manualmente. Para schemas `jsonb`, evoluir é trivial. |
| **Senha owner é recadastrada** | Aceitável: só 1 owner + ~5 early customers. UX: tela de login com banner "Forekash atualizou! Cadastre sua senha novamente". Email = mesmo do localStorage. |
| **RLS bug vaza dados entre orgs** | `auth.org_id()` retorna `null` se claim ausente → policy nega tudo. Adicionar teste e2e: criar 2 orgs, logar como user1, tentar SELECT em dados de user2, assertion = 0 rows. |
| **Latência de network mata UX** | Optimistic UI: atualiza memória local, dispara `await sb.from(...).update(...)` em background, reverte se falhar. Já é como o app trabalha. |

---

## 6. Section/line refs em index.html

| Fase / módulo | Linhas para refatorar |
|---|---|
| **F0** Setup CDN Supabase | `:7-12` (CDN scripts), criar bloco novo logo após |
| **F1** Auth gate substituição | `:11671-11800` (HTML gate), `:72917-73450` (toda a auth lógica), `:73433` (boot) |
| **F1** Seletor de org no header | `:12521` (menu do avatar) e ao redor |
| **F1** Modal de migração | criar HTML novo próximo a `:11671`, JS perto do gate |
| **F2** Centros de custo | `:50770-50900` (todo o `_ccLoad/_ccSave/ccAdd/ccDelete/ccSaveEdit`) |
| **F2** Catmap | `:50941-51303` |
| **F2** Loans + Modalidades | `:16357-17190` + todas as funções `saveData()` chamadas espalhadas (32 ocorrências) |
| **F2** Cartões | `:45549-47136` |
| **F2** Extrato | `:47138-50765` |
| **F2** Vendedores | `:40559-40795` |
| **F3** Fluxo de caixa | `:27532-30275` + `:28305-28358` (sub-blobs) |
| **F3** Orçamento | `:30282-31769` |
| **F3** Estrutura de custos | `:55228-56625` |
| **F3** Pessoas | `:39575-40550` |
| **F3** Receita | `:20872-23268` |
| **F3** Disponibilidades | `:59509-59707` |
| **F3** Impostos | `:56629-59505` |
| **F4** Board kanban | `:42704-45540` |
| **F4** Viagens + anexos | `:40799-42698` + Storage upload helpers (novo) |
| **F4** Support tickets | `:37520-38168` |
| **F4** Settings | `:70713-70915` + `:72534-72915` (guia progress) |
| **F4** Snapshots jsonb (DIAG/ANA/CAC/OUTRAS_OP) | `:31770`, `:59708`, `:36626`, `:37313` |
| **F5** Boot dispatch | `:73399-73420` (`fkBootApp` — substitui `*Load()` síncrono por `await *LoadCloud()`) |
| **F5** Undo/redo snapshot | `:73462-73600` (lê todo o state global — adaptar ou desabilitar temporariamente) |

---

### Critical Files for Implementation

- `index.html` — único arquivo de código (34 KEY constants, load/save, gate, boot).
- `README.md` — documentar novo modelo cloud + remover instruções de backup localStorage após Fase 5.
- `wrangler.jsonc` — adicionar header `Cache-Control: no-cache` em `/index.html` pra garantir deploy rápido; possíveis env vars `SUPABASE_URL`/`SUPABASE_ANON_KEY` se injetar via Worker.
- **(a criar)** `migrations/0001_init.sql`, `0002_*.sql`... — DDL versionada fora do HTML, aplicada via `supabase db push` em CI.
- **(a criar)** `migrations/seed_smoke.sql` — org de teste com dados sintéticos pra smoke tests de RLS antes de cada deploy.
