#!/usr/bin/env python3
"""
Forekash · fonte única da estrutura da sidebar.

Edite ESTRUTURA abaixo e rode:  python3 scripts/sidebar.py

O script remonta o menu no index.html preservando o HTML original de cada
botão (ícones, gradientes, badges) e mantém em sincronia os dois mapas que
o sistema de "módulo em destaque" usa — SB_GROUP_OF e SB_GROUP_ORDER —
que já ficaram dessincronizados em silêncio antes e quebraram o recurso.
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
INDEX = RAIZ / 'index.html'

# Módulos fixos no topo, fora de qualquer grupo — logo, imunes ao colapso.
# O Extrato está aqui porque é a fonte da verdade do sistema: some do menu se
# ficar dentro de um grupo e o grupo for fechado.
TOPO = ['dashboard', 'extrato']

# (chave, rótulo, tooltip, [módulos na ordem])
ESTRUTURA = [
    ('caixa', 'Caixa',
     'O que aconteceu de fato — dinheiro que passou pela conta',
     ['disponibilidades', 'cartoes', 'kashtrack']),

    ('projecao', 'Projeção',
     'O que você projeta receber e pagar, mês a mês, por natureza',
     ['comercial', 'receita', 'colaboradores', 'estrutura', 'impostos',
      'emprestimos', 'outras-op']),

    ('analise', 'Análise',
     'Leitura e diagnóstico — não altera nada',
     ['fluxo', 'analise', 'relatorios', 'diagnostico']),

    ('planejamento', 'Planejamento',
     'Metas, cenários e patrimônio — apoio à decisão',
     ['orcamento', 'fklab', 'patrimonio']),

    ('ferramentas', 'Ferramentas',
     'Apoio operacional — fora do fluxo financeiro',
     ['notasfiscais', 'workflows', 'kashsociety']),
]


def ident(bloco: str, n: int) -> str:
    return '\n'.join((' ' * n + l.lstrip()) if l.strip() else l
                     for l in bloco.split('\n'))


def main() -> int:
    html = INDEX.read_text(encoding='utf-8')
    linhas = html.split('\n')

    ini = next(i for i, l in enumerate(linhas)
               if '<div class="sb-section">Módulos</div>' in l)
    fim = next(i for i, l in enumerate(linhas)
               if i > ini and '<div class="sb-bottom">' in l)
    bloco = '\n'.join(linhas[ini:fim])

    botoes = {}
    for m in re.finditer(
            r'[ \t]*<button class="sb-item[^"]*"[^>]*data-module="([a-z0-9_-]+)"[\s\S]*?</button>',
            bloco):
        botoes[m.group(1)] = m.group(0).strip('\n')

    previstos = set(TOPO) | {md for _, _, _, mods in ESTRUTURA for md in mods}
    if faltando := previstos - set(botoes):
        print(f'ERRO: módulos na ESTRUTURA que não existem no HTML: {faltando}')
        return 1
    if sobrando := set(botoes) - previstos:
        print(f'ERRO: módulos no HTML fora da ESTRUTURA: {sobrando}')
        return 1

    # ── remonta o menu ──
    novo = '    <div class="sb-section">Módulos</div>\n\n'
    for md in TOPO:
        novo += ident(botoes[md], 4) + '\n\n'
    for chave, rotulo, dica, mods in ESTRUTURA:
        novo += f'    <!-- {rotulo} -->\n'
        novo += f'    <div class="sb-group" data-group="{chave}">\n'
        novo += f'      <button type="button" class="sb-group-hd" onclick="sbGroupToggle(\'{chave}\')" title="{dica}">\n'
        novo += f'        <span class="lbl">{rotulo}</span><span class="count">{len(mods)}</span><span class="caret">▾</span>\n'
        novo += '      </button>\n      <div class="sb-group-items">\n'
        for md in mods:
            novo += ident(botoes[md], 8) + '\n'
        novo += '      </div>\n    </div>\n\n'

    html = '\n'.join(linhas[:ini]) + '\n' + novo + '\n'.join(linhas[fim:])

    # ── mantém SB_GROUP_OF em sincronia ──
    pares = []
    for chave, rotulo, _, mods in ESTRUTURA:
        pares.append(f'  // {rotulo}')
        for md in mods:
            k = f"'{md}'" if '-' in md else md
            pares.append(f"  {k}: '{chave}',")
    corpo = '\n'.join(pares).rstrip(',')
    html = re.sub(r'const SB_GROUP_OF = \{[\s\S]*?\n\};',
                  'const SB_GROUP_OF = {\n' + corpo + '\n};', html, count=1)

    # ── e SB_GROUP_ORDER ──
    ordem = '\n'.join(
        f"  {chave}:{' ' * max(1, 13 - len(chave))}[{', '.join(repr(m) for m in mods)}],"
        for chave, _, _, mods in ESTRUTURA).rstrip(',')
    html = re.sub(r'const SB_GROUP_ORDER = \{[\s\S]*?\n\};',
                  'const SB_GROUP_ORDER = {\n' + ordem + '\n};', html, count=1)

    INDEX.write_text(html, encoding='utf-8')

    print('menu remontado:')
    for chave, rotulo, _, mods in ESTRUTURA:
        print(f'  {rotulo:<14} ({len(mods)})  {" · ".join(mods)}')
    print(f'\ntotal: {len(previstos)} módulos · mapas sincronizados')
    return 0


if __name__ == '__main__':
    sys.exit(main())
