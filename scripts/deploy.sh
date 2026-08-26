#!/usr/bin/env bash
# Sobe e SÓ volta quando o site realmente serve a versão nova.
#
# Existe porque "git push" não é "no ar": a Cloudflare leva 1 a 3 minutos, e
# nesse meio-tempo o site ainda entrega o build anterior. Dizer que subiu antes
# disso faz uma correção certa parecer quebrada.
#
#   ./scripts/deploy.sh "mensagem do commit"
set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-}"
[ -z "$MSG" ] && { echo "uso: ./scripts/deploy.sh \"mensagem\""; exit 1; }

# Sintaxe válida não é código vivo: um /* sem fechar engole função e passa
# batido no validador do bump.
node scripts/check-funcoes.js || { echo "abortado: código engolido por comentário"; exit 1; }

./scripts/bump.sh
VER="$(cat version.txt)"

git add -A
git commit -q -m "$MSG"
git push -q origin main
echo "push feito · aguardando $VER ficar no ar..."

for i in $(seq 1 30); do
  sleep 10
  # cache-buster: sem ele a borda pode devolver o build anterior
  AR="$(curl -s --max-time 20 "https://forekash.com.br/version.txt?x=$(date +%s)$i" || true)"
  if [ "$AR" = "$VER" ]; then
    # confirma também SEM cache-buster (é o que o navegador dele pede)
    for j in 1 2 3 4 5 6; do
      BORDA="$(curl -s --max-time 20 "https://forekash.com.br/version.txt" || true)"
      [ "$BORDA" = "$VER" ] && { echo "NO AR · $VER (origem e borda)"; exit 0; }
      sleep 10
    done
    echo "NO AR na origem · $VER — borda ainda com $BORDA (propaga em instantes)"
    exit 0
  fi
  echo "  ...ainda $AR"
done
echo "TIMEOUT: passou 5 min e o site ainda não serve $VER — verificar o build na Cloudflare"
exit 1
