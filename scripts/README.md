# scripts/

Scripts de manutenção do Forekash que rodam **fora** do app (em local ou
GitHub Actions).

## almanaque-fetch-events.mjs

Script que alimenta a tabela `kash_almanaque_eventos` no Supabase com eventos
recentes descobertos via Gemini. Rodado **automaticamente toda segunda às 06:00 UTC**
pelo workflow `.github/workflows/almanaque-weekly-update.yml`.

### Como funciona
1. Define janela: últimos 30 dias
2. Pede ao **Gemini 2.5 Flash** uma lista de eventos financeiros/econômicos importantes
3. Valida o shape (datas, severidade, fontes)
4. Insere no Supabase com `approved=true` via service_role (bypassa RLS)
5. Frontend faz merge com o seed local na próxima abertura do ALMANAQUE

### Secrets necessárias (GitHub → Settings → Secrets and variables → Actions)

| Nome | Onde pegar |
|---|---|
| `GEMINI_API_KEY` | <https://aistudio.google.com/apikey> · **free tier** (15 req/min) basta |
| `SUPABASE_URL` | `https://xgjqnwdhqlxhkgwowwej.supabase.co` (já existe) |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → **service_role** (NUNCA expor no frontend) |

### Rodar local pra testar
```sh
GEMINI_API_KEY=AIxxx... \
SUPABASE_URL=https://xgjqnwdhqlxhkgwowwej.supabase.co \
SUPABASE_SERVICE_KEY=eyJxxx... \
node scripts/almanaque-fetch-events.mjs
```

### Rodar manualmente via GitHub
GitHub → Actions → **ALMANAQUE · busca eventos novos semanalmente** → **Run workflow**

### Custo
**Zero** — usa free tier do Gemini API (não precisa billing). Free tier dá 15
requisições por minuto, e o cron faz 1 chamada por semana.

### Comportamento se algo falhar
- Sem secrets configurados → workflow loga warning e termina com `exit 0` (não fica vermelho no GH Actions)
- Gemini retorna vazio → não insere nada, encerra OK
- Eventos com shape inválido → rejeitados individualmente, válidos seguem
- Erro de rede → log + continua próximos
- App offline → ALMANAQUE mostra só seed local + indica "servidor offline" no rodapé

### Editar a frequência
No workflow YAML, mude o cron:
```yaml
schedule:
  - cron: '0 6 * * 1'   # segunda 06:00 UTC = atual
  - cron: '0 6 * * *'   # diário 06:00 UTC
  - cron: '0 6 1 * *'   # mensal dia 1
```

### Estrutura da tabela
Migração: [`migrations/0017_kash_almanaque_eventos.sql`](../migrations/0017_kash_almanaque_eventos.sql)

Inserir manualmente via Supabase dashboard? Use o SQL Editor:
```sql
insert into kash_almanaque_eventos
  (d, y, lugar, evento, "desc", tipo, severidade, detalhes, economistas, doutrinas, fontes, approved, source)
values
  ('05-15', 2025, '🇧🇷', 'Novo evento', 'Resumo...', 'evento', 4,
   'Narrativa longa...',
   '["Pessoa A","Pessoa B"]'::jsonb,
   '["Conceito X"]'::jsonb,
   '[{"n":"Fonte oficial","u":"https://..."}]'::jsonb,
   true, 'manual');
```
