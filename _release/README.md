# Empréstimos · Forekash

Aplicação web single-page para gestão financeira (lançamentos, receitas, custos, empréstimos, fluxo de caixa, demonstrativos DRC/DRE).

## Como instalar no servidor

A aplicação é **single-file**: tudo (HTML + CSS + JS) está dentro do arquivo `emprestimos.html`. Não precisa de build, dependências ou backend.

### Opção 1 — Servidor estático (Nginx, Apache, etc.)
1. Coloca o arquivo `emprestimos.html` na pasta web do servidor (ex: `/var/www/html/`).
2. Acessa via navegador: `https://seu-dominio.com/emprestimos.html`

### Opção 2 — Hospedagem simples (GitHub Pages, Netlify, Vercel, S3)
1. Faz upload do arquivo num bucket/repo.
2. Aponta o domínio.

### Opção 3 — Local (file://)
Abre direto no navegador clicando 2x no arquivo. Funciona, mas algumas features (ex: anexos via drag&drop) podem ter limitações de segurança.

## Persistência

Toda a informação fica em `localStorage` do navegador (não há banco de dados). Ou seja:
- Cada usuário tem seus próprios dados, isolados por navegador.
- Limpar o cache do navegador apaga tudo. Faça backup antes.
- Para multi-usuário, recomenda-se evoluir pra backend (próximo passo).

## Compatibilidade

Recomendado: Chrome, Edge, Firefox ou Safari recentes (>= 2023). Suporta Cmd+Shift+R / Ctrl+Shift+R pra hard reload se algo travar em cache.

## Backup dos dados do usuário

Os dados ficam em chaves de `localStorage` com prefixo `taller_*` e `forekash_*`. Para fazer backup, abra o console do navegador (F12) e:

```javascript
JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
```

Copie o resultado num arquivo `.json`.

Para restaurar:
```javascript
const dados = JSON.parse(/* cole o JSON */);
for(const [k, v] of Object.entries(dados)) localStorage.setItem(k, v);
location.reload();
```

## Versão

`emprestimos_v20260428_191305.html` — abril 2026.
