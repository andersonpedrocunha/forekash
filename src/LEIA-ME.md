# MR KASH no Slack — o que falta pra ligar

O código está pronto e testado localmente. O que resta são as chaves e o app
do Slack, que só você pode criar.

## A ordem importa

O Slack testa a URL na hora de salvar Event Subscriptions, e o Worker só
responde depois de ter o Signing Secret — que só existe depois do app criado.
Fazer tudo de uma vez trava nesse círculo. Por isso: cria o app sem URL, pega
as chaves, publica, e só então liga as URLs.

## 1. Criar o app (sem URL ainda)

Em `api.slack.com/apps` → **Create New App** → **From an app manifest** →
workspace da TALLER.

A tela abre na aba **JSON**. Cola o conteúdo de `slack-manifest.json` ali e
Next. (O `slack-manifest.yaml` é o mesmo conteúdo comentado, para ler; se usar
esse, clique antes na aba **YAML** — colar YAML na aba JSON dá
*"We can't translate a manifest with errors"*.)

Depois:

- **Install to Workspace** → autoriza → copia o **Bot User OAuth Token**
  (`xoxb-...`) em *OAuth & Permissions*.
- **Basic Information** → copia o **Signing Secret**.
- Ainda em Basic Information, *Display Information*: sobe o `mrkash-novo.png`
  (1024×1024, que está na raiz do projeto) como ícone.

## 2. Variáveis na Cloudflare, e publicar

Preenche as variáveis da tabela abaixo e sobe com `./scripts/deploy.sh`.
Confere em `https://forekash.com.br/api/mrkash/ping` — tem que voltar
`{"ok":true,...}`. Enquanto não voltar, não adianta seguir.

## 3. Ligar as URLs (agora o Slack consegue verificar)

- **Event Subscriptions** → Enable → Request URL:
  `https://forekash.com.br/api/slack/events`
  Tem que aparecer *Verified*. Em *Subscribe to bot events*, adiciona
  `app_mention` e `message.im`. Salva.
- **Slash Commands** → Create New Command → `/mrkash` → Request URL:
  `https://forekash.com.br/api/slack/comando` → descrição "Pergunta pro MR KASH".
- Se o Slack pedir pra reinstalar o app depois dessas mudanças, reinstala.

Por último, convida ele pro canal dos avisos: `/invite @MR KASH`.

## As variáveis

No painel da Cloudflare → Workers & Pages → `forekash` → Settings → Variables
and Secrets. As quatro primeiras como **Secret** (ficam ocultas depois de
salvas); o resto pode ser texto.

| nome | o que é |
|---|---|
| `ANTHROPIC_API_KEY` | a mesma key que você usa no app — mas aqui ela mora no servidor |
| `SLACK_BOT_TOKEN` | o `xoxb-...` |
| `SLACK_SIGNING_SECRET` | de Basic Information |
| `SUPABASE_SERVICE_KEY` | painel do Supabase → Project Settings → API → `service_role` |
| `SUPABASE_URL` | `https://xgjqnwdhqlxhkgwowwej.supabase.co` |
| `FOREKASH_ORG_ID` | `c7ba3646-2b74-49d5-acc2-b363352d06ed` |
| `ANTHROPIC_WORKSPACE_ID` | `wrkspc_0174fz36C7RtPvEkfqsJBDJn` (sua key é de usuário, precisa disto) |
| `SLACK_CANAL_EQUIPE` | o ID do canal dos avisos (`C...`, pega em Ver detalhes do canal) |
| `MRK_SLACK_USERS` | quem pode PERGUNTAR — IDs separados por espaço. Começa só com o seu |
| `MRK_DIA_NOTA` | dia do mês do lembrete da nota (padrão `1`) |
| `MRK_DIA_BENEFICIOS` | dia do lembrete de benefícios (padrão `7`) |

Opcionais: `MRK_TEXTO_NOTA` e `MRK_TEXTO_BENEFICIOS` trocam o texto dos avisos
sem mexer no código. `MRK_MODEL` troca o modelo.

## O que ele não vê no Slack

Pagamento individual e dívida **não são enviados** ao modelo — não é instrução
de se conter, é ausência do dado. Perguntando o salário de alguém, ele responde
que não sai por aqui, e não consegue estimar nem dividindo o total, porque o
total por pessoa não está lá.

O que continua saindo: o **agregado** da folha (quantas pessoas, custo do mês,
% da saída), porque isso é o negócio e não gera atrito. O que some:

| sai do quadro | onde vazava |
|---|---|
| bloco com o valor de cada pessoa | `## FOLHA` |
| lançamento nominal de folha, comissão e vale | `## ÚLTIMOS LANÇAMENTOS` |
| pessoa da folha na lista de quem depositou | `## ENTRADA por pagador` — era por aqui que o "Rafa" devolvendo empréstimo aparecia |
| categorias de empréstimo e financiamento | `## SAÍDA por categoria` |
| financeira na lista de pagadores | a "NEXOOS Sociedade de Empréstimo" denunciava que a empresa toma crédito |

`MRK_SLACK_LIBERAR` solta o que você quiser: `pessoa`, `divida`, ou
`pessoa divida`. **Sem a variável, tudo fica travado** — esquecer de
configurar não pode virar vazamento.

Isso vale só para o Slack. No app, no seu navegador, ele continua vendo tudo.

## 3. Conferir

- `https://forekash.com.br/api/mrkash/ping` → `{"ok":true,...}` e `cron:true`
  quando o canal estiver configurado. Não devolve número nenhum.
- No Slack: `/mrkash quanto entrou em setembro?`
- Os avisos disparam sozinhos no dia configurado, 17:30 de São Paulo.

## Como está dividido

- `worker.js` — as duas bocas: `scheduled` (avisos) e `fetch` (Slack + o site).
  Tudo que não começa com `/api/` vai pro `ASSETS`, então o site não muda.
- `forekash.js` — lê o Supabase e monta o mesmo quadro de números que o app
  monta no navegador. Só lê; nada é gravado por aqui.
- `mrkash.js` — a voz, a chamada do modelo, o Slack e a assinatura.

## O que ele NÃO faz

Não salva, não altera e não apaga nada. Do lado do Slack ele só lê o banco.

Quem não está em `MRK_SLACK_USERS` não recebe número: leva "Essa conversa não
é tua.". Os avisos do canal são texto fixo e não contêm valor nenhum — é a
separação de propósito entre falar com você e falar com a empresa.
