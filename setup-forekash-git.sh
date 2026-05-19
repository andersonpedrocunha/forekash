#!/usr/bin/env bash
# ============================================================
# setup-forekash-git.sh
# Inicializa o repositório Git do projeto Forekash, faz o
# commit inicial e prepara para push no GitHub.
# Uso: bash setup-forekash-git.sh
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo ">> Trabalhando em: $PROJECT_DIR"

# 1) Limpa qualquer .git anterior que tenha ficado capenga
if [ -d ".git" ]; then
  echo ">> Removendo .git existente (estava travado)..."
  rm -rf .git
fi

# 2) Inicializa repo
echo ">> git init (branch main)"
git init -b main

# 3) Configura identidade local do repo
git config user.email "anderson@taller.net.br"
git config user.name "Anderson"

# 4) Garante .gitignore mínimo (mantém os .bak.* conforme pedido)
if [ ! -f ".gitignore" ]; then
  cat > .gitignore << 'GITIGNORE'
# macOS
.DS_Store

# Editores
.vscode/
.idea/
*.swp
*~
GITIGNORE
fi

# 5) Stage + commit
echo ">> Adicionando arquivos..."
git add -A

echo ">> Commit inicial..."
git commit -m "Initial commit: Forekash (ex-Empréstimos TALLER)

Aplicação single-page de gestão financeira: lançamentos, receitas,
custos, empréstimos, fluxo de caixa, kanban de recebíveis e DRC/DRE.

- emprestimos.html: aplicação completa (HTML+CSS+JS single-file)
- _release/: pacote pronto para deploy
- *.bak.*: snapshots históricos de evolução
- README.md: visão geral + instruções de deploy para forekash.com.br"

echo ""
echo "============================================================"
echo "  Repositório local pronto. Resumo:"
echo "============================================================"
git log --oneline
echo ""
echo "Total de arquivos versionados:"
git ls-files | wc -l
echo ""
echo "============================================================"
echo "  Próximos passos para subir no GitHub:"
echo "============================================================"
cat << 'NEXT'

1) No site do GitHub (https://github.com/new):
     - Repository name: forekash
     - Description:    Forekash - gestão financeira single-page
     - Visibility:     Private (recomendado) ou Public
     - NÃO marcar "Initialize with README" (já temos um)

2) Copie a URL do repo recém-criado, ex:
     https://github.com/SEU_USUARIO/forekash.git

3) Aqui no terminal, rode (substitua a URL):

     git remote add origin https://github.com/SEU_USUARIO/forekash.git
     git push -u origin main

4) Se o GitHub pedir autenticação, use um Personal Access Token
   (Settings → Developer settings → Personal access tokens → Tokens classic).
   Para evitar digitar toda vez, instale o GitHub CLI:
     brew install gh
     gh auth login

5) Deploy em forekash.com.br (depois do push):
     - GitHub Pages: Settings → Pages → branch main → save,
       e configura o CNAME do domínio.
     - OU Netlify/Vercel/Cloudflare Pages: conecta o repo
       e adiciona o domínio custom no painel.
NEXT
