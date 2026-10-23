/* ═══════════════════════════════════════════════════════════════════════
   OS NÚMEROS, FORA DO NAVEGADOR
   ═══════════════════════════════════════════════════════════════════════
   O MR KASH do app lê variáveis de módulo (`receita`, `pessoas`, `extratoData`)
   que só existem numa aba logada. No Slack ele precisa responder com a aba
   fechada, então aqui os mesmos dados vêm direto do Supabase e viram o mesmo
   texto que vai junto da pergunta.

   O que NÃO se repete daqui: nada é salvo. Este lado só lê.                */

const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

const brl = v => (Math.abs(Number(v) || 0)).toLocaleString('pt-BR',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Com sinal onde o número pode ser negativo. O formatador do app aplica
   Math.abs — lá serve, porque os valores já são magnitudes; aqui um mês de
   prejuízo chegaria ao modelo como lucro. */
const brlSgn = v => { const n = Number(v) || 0; return (n < 0 ? '-' : '') + brl(n); };
const dia = s => { const p = String(s || '').slice(0,10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(s || ''); };

/* Mesma chave de casamento do app: a contraparte do extrato vem como razão
   social ("BLOOM TECNOLOGIA LTDA") e a linha da Receita é "BLOOM". */
export function nomeChave(nome){
  const n = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g,'')
            .toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(!n) return '';
  const p = n.split(' ');
  return (p[0].length <= 2 && p[1]) ? (p[0] + ' ' + p[1]) : p[0];
}

// ── Supabase ────────────────────────────────────────────────────────────
async function sb(env, caminho){
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + caminho, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY,
               Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY }
  });
  if(!r.ok) throw new Error('Supabase ' + r.status + ' em ' + caminho + ': ' + (await r.text()).slice(0,200));
  return r.json();
}

export async function carregar(env){
  const org = env.FOREKASH_ORG_ID;
  const [blobs, lans] = await Promise.all([
    sb(env, `module_blobs?org_id=eq.${org}&select=module,data`),
    /* O extrato é a espinha: é o dinheiro que de fato passou pela conta.
       Sem limite de página explícito o PostgREST corta em 1000 — hoje são
       ~820 linhas, mas isso cresce todo mês. */
    sb(env, `extrato_lancamentos?org_id=eq.${org}&select=data,valor,tipo,status,categoria,conta,contraparte,descricao,numero_documento,data_pagamento,metadata&limit=20000`)
  ]);
  const mods = {};
  for(const b of blobs) mods[b.module] = b.data;
  const ext = lans.map(l => ({
    data: l.data, valor: Number(l.valor) || 0, tipo: l.tipo, status: l.status,
    categoria: l.categoria, conta: l.conta, contraparte: l.contraparte,
    descricao: l.descricao, numeroDocumento: l.numero_documento,
    dataPagamento: l.data_pagamento, ...(l.metadata || {})
  }));
  return {
    ext,
    receita:  mods.receita  || null,
    pessoas:  mods.pessoas  || null,
    dispo:    (mods.dispo && mods.dispo.state) || mods.dispo || null,
    catmap:   mods.catmap_local || null,
    hoje:     new Date()
  };
}

/* Categorias que contam como receita operacional — mesma regra do app:
   quem tem moduloId 'receita' no mapa de categorias. */
function catsReceita(d){
  const s = new Set();
  for(const c of ((d.catmap && d.catmap.categorias) || []))
    if(c && c.moduloId === 'receita' && c.nome) s.add(String(c.nome).trim().toLowerCase());
  return s;
}

/* ── O que NÃO sai daqui ──────────────────────────────────────────────
   A trava é não mandar o dado, não pedir pro modelo se conter: o que não
   chega não vaza por pergunta esperta, por insistência nem por tradução.

   Duas travas independentes, porque são dois riscos diferentes:

   `semPessoa` — o TOTAL da folha pode sair; quanto CADA UM ganha, não.
   Salário individual circulando num canal gera atrito entre quem ficou
   sabendo e quem não devia. Então cai o bloco por pessoa e caem os
   lançamentos nominais de folha, que trazem nome e valor na mesma linha.

   `semDivida` — o que a empresa deve não é assunto de time.

   Identificação por dois caminhos porque um só não cobre: o mapa liga a
   categoria ao módulo de origem (`pessoas`, `emprestimos`), mas o extrato
   tem categoria digitada à mão que nunca passou pelo mapa — "Empréstimo" no
   singular, com R$ 121 mil em 2026, é um desses.                          */
const RX_PESSOA = /folha|sal[áa]rio|pr[óo]\s*-?\s*labore|inss\s*rb|comiss|adiantamento|vale/i;
const RX_DIVIDA = /empr[ée]stimo|financiamento/i;
const MOD_PESSOA = new Set(['pessoas', 'comissoes']);
const MOD_DIVIDA = new Set(['emprestimos']);

function filtro(d, op){
  const porMod = (set) => {
    const s = new Set();
    for(const c of ((d.catmap && d.catmap.categorias) || []))
      if(c && c.nome && set.has(c.moduloId)) s.add(c.nome.trim().toLowerCase());
    return s;
  };
  const catsPessoa = porMod(MOD_PESSOA), catsDivida = porMod(MOD_DIVIDA);
  const ehPessoa = n => catsPessoa.has(n) || RX_PESSOA.test(n);
  const ehDivida = n => catsDivida.has(n) || RX_DIVIDA.test(n);
  const pessoasDaFolha = new Set(
    ((d.pessoas && d.pessoas.people) || [])
      .map(p => p && p.nome && nomeChave(p.nome)).filter(Boolean));
  return {
    // categoria sai da QUEBRA por categoria (o total da folha é agregado, pode ficar)
    catFora(cat){
      const n = String(cat || '').trim().toLowerCase();
      return !!n && op.semDivida && ehDivida(n);
    },
    // lançamento nominal: nome + valor na mesma linha
    lancFora(l){
      const n = String((l && l.categoria) || '').trim().toLowerCase();
      if(!n) return false;
      if(op.semPessoa && ehPessoa(n)) return true;
      if(op.semDivida && ehDivida(n)) return true;
      return false;
    },
    /* A lista de pagadores entrou pela porta dos fundos: não é categoria, é
       nome de quem depositou. Lá apareciam o "Rafa" devolvendo empréstimo —
       assunto financeiro de uma pessoa da folha — e a "NEXOOS SOCIEDADE DE
       EMPRESTIMO", que denuncia que a empresa toma crédito. */
    pagadorFora(nome){
      const bruto = String(nome || '').trim();
      if(!bruto) return false;
      if(op.semDivida && ehDivida(bruto.toLowerCase())) return true;
      if(op.semPessoa){
        const k = nomeChave(bruto);
        if(k && pessoasDaFolha.has(k)) return true;
      }
      return false;
    }
  };
}

// ── Briefing ────────────────────────────────────────────────────────────
/* `op` liga as travas: no Slack `{semPessoa:true, semDivida:true}`;
   no uso privado, nada. */
export function briefing(d, op){
  op = op || {};
  const f = filtro(d, op);
  const L = [];
  const hoje = d.hoje.toISOString().slice(0,10);
  const ano = hoje.slice(0,4);
  const doAno = s => String(s || '').slice(0,4) === ano;

  L.push('# FOREKASH — panorama financeiro em ' + hoje);
  L.push('Valores em reais. Ano corrente: ' + ano + '.');

  // caixa
  const contas = (d.dispo && d.dispo.contas) || [];
  const semSaldo = contas.filter(c => c && c.ativo !== false && !c.saldoInicialMes).length;
  if(contas.length && semSaldo === contas.filter(c => c && c.ativo !== false).length){
    L.push('\n## CAIXA\nINDISPONÍVEL: nenhuma das ' + contas.length + ' contas tem saldo inicial ' +
           'preenchido, então o saldo não é calculável. Se perguntarem de caixa, diga que falta ' +
           'informar o saldo inicial no módulo Disponibilidades — e NÃO estime somando o extrato.');
  }

  // realizado mês a mês + categorias + pagadores
  const porMes = {}, porCat = {}, porPagador = {};
  let ent = 0, sai = 0;
  for(const l of d.ext){
    if(!doAno(l.data) || (l.tipo !== 'ganho' && l.tipo !== 'gasto')) continue;
    const v = Math.abs(l.valor); if(!v) continue;
    const m = String(l.data).slice(0,7);
    const b = porMes[m] || (porMes[m] = { e:0, s:0 });
    if(l.tipo === 'ganho'){
      b.e += v; ent += v;
      const c = String(l.contraparte || '').trim();
      if(c && !f.pagadorFora(c)) porPagador[c] = (porPagador[c] || 0) + v;
    } else {
      b.s += v; sai += v;
      const c = String(l.categoria || 'Sem categoria').trim();
      if(!f.catFora(c)) porCat[c] = (porCat[c] || 0) + v;
    }
  }
  const meses = Object.keys(porMes).sort();
  if(meses.length){
    L.push('\n## REALIZADO ' + ano + ' — mês a mês (o que passou pela conta)\n' +
      meses.map(m => '- ' + MES[+m.slice(5,7) - 1] + ': entrou ' + brl(porMes[m].e) +
        ' · saiu ' + brl(porMes[m].s) + ' · resultado ' + brlSgn(porMes[m].e - porMes[m].s)).join('\n') +
      '\nAcumulado: entrou ' + brl(ent) + ' · saiu ' + brl(sai) + ' · resultado ' + brlSgn(ent - sai));
  }
  const cats = Object.entries(porCat).sort((a,b) => b[1] - a[1]).slice(0, 18);
  if(cats.length)
    L.push('\n## SAÍDA ' + ano + ' por categoria\n' + cats.map(([c,v]) =>
      '- ' + c + ': ' + brl(v) + (sai ? ' (' + Math.round(v/sai*100) + '%)' : '')).join('\n'));
  const pags = Object.entries(porPagador).sort((a,b) => b[1] - a[1]).slice(0, 15);
  if(pags.length)
    L.push('\n## ENTRADA ' + ano + ' por pagador\n' + pags.map(([c,v]) =>
      '- ' + c + ': ' + brl(v) + (ent ? ' (' + Math.round(v/ent*100) + '%)' : '')).join('\n'));

  // cobrança: faturado na Receita × crédito no Extrato
  const cob = cobranca(d, ano);
  if(cob.length)
    L.push('\n## COBRANÇA ' + ano + ' por cliente (faturado na Receita × crédito no Extrato)\n' +
      cob.map(c => '- ' + c.nome + ': faturado ' + brl(c.faturado) + ' · recebido ' + brl(c.recebido) +
        (c.aberto > 0.5 ? ' · EM ABERTO ' + brl(c.aberto) : '')).join('\n') +
      '\nOBS: a diferença inclui retenção de imposto e taxa de antecipação de boleto, ' +
      'não é só inadimplência.');

  // folha — só o agregado quando a trava está ligada
  const gente = folhaDoAno(d, ano);
  if(gente.length){
    if(op.semPessoa){
      const total = gente.reduce((s,p) => s + p.ultimo, 0);
      L.push('\n## FOLHA ' + ano + '\n' + gente.length + ' pessoas na folha. ' +
             'Custo do último mês pago: ' + brl(total) + '.\n' +
             'O quanto CADA pessoa ganha não está neste quadro e você não tem como deduzir. ' +
             'Se perguntarem o salário de alguém, diga que isso não sai por aqui — e não ' +
             'estime, não compare pessoas e não divida o total pelo número de gente.');
    } else {
      L.push('\n## FOLHA ' + ano + ' (indexada pelo mês do PAGAMENTO, não da competência)\n' +
        gente.map(p => '- ' + p.nome + ': ' + brl(p.ultimo) + '/mês · ' + p.meses + ' meses pagos' +
          (p.ativo === false ? ' (DESLIGADO)' : '')).join('\n') +
        '\nOBS: sócio e CLT entram pelo líquido; comissão e hora extra ficam fora da folha.');
    }
  }

  /* Os últimos lançamentos trazem nome e valor na mesma linha — é por aqui
     que o salário de alguém escaparia sem ninguém perguntar por folha. */
  const ult = d.ext.filter(l => l && l.data && !f.lancFora(l))
    .sort((a,b) => String(b.data).localeCompare(String(a.data))).slice(0, 12);
  if(ult.length)
    L.push('\n## ÚLTIMOS LANÇAMENTOS\n' + ult.map(l => '- ' + String(l.data).slice(0,10) + ' · ' +
      (l.tipo === 'ganho' ? '+' : l.tipo === 'gasto' ? '-' : '~') + brl(l.valor) + ' · ' +
      (l.contraparte || l.descricao || '?') + (l.categoria ? ' [' + l.categoria + ']' : '')).join('\n'));

  const fora = [];
  if(op.semPessoa) fora.push('pagamento individual de qualquer pessoa (salário, pró-labore, comissão, vale)');
  if(op.semDivida) fora.push('empréstimos, financiamentos e o que a empresa deve');
  if(fora.length)
    L.push('\n## FORA DESTE QUADRO\n' + fora.map(x => '- ' + x).join('\n') +
           '\nIsso foi removido de propósito, não está faltando por erro. Se perguntarem, ' +
           'diga que não sai por aqui e siga. Não tente reconstruir por subtração: a saída ' +
           'total do mês inclui o que foi removido, então a conta não fecharia e o número ' +
           'que você inventasse estaria errado.');

  return L.join('\n');
}

export function cobranca(d, ano){
  if(!d.receita || !d.receita.years || !d.receita.years[ano]) return [];
  const fat = {}, nome = {};
  for(const r of (d.receita.years[ano].clients || [])){
    const cli = (d.receita.clientes || []).find(c => c.id === r.clienteId);
    const n = (cli && cli.nome) || r.nome || '';
    const k = nomeChave(n); if(!k) continue;
    nome[k] = n;
    for(const m of MES){
      const c = (r.meses || {})[m];
      if(c) fat[k] = (fat[k] || 0) + (Number(c.valor) || 0);
    }
  }
  const cats = catsReceita(d), rec = {};
  for(const l of d.ext){
    if(l.tipo !== 'ganho' || !l.contraparte) continue;
    if(cats.size && !cats.has(String(l.categoria || '').trim().toLowerCase())) continue;
    const dt = String(l.dataPagamento || l.data || '').slice(0,10);
    if(dt.slice(0,4) !== ano) continue;
    const k = nomeChave(l.contraparte); if(!k) continue;
    rec[k] = (rec[k] || 0) + Math.abs(Number(l.valorPago != null ? l.valorPago : l.valor) || 0);
  }
  return Object.keys(fat).map(k => ({
    nome: nome[k] || k, faturado: fat[k], recebido: rec[k] || 0,
    aberto: Math.max(0, fat[k] - (rec[k] || 0))
  })).filter(c => c.faturado > 0 || c.recebido > 0).sort((a,b) => b.faturado - a.faturado);
}

export function folhaDoAno(d, ano){
  const out = [];
  for(const p of ((d.pessoas && d.pessoas.people) || [])){
    if(!p) continue;
    const sal = p.salarios || {};
    const ks = Object.keys(sal).filter(k => String(k).slice(0,4) === ano).sort();
    if(!ks.length) continue;
    out.push({ nome: p.nome || '?', ativo: p.ativo,
               ultimo: Number(sal[ks[ks.length - 1]]) || 0, meses: ks.length });
  }
  return out;
}

/* Quem já teve pagamento de folha no mês e quem ainda não.
   É o que sustenta o lembrete da nota: o Extrato NÃO guarda número de NF
   (de ~20 pagamentos por mês, quase nenhum tem documento preenchido), então
   o sinal honesto é "ainda não recebeu pagamento este mês" — não "não mandou
   a nota". Se um dia o nº da nota for preenchido no lançamento, dá pra
   trocar este sinal pelo exato. */
export function folhaDoMes(d, ym){
  const nomes = ((d.pessoas && d.pessoas.people) || [])
    .filter(p => p && p.nome && p.ativo !== false)
    .map(p => ({ nome: p.nome, chave: nomeChave(p.nome) }));
  const pagos = new Set();
  for(const l of d.ext){
    if(!l || !l.contraparte) continue;
    if(!/folha/i.test(String(l.categoria || ''))) continue;
    if(String(l.data || '').slice(0,7) !== ym) continue;
    const k = nomeChave(l.contraparte);
    if(k) pagos.add(k);
  }
  return {
    pagos:    nomes.filter(p => pagos.has(p.chave)).map(p => p.nome),
    pendentes: nomes.filter(p => !pagos.has(p.chave)).map(p => p.nome),
    total: nomes.length
  };
}

export { brl, brlSgn, dia, MES };
