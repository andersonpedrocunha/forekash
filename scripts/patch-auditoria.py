#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aplica a AUDITORIA DE LEITURA e o DISCLAIMER na importação/conciliação.

Por que este script existe: perdi o acesso de leitura ao index.html (ACL de
privacidade do macOS gravado no arquivo, com.apple.macl), então não consigo
editar daqui. Rodando por você, no seu terminal, funciona.

    cd "/Users/andi_twd/Documents/Claude/Projects/Empréstimos [TALLER]"
    python3 scripts/patch-auditoria.py

É IDEMPOTENTE: se um pedaço já estiver aplicado, ele pula e diz. No fim valida
o JS. Não faz commit nem deploy — isso é o passo seguinte, com deploy.sh.
"""
import re, sys, os

P = 'index.html'
if not os.path.exists(P):
    sys.exit('index.html não encontrado — rode de dentro da pasta do projeto.')

s = open(P, encoding='utf-8').read()
orig = s
feito, pulado = [], []

def troca(a, b, nome, obrigatorio=True):
    """Aplica a==>b uma vez. Se `b` já estiver lá, pula."""
    global s
    if b.strip()[:60] in s:
        pulado.append(nome); return
    n = s.count(a)
    if n != 1:
        if obrigatorio:
            print('  ! âncora não encontrada (%dx): %s' % (n, nome))
        pulado.append(nome + ' (âncora ausente)')
        return
    s = s.replace(a, b)
    feito.append(nome)

# ─────────────────────────────────────────────────────────────────────────
# 1. DISCLAIMER PERMANENTE na tela de importar/conciliar
#    Fica sempre visível, antes de qualquer arquivo entrar: diz o que a
#    leitura automática garante e o que NÃO garante. Limitação dita na hora
#    certa é informação; dita depois do erro é desculpa.
# ─────────────────────────────────────────────────────────────────────────
troca(
    "  bd.innerHTML =\n      '<div class=\"ccc-intro\">'",
    "  bd.innerHTML =\n      '<div class=\"ccc-disclaimer\">'\n"
    "    +   '<b>Leitura automática — confira antes de conciliar.</b> '\n"
    "    +   'Eu leio o arquivo e comparo a soma com o <b>total impresso na fatura</b>. '\n"
    "    +   'Se bater, digo que conferiu. Se não bater, digo quanto falta e mostro as linhas que descartei. '\n"
    "    +   'Layout de banco muda, e um formato novo pode me escapar: onde o arquivo não traz um total '\n"
    "    +   '(caso de CSV e da maioria dos OFX), <b>não tenho como provar que li tudo</b> — aí a conferência é sua.'\n"
    "    + '</div>'\n"
    "    +   '<div class=\"ccc-intro\">'",
    'disclaimer permanente na tela de importar')

troca(
    "    .ccc-faixa{display:flex;",
    "    /* Disclaimer da leitura automática. Fica ANTES de escolher o arquivo,\n"
    "       porque limitação dita na hora certa é informação — dita depois do\n"
    "       erro, é desculpa. */\n"
    "    .ccc-disclaimer{margin:0 0 14px;padding:11px 15px;border-radius:9px;font-size:.79rem;\n"
    "      line-height:1.5;background:#F8FAFC;border:1px solid #E2E8F0;color:#475569;max-width:760px}\n"
    "    .ccc-disclaimer b{color:#0F172A;font-weight:800}\n"
    "    .ccc-faixa{display:flex;",
    'CSS do disclaimer')

# ─────────────────────────────────────────────────────────────────────────
# 2. SEM TOTAL PARA CONFERIR = AVISO FORTE, NÃO NOTA DE RODAPÉ
#    Era um aviso amarelo discreto. Se eu não tenho como provar que li tudo,
#    isso tem que aparecer com o mesmo peso de um erro — e pedir confirmação
#    na hora de conciliar, igual quando a soma não fecha.
# ─────────────────────────────────────────────────────────────────────────
troca(
    "    } else if(!_audTotal){\n"
    "      html += '<div class=\"ccc-aud alerta\">'\n"
    "        + '<b>Não achei o total impresso na fatura.</b> Sem ele não consigo provar que li tudo — '\n"
    "        + 'confira a soma abaixo (' + fmt(_audSoma) + ') contra o papel antes de conciliar.'\n"
    "        + '</div>';",
    "    } else if(!_audTotal){\n"
    "      /* Sem total no arquivo eu NÃO consigo provar que li tudo. Isso tem o\n"
    "         mesmo peso de um erro e precisa aparecer assim, com a conta na mão\n"
    "         pra ele bater contra o papel. */\n"
    "      html += '<div class=\"ccc-aud alerta\">'\n"
    "        + '<b>Não consigo provar que li tudo.</b> Este arquivo não traz um total pra eu conferir '\n"
    "        + '(normal em CSV e na maioria dos OFX). Li <b>' + ((CCC_STATE.parsed.items||[]).length)\n"
    "        + '</b> transações somando <b>' + fmt(_audSoma) + '</b> — compare com a fatura antes de conciliar.'\n"
    "        + (_audDesc.length\n"
    "            ? ('<button type=\"button\" class=\"ccc-aud-btn\" onclick=\"cccVerDescartes()\">Ver as '\n"
    "               + _audDesc.length + ' linhas que descartei</button>')\n"
    "            : '')\n"
    "        + '</div>';",
    'aviso forte quando não há total no arquivo')

troca(
    "    const p2 = CCC_STATE.parsed;\n"
    "    const tot = (p2 && p2.totalFatura) || 0;\n"
    "    if(tot > 0 && !CCC_STATE.leituraLiberada){",
    "    const p2 = CCC_STATE.parsed;\n"
    "    const tot = (p2 && p2.totalFatura) || 0;\n"
    "    /* Arquivo sem total: também confirma. Não é alarme falso — é dizer que\n"
    "       a conferência não pôde ser feita por mim, e que segue por conta dele. */\n"
    "    if(p2 && !tot && !CCC_STATE.leituraLiberada){\n"
    "      const soma = (p2.items || []).reduce((a2, x) => a2 + (parseFloat(x.valor) || 0), 0);\n"
    "      const f = v => 'R$ ' + Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2});\n"
    "      const ok = confirm(\n"
    "        'Não consigo provar que li tudo.\\n\\n'\n"
    "        + 'Este arquivo não traz um total pra eu conferir.\\n'\n"
    "        + 'Li ' + (p2.items||[]).length + ' transações somando ' + f(soma) + '.\\n\\n'\n"
    "        + 'Confira esse número contra a fatura antes de seguir.\\n\\n'\n"
    "        + 'Conferi e quero conciliar?');\n"
    "      if(!ok) return;\n"
    "      CCC_STATE.leituraLiberada = true;\n"
    "    }\n"
    "    if(tot > 0 && !CCC_STATE.leituraLiberada){",
    'confirmação quando não há total para conferir')

# ─────────────────────────────────────────────────────────────────────────
# 3. LINHA COM CARA DE COMPRA DESCARTADA APARECE MESMO COM A SOMA FECHANDO
#    Soma fechada é forte, mas não é prova absoluta: um valor lido a mais
#    pode compensar outro que ficou de fora. Se descartei algo que parece
#    compra, isso fica dito.
# ─────────────────────────────────────────────────────────────────────────
troca(
    "    if(_audOk){\n"
    "      html += '<div class=\"ccc-aud ok\">'\n"
    "        + '<b>Leitura conferida.</b> As ' + ((CCC_STATE.parsed.items||[]).length)\n"
    "        + ' transações somam exatamente o total impresso na fatura (' + fmt(_audTotal) + ').'\n"
    "        + '</div>';",
    "    if(_audOk){\n"
    "      /* Soma fechada é forte, mas não é prova absoluta: um valor lido a mais\n"
    "         poderia compensar outro que ficou de fora. Se descartei alguma linha\n"
    "         com cara de compra, isso fica dito mesmo assim. */\n"
    "      const _susp = _audDesc.filter(d => /\\d{1,2}[\\/\\s][A-Z0-9]{2,3}/i.test(d.linha)\n"
    "                                       && /\\d+[.,]\\d{2}/.test(d.linha)).length;\n"
    "      html += '<div class=\"ccc-aud ok\">'\n"
    "        + '<b>Leitura conferida.</b> As ' + ((CCC_STATE.parsed.items||[]).length)\n"
    "        + ' transações somam exatamente o total impresso na fatura (' + fmt(_audTotal) + ').'\n"
    "        + (_susp\n"
    "            ? ('<button type=\"button\" class=\"ccc-aud-btn\" onclick=\"cccVerDescartes()\">'\n"
    "               + 'Ainda assim, veja ' + _susp + ' linha(s) que descartei</button>')\n"
    "            : '')\n"
    "        + '</div>';",
    'avisa descarte suspeito mesmo com a soma fechando')

# ─────────────────────────────────────────────────────────────────────────
if s == orig:
    print('\nNada mudou — tudo já estava aplicado.')
else:
    # valida o JS antes de gravar
    import subprocess, tempfile
    tmp = tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8')
    tmp.write(s); tmp.close()
    node = subprocess.run(['node', '-e', '''
      const fs=require('fs');const h=fs.readFileSync(process.argv[1],'utf8');
      const m=[...h.matchAll(/<script(?![^>]*src=)[^>]*>([\\s\\S]*?)<\\/script>/g)];
      let bad=0;m.forEach(x=>{try{new Function(x[1])}catch(e){bad++;console.log(e.message)}});
      process.exit(bad?1:0);''', tmp.name], capture_output=True, text=True)
    os.unlink(tmp.name)
    if node.returncode != 0:
        sys.exit('JS INVÁLIDO, nada foi gravado:\n' + node.stdout + node.stderr)
    open(P, 'w', encoding='utf-8').write(s)

print('\nAPLICADO:')
for f in feito:   print('  ✓', f)
if pulado:
    print('JÁ ESTAVA / PULADO:')
    for p in pulado: print('  ·', p)
print('\nJS válido. Para subir:')
print('  ./scripts/deploy.sh "Auditoria da leitura: aviso sempre que eu não puxar tudo"')
