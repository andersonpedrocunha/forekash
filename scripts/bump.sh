#!/usr/bin/env bash
# Forekash · bump de versão do cache antes de cada deploy.
#
# A versão precisa mudar em DOIS lugares, senão o navegador não percebe que
# há algo novo:
#   - sw.js      → const CACHE = 'forekash-v<TS>'   (dispara a atualização do SW)
#   - index.html → referência à mesma versão        (mantém os dois em sincronia)
#
# Uso:  ./scripts/bump.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TS="$(date +%s)"
VER="forekash-v${TS}"

python3 - "$VER" <<'PY'
import re, sys
ver = sys.argv[1]
for arquivo in ('sw.js', 'index.html'):
    try:
        with open(arquivo, encoding='utf-8') as f:
            txt = f.read()
    except FileNotFoundError:
        continue
    novo, n = re.subn(r'forekash-v\d+', ver, txt)
    if n:
        with open(arquivo, 'w', encoding='utf-8') as f:
            f.write(novo)
        print(f'  {arquivo}: {n} ocorrência(s) → {ver}')
    else:
        print(f'  {arquivo}: nenhuma ocorrência de forekash-v<n>')
PY

# Arquivo minúsculo com a versão. O app busca ele de tempos em tempos pra
# saber se o que está aberto no navegador ainda é o que está no servidor —
# sem baixar os 6,8 MB do index só pra comparar uma string.
printf '%s' "$VER" > version.txt
echo "  version.txt: $VER"

# valida o JS embutido no index antes de liberar o deploy
python3 - <<'PY'
import re
h = open('index.html', encoding='utf-8').read()
partes = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', h, re.DOTALL)
open('/tmp/fk_bump_check.js', 'w').write('\n'.join(partes))
PY
node --check /tmp/fk_bump_check.js && node --check sw.js
echo "OK · versão ${VER} · JS válido nos dois arquivos"
