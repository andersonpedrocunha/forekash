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
    /* O que o MR KASH aprendeu. Mesma lista que o chat do app edita — ele é
       um só, então o que foi corrigido lá vale aqui. */
    memoria:  mods.mrk_memoria || null,
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
      /* A dívida sai da LISTA, nunca dos TOTAIS. Tirar dos dois lados fazia o
         ano fechar com R$ 912 mil de sobra em vez dos R$ 287 mil reais —
         esconder dívida não pode deixar a empresa mais bonita do que é.
         Aqui some só quem ela identifica: o empréstimo tomado na UNILOS
         aparecia como R$ 223 mil de "pagador", porque o nome da cooperativa
         não parece empréstimo e eu só filtrava por nome. */
      const c = String(l.contraparte || '').trim();
      if(c && !f.pagadorFora(c) && !f.catFora(l.categoria))
        porPagador[c] = (porPagador[c] || 0) + v;
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

  // Por último: o que ele aprendeu corrige a leitura de tudo acima.
  const mem = memoriaTexto(d);
  if(mem) L.push(mem);

  return L.join('\n');
}

/* Gêmeo do memTexto() do app. Se os dois textos divergirem, o MR KASH do
   Slack e o do chat passam a saber coisas diferentes. */
export function memoriaTexto(d){
  const lista = (d.memoria && d.memoria.lista) || [];
  if(!lista.length) return '';
  return '\n## O QUE VOCÊ JÁ APRENDEU COM ELE\n' +
    'Isto não saiu dos números: foi ele que te contou ou te corrigiu. Vale mais que a ' +
    'sua leitura dos dados, porque os dados não sabem disso. Use quando couber, sem ' +
    'anunciar que está usando e sem repetir de volta pra ele o que ele mesmo te ensinou.\n' +
    lista.map(m => '- ' + (m.tag ? m.tag + ': ' : '') + m.fato).join('\n');
}

/* Grava um fato novo no mesmo blob que o app lê. Lê-altera-grava: o blob é
   o documento inteiro, então não dá pra acrescentar uma linha sem reescrever
   o resto. Duas gravações no mesmo segundo perderiam uma — risco pequeno e
   aceito aqui, porque quem ensina é uma pessoa de cada vez. */
export async function salvarMemoria(env, fato, tag, corrige, quem){
  const txt = String(fato || '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if(txt.length < 8) return null;
  const org = env.FOREKASH_ORG_ID;
  const base = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
    'content-type': 'application/json'
  };
  const atual = await sb(env, `module_blobs?org_id=eq.${org}&module=eq.mrk_memoria&select=data`);
  const mem = (atual[0] && atual[0].data) || { nextId: 1, lista: [] };
  if(!Array.isArray(mem.lista)) mem.lista = [];
  const norm = v => String(v || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if(mem.lista.some(m => norm(m.fato) === norm(txt))) return null;   // já sabe
  const et = String(tag || '').trim().slice(0, 40);
  if(corrige && et) mem.lista = mem.lista.filter(m => norm(m.tag) !== norm(et));
  const novo = { id: (mem.nextId = (mem.nextId || 1) + 1) - 1, fato: txt, tag: et,
                 origem: 'slack', quem: quem || '', criado: new Date().toISOString() };
  mem.lista.push(novo);
  while(mem.lista.length > 60) mem.lista.shift();
  const r = await fetch(env.SUPABASE_URL +
    '/rest/v1/module_blobs?on_conflict=org_id,module', {
      method: 'POST',
      headers: Object.assign({ Prefer: 'resolution=merge-duplicates' }, base),
      body: JSON.stringify({ org_id: org, module: 'mrk_memoria', data: mem })
    });
  if(!r.ok) throw new Error('Supabase recusou a memória: ' + (await r.text()).slice(0, 200));
  return novo;
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

/* Quanto sobrou em aberto em CADA mês, não só no ano.
   Totais do ano não respondem isso: um cliente que pagou adiantado em maio e
   atrasou em agosto some na subtração, e "o que já venceu" sai R$ 1 mil em
   vez de centenas de milhares.

   Mesma regra do painel de Recebíveis do app: um título por mês por cliente,
   e o enésimo crédito quita o enésimo título em aberto. É FIFO, que é como
   recebível funciona — o dinheiro que chega paga a conta mais velha.        */
export function abertoDetalhado(d, ano){
  const porMes = {};        // 'jan' -> quanto falta entrar
  const porCliente = {};    // nome -> { total, vencido, aFalar }
  const vazio = { porMes, porCliente };
  if(!d.receita || !d.receita.years || !d.receita.years[ano]) return vazio;
  const cats = catsReceita(d);

  // títulos por cliente, em ordem de competência
  const titulos = {}, nomes = {};
  for(const r of (d.receita.years[ano].clients || [])){
    const cli = (d.receita.clientes || []).find(c => c.id === r.clienteId);
    const nome = (cli && cli.nome) || r.nome || '';
    const k = nomeChave(nome);
    if(!k) continue;
    nomes[k] = nome;
    for(let i = 0; i < 12; i++){
      const c = (r.meses || {})[MES[i]];
      const v = c ? (Number(c.valor) || 0) : 0;
      if(!v) continue;
      (titulos[k] = titulos[k] || []);
      const achou = titulos[k].find(t => t.i === i);
      if(achou) achou.valor += v; else titulos[k].push({ i, valor: v });
    }
  }
  for(const k in titulos) titulos[k].sort((a,b) => a.i - b.i);

  // créditos por cliente, em ordem de data
  const creditos = {};
  for(const l of d.ext){
    if(l.tipo !== 'ganho' || !l.contraparte) continue;
    if(cats.size && !cats.has(String(l.categoria || '').trim().toLowerCase())) continue;
    const dt = String(l.dataPagamento || l.data || '').slice(0,10);
    if(dt.slice(0,4) !== ano) continue;
    const k = nomeChave(l.contraparte);
    if(!k || !titulos[k]) continue;
    (creditos[k] = creditos[k] || []).push({ dt, v: Math.abs(Number(l.valorPago != null ? l.valorPago : l.valor) || 0) });
  }
  for(const k in creditos) creditos[k].sort((a,b) => a.dt.localeCompare(b.dt));

  const mesAtual = Number(d.hoje.toISOString().slice(5,7));   // 1..12
  for(const k in titulos){
    let caixa = (creditos[k] || []).reduce((s,c) => s + c.v, 0);
    for(const t of titulos[k]){
      const usa = Math.min(caixa, t.valor);
      caixa -= usa;
      const falta = t.valor - usa;
      /* 1,5% de folga: crédito vem líquido de retenção e taxa, então quase
         nunca bate o centavo. Sem isso todo título ficaria "aberto por R$ 40". */
      if(falta <= t.valor * 0.015) continue;
      porMes[MES[t.i]] = (porMes[MES[t.i]] || 0) + falta;
      /* Mesma apuração, outro corte: saber que dezembro traz R$ 279 mil não
         diz de quem cobrar. O vencido vai separado porque é o que precisa de
         telefonema, não de calendário. */
      const c = porCliente[k] || (porCliente[k] = { nome: nomes[k] || k, total:0, vencido:0, aVencer:0 });
      c.total += falta;
      if(t.i < mesAtual - 1) c.vencido += falta; else c.aVencer += falta;
    }
  }
  return { porMes, porCliente };
}
// compat: quem só quer o recorte por mês
export function abertoPorMes(d, ano){ return abertoDetalhado(d, ano).porMes; }

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

/* O que já existe na casa, pra ele devolver categoria e contraparte que
   EXISTEM aqui em vez de inventar rótulo novo a cada lançamento. */
export function vocabulario(d){
  const cats = [...new Set(((d.catmap && d.catmap.categorias) || [])
    .map(c => c && c.nome).filter(Boolean))];
  const nomes = [...new Set(((d.pessoas && d.pessoas.registry) || [])
    .map(r => r && r.nome).filter(Boolean))].slice(0, 120);
  const contas = [...new Set(d.ext.map(l => l && l.conta).filter(Boolean))];
  const L = [];
  if(cats.length)   L.push('Categorias existentes (use uma destas, exatamente como escrita): ' + cats.join(' · '));
  if(contas.length) L.push('Contas existentes: ' + contas.join(' · '));
  if(nomes.length)  L.push('Fornecedores e clientes já cadastrados: ' + nomes.join(' · '));
  return L.join('\n');
}

/* ── Escrita ────────────────────────────────────────────────────────────
   O único ponto deste servidor que grava. Tudo mais aqui é leitura.

   `local_id` não tem default no banco — quem cria escolhe o número. Existe
   índice único em (org_id, local_id), então uma corrida com o app falha em
   vez de sobrescrever: o pior caso é "não lançou", nunca "lançou por cima".
   Por isso a tentativa é repetida: se o número foi tomado no meio do
   caminho, pega o próximo e tenta de novo.                                */
export async function criarLancamento(env, dados, quem){
  const org = env.FOREKASH_ORG_ID;
  const base = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
    'content-type': 'application/json'
  };
  for(let tentativa = 0; tentativa < 4; tentativa++){
    const r0 = await fetch(env.SUPABASE_URL +
      `/rest/v1/extrato_lancamentos?org_id=eq.${org}&select=local_id&order=local_id.desc&limit=1`,
      { headers: base });
    if(!r0.ok) throw new Error('Supabase leu mal o último id: ' + r0.status);
    const topo = await r0.json();
    const proximo = ((topo[0] && topo[0].local_id) || 0) + 1 + tentativa;

    const linha = {
      org_id: org,
      local_id: proximo,
      data: dados.data,
      valor: Math.abs(Number(dados.valor) || 0),
      descricao: String(dados.descricao || '').slice(0, 300),
      categoria: dados.categoria || null,
      contraparte: dados.contraparte || null,
      conta: dados.conta || null,
      /* Nasce PENDENTE, nunca pago. Conta a pagar não é dinheiro que saiu —
         a baixa continua vindo do extrato, como em todo o resto do app. */
      status: 'pendente',
      tipo: dados.tipo === 'ganho' ? 'ganho' : 'gasto',
      importado_de: 'slack',          // dá pra auditar ou desfazer em bloco
      metadata: { criadoPor: quem || 'slack', criadoEm: new Date().toISOString() }
    };
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/extrato_lancamentos', {
      method: 'POST',
      headers: Object.assign({ Prefer: 'return=representation' }, base),
      body: JSON.stringify(linha)
    });
    if(r.ok){ const j = await r.json(); return j[0] || linha; }
    const txt = await r.text();
    if(r.status === 409 || /duplicate|unique/i.test(txt)) continue;   // número tomado: tenta o próximo
    throw new Error('Supabase recusou: ' + txt.slice(0, 200));
  }
  throw new Error('não consegui um número livre de lançamento — tenta de novo');
}

/* ── Gráficos ───────────────────────────────────────────────────────────
   Barra em texto monoespaçado, dentro de bloco de código. Não é consolo por
   não ter imagem: é o formato que chega igual em todo cliente de Slack, no
   celular e no desktop, sem upload, sem plano pago e sem mandar o
   faturamento da casa pro servidor de ninguém.

   Respeitam o mesmo recorte das respostas: o que não vai pro modelo também
   não vira barra.                                                          */
const BARRA = 18;
function _barras(linhas, maxForcado){
  const max = maxForcado || Math.max(...linhas.map(l => Math.abs(l.valor)), 1);
  const larg = Math.max(...linhas.map(l => l.rotulo.length));
  return linhas.map(l => {
    const n = Math.max(0, Math.round(Math.abs(l.valor) / max * BARRA));
    return l.rotulo.padEnd(larg) + '  ' + '█'.repeat(n).padEnd(BARRA, '·') + '  ' + _mil(l.valor);
  }).join('\n');
}
function _mil(v){
  const n = Number(v) || 0, a = Math.abs(n);
  const s = a >= 1e6 ? (a/1e6).toFixed(1).replace('.', ',') + 'M'
          : a >= 1000 ? Math.round(a/1000) + 'k'
          : String(Math.round(a));
  return ((n < 0 ? '-' : '') + 'R$ ' + s).padStart(9);
}

export const GRAFICOS = [
  { id:'clientes',  titulo:'Top 10 clientes por receita',  dica:'quem mais faturou no ano' },
  { id:'mes',       titulo:'Entrou × saiu, mês a mês',     dica:'o ano inteiro em duas colunas' },
  { id:'categoria', titulo:'Para onde o dinheiro foi',     dica:'saída por categoria' },
  { id:'aberto',    titulo:'Quem está devendo',            dica:'faturado que ainda não caiu' },
  { id:'projecao',  titulo:'Projeção de entradas',         dica:'o que falta entrar, mês a mês' }
];

export function grafico(d, id, op){
  op = op || {};
  const ano = d.hoje.toISOString().slice(0,4);
  const f = filtro(d, op);

  if(id === 'clientes' || id === 'aberto'){
    const cob = cobranca(d, ano);
    const linhas = (id === 'aberto'
        ? cob.filter(c => c.aberto > 0.5).sort((a,b) => b.aberto - a.aberto)
        : cob)
      .slice(0, 10)
      .map(c => ({ rotulo: c.nome.slice(0,16), valor: id === 'aberto' ? c.aberto : c.faturado }));
    if(!linhas.length) return null;
    /* O rodapé não é legenda, é leitura. A conta é determinística — sai
       daqui, não do modelo — mas a frase é dele. Gráfico sem leitura é
       planilha colorida. */
    let rodape;
    if(id === 'aberto'){
      const topo = linhas[0];
      const soma = linhas.reduce((s,l) => s + l.valor, 0);
      rodape = _mil(soma).trim() + ' parados. ' + topo.rotulo + ' sozinho segura ' +
               Math.round(topo.valor / soma * 100) + '%.\n' +
               'Parte disso é retenção e taxa de antecipação — não é calote. O resto é.';
    } else {
      const soma = cob.reduce((s,c) => s + c.faturado, 0);
      const tres = linhas.slice(0,3);
      const pct = Math.round(tres.reduce((s,l) => s + l.valor, 0) / soma * 100);
      rodape = tres.map(t => t.rotulo).join(', ') + ' são ' + pct + '% do que tu fatura. ' +
               (pct >= 60 ? 'Isso não é carteira de clientes, é dependência.'
                          : 'Concentrado, mas respira.');
    }
    return { titulo: GRAFICOS.find(g => g.id === id).titulo + ' · ' + ano,
             corpo: _barras(linhas), rodape };
  }

  if(id === 'mes'){
    const m = {};
    for(const l of d.ext){
      if(String(l.data).slice(0,4) !== ano) continue;
      if(l.tipo !== 'ganho' && l.tipo !== 'gasto') continue;
      const k = String(l.data).slice(5,7);
      const b = m[k] || (m[k] = { e:0, s:0 });
      const v = Math.abs(Number(l.valor) || 0);
      if(l.tipo === 'ganho') b.e += v; else b.s += v;
    }
    const ks = Object.keys(m).sort();
    if(!ks.length) return null;
    const max = Math.max(...ks.map(k => Math.max(m[k].e, m[k].s)), 1);
    const bar = v => '█'.repeat(Math.max(0, Math.round(v / max * 12))).padEnd(12, '·');
    const corpo = '      entrou            saiu\n' + ks.map(k =>
      MES[+k - 1] + '  ' + bar(m[k].e) + _mil(m[k].e) + '  ' + bar(m[k].s) + _mil(m[k].s)).join('\n');
    /* Lê o ano: qual mês sustenta, quantos fecharam no vermelho, e o que
       sobra se tirar o melhor. É a pergunta que o gráfico provoca. */
    const ent = ks.reduce((s,k) => s + m[k].e, 0), sai = ks.reduce((s,k) => s + m[k].s, 0);
    const vermelhos = ks.filter(k => m[k].e < m[k].s).length;
    const melhor = ks.reduce((a,k) => (m[k].e - m[k].s) > (m[a].e - m[a].s) ? k : a, ks[0]);
    const semMelhor = (ent - sai) - (m[melhor].e - m[melhor].s);
    const pe = [vermelhos + ' de ' + ks.length + ' meses fecharam no vermelho.'];
    if(semMelhor < 0)
      pe.push(MES[+melhor - 1] + ' carrega o ano sozinho. Tira ele e sobra ' + _mil(semMelhor).trim() + '.');
    else
      pe.push('O ano acumula ' + brlSgn(ent - sai) + '.');
    return { titulo: 'Entrou × saiu · ' + ano, corpo, rodape: pe.join('\n') };
  }

  /* Projeção de entradas. Não é previsão estatística: é o que a Receita já
     tem faturado e ainda não caiu na conta. Vem em duas partes porque elas
     não valem a mesma coisa — o que já venceu é cobrança a fazer, o que
     ainda vai vencer é só o calendário seguindo. Misturar as duas numa barra
     só esconde justamente o que precisa de ação. */
  if(id === 'projecao'){
    const mesAtual = Number(d.hoje.toISOString().slice(5,7));   // 1..12
    const det = abertoDetalhado(d, ano);
    const falta = det.porMes;
    /* Vencido é a soma dos meses JÁ PASSADOS que seguem em aberto, apurada
       título a título. Derivar isso de totais do ano dava R$ 1 mil num ano
       com quase R$ 600 mil parados. */
    let vencido = 0;
    for(let i = 0; i < mesAtual - 1; i++) vencido += falta[MES[i]] || 0;

    const linhas = [];
    if(vencido > 0.5) linhas.push({ rotulo: 'já venceu', valor: vencido });
    let somaFuturo = 0;
    for(let i = mesAtual - 1; i < 12; i++){
      const v = falta[MES[i]] || 0;
      if(v > 0.5){ linhas.push({ rotulo: MES[i], valor: v }); somaFuturo += v; }
    }
    if(!linhas.length) return null;

    /* Mês responde "quando"; cliente responde "de quem". Separar o vencido
       por cliente é o que transforma o gráfico em lista de ligação. */
    const clis = Object.values(det.porCliente).sort((a,b) => b.total - a.total).slice(0, 10);
    const larg = Math.max(...clis.map(c => c.nome.length), 8);
    const porCliente = clis.length
      ? '\n\nde quem\n' + clis.map(c => c.nome.slice(0,16).padEnd(larg) + '  ' +
          _mil(c.total) + (c.vencido > 0.5 ? '   ' + _mil(c.vencido).trim() + ' vencido' : '')).join('\n')
      : '';

    const pe = [];
    if(vencido > 0.5){
      const atrasados = clis.filter(c => c.vencido > 0.5).sort((a,b) => b.vencido - a.vencido);
      pe.push(_mil(vencido).trim() + ' já passou do vencimento' +
        (atrasados.length ? ' — ' + atrasados.slice(0,3).map(c => c.nome).join(', ') : '') +
        '. Isso não entra sozinho, alguém tem que cobrar.');
    }
    if(somaFuturo > 0.5)
      pe.push(_mil(somaFuturo).trim() + ' ainda vai vencer até dezembro.');
    pe.push('É o que está faturado na Receita e não caiu na conta. Não é previsão de ' +
            'venda nova — nada aqui foi estimado.');
    return { titulo: 'Projeção de entradas · ' + ano,
             corpo: _barras(linhas) + porCliente, rodape: pe.join('\n') };
  }

  if(id === 'categoria'){
    const porCat = {};
    let folha = 0, total = 0;
    for(const l of d.ext){
      if(l.tipo !== 'gasto' || String(l.data).slice(0,4) !== ano) continue;
      const c = String(l.categoria || 'Sem categoria').trim();
      const v = Math.abs(Number(l.valor) || 0);
      /* O total conta TUDO que saiu, inclusive o que não vira barra. Somando
         só o que entra no gráfico, a folha dava 78% da saída em vez de 52%:
         a dívida tinha saído do denominador e inflava o resto. */
      total += v;
      if(f.catFora(c)) continue;                 // mesmo recorte das respostas
      /* A folha sai do gráfico e vira rótulo. Ela é metade da saída, então
         dentro do gráfico achata todo o resto numa barrinha só e some com a
         diferença entre Impostos, ADM e Despesas — que é justamente o que
         alguém quer ver aqui. O número não se perde: vai escrito embaixo. */
      if(/folha/i.test(c)){ folha += v; continue; }
      porCat[c] = (porCat[c] || 0) + v;
    }
    const linhas = Object.entries(porCat).sort((a,b) => b[1] - a[1]).slice(0, 10)
      .map(([c,v]) => ({ rotulo: c.slice(0,18), valor: v }));
    if(!linhas.length) return null;
    const pe = [];
    if(folha) pe.push('A folha ficou fora: ' + _mil(folha).trim() + ', ' +
      (total ? Math.round(folha/total*100) + '% de tudo que sai' : 'o maior gasto da casa') +
      '. Dentro do gráfico ela achata o resto e tu não enxerga mais nada.');
    if(linhas.length) pe.push('Do que sobrou, ' + linhas[0].rotulo + ' é o que pesa.');
    if(op.semDivida) pe.push('Empréstimo não entra nesse recorte.');
    return { titulo: 'Para onde o dinheiro foi · ' + ano, corpo: _barras(linhas),
             rodape: pe.join('\n') };
  }
  return null;
}

export { brl, brlSgn, dia, MES };
