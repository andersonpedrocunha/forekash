# Forekash

Aplicação web single-page para gestão financeira pessoal e de pequenos negócios: lançamentos, receitas, custos, empréstimos, fluxo de caixa, kanban de recebíveis e demonstrativos DRC/DRE.

> Sucessora do projeto interno "Empréstimos [TALLER]". Domínio: [forekash.com.br](https://forekash.com.br).

## Como funciona

Toda a aplicação está em um único arquivo HTML (`index.html`) — HTML + CSS + JS embutidos. Sem build, sem dependências, sem backend. Os dados ficam em `localStorage` do navegador.

## Deploy

### Opção 1 — Cloudflare Pages / Netlify / Vercel
Conecte o repo, deploy estático (sem build). Configure o domínio custom `forekash.com.br` no painel do provedor.

### Opção 2 — GitHub Pages
1. Em **Settings → Pages**, habilite Pages na branch `main`, pasta raiz.
2. Configure o CNAME do `forekash.com.br` apontando para `<usuario>.github.io`.

### Opção 3 — Servidor estático (Nginx, Apache, S3, etc.)
1. Coloque `index.html` na pasta web (ex: `/var/www/html/`).
2. Acesse `https://forekash.com.br`.

### Opção 4 — Local (file://)
Abra direto no navegador. Funciona mas algumas features (drag&drop, anexos) podem ter restrição de segurança.

## Persistência dos dados

Os dados ficam em `localStorage` com prefixos `taller_*` e `forekash_*`. Cada navegador tem seus próprios dados isolados.

**Backup (no console F12):**
```javascript
JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
```

**Restaurar:**
```javascript
const dados = JSON.parse(/* cole o JSON aqui */);
for (const [k, v] of Object.entries(dados)) localStorage.setItem(k, v);
location.reload();
```

## Estrutura do repositório

- `index.html` — aplicação principal (single-file).
- `emprestimos.html.bak.*` — backups históricos de pontos de evolução (catmap, dkb, kanban, etc.) do nome anterior do arquivo.
- `_release/` — pacote pronto para deploy + README de instalação.
- `mrkash.png` — logo / asset.
- `smoke-rec-lock.js` — smoke test para lock de recebíveis.

## Próximos passos

- Migrar persistência pra backend (multi-usuário).
- Autenticação.
- Sincronização entre dispositivos.

## Compatibilidade

Chrome, Edge, Firefox e Safari recentes (>= 2023).
