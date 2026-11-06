/* ── O DECK AO VIVO ───────────────────────────────────────────────────
   A aba Apresentação do KASHBOARD era um editor de slides caseiro: 72
   funções e ~5.000 linhas competindo com PowerPoint e Google Slides. Nunca
   ia ganhar, e cada tema novo era manutenção.

   Aqui o Forekash deixa de ser editor e vira gerador: o Worker serve uma
   apresentação pronta num link próprio, com os números buscados NA HORA DA
   ABERTURA. Quem abre vê o fechamento de agora — não a foto de quando o
   arquivo foi exportado, que é o jeito de um deck mentir sem querer.

   Ninguém edita, e isso é a troca consciente: o preço de estar sempre certo
   é não poder ajustar um slide na véspera da reunião.                     */

import { carregar } from './forekash.js';

/* ── Segurança ──────────────────────────────────────────────────────────
   O deck é o retrato financeiro da empresa num link que vai por e-mail e
   WhatsApp, então não pode ser adivinhável nem eterno. O token assina
   período + validade com HMAC; a chave é a service key, que já existe e
   nunca sai do Worker. Link vencido não abre. */
async function _chave(env){
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.SUPABASE_SERVICE_KEY || 'sem-chave'),
                                 { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
}
function _b64url(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function assinarDeck(env, periodo, dias){
  const exp = Date.now() + (Math.max(1, dias || 30) * 86400000);
  const corpo = periodo + '.' + exp;
  const sig = await crypto.subtle.sign('HMAC', await _chave(env), new TextEncoder().encode(corpo));
  return exp + '.' + _b64url(sig).slice(0, 32);
}
export async function conferirDeck(env, periodo, token){
  const p = String(token || '').split('.');
  if(p.length !== 2) return false;
  const exp = Number(p[0]);
  if(!exp || Date.now() > exp) return false;
  const sig = await crypto.subtle.sign('HMAC', await _chave(env), new TextEncoder().encode(periodo + '.' + exp));
  /* Comparação de tamanho fixo: o slice já iguala o comprimento. */
  const esperado = _b64url(sig).slice(0, 32);
  if(esperado.length !== p[1].length) return false;
  let dif = 0;
  for(let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ p[1].charCodeAt(i);
  return dif === 0;
}

// ── Os números ─────────────────────────────────────────────────────────
const MES = ['janeiro','fevereiro','março','abril','maio','junho',
             'julho','agosto','setembro','outubro','novembro','dezembro'];

function _vazio(){ return { receita:0, despesa:0, nLanc:0 }; }
/* Só o que tem baixa entra: compromisso agendado é dívida com data, não
   dinheiro que passou pela conta. É a mesma régua do resto do app. */
function _somaPeriodo(ext, de, ate){
  const o = _vazio();
  for(const l of ext){
    if(!l || !l.data || l.status !== 'pago') continue;
    if(l.tipo !== 'ganho' && l.tipo !== 'gasto') continue;
    const d = String(l.data).slice(0,10);
    if(d < de || d > ate) continue;
    const v = Math.abs(Number(l.valor) || 0);
    if(!v) continue;
    o.nLanc++;
    if(l.tipo === 'ganho') o.receita += v; else o.despesa += v;
  }
  return o;
}
/* ── Período: mês, trimestre, semestre ou ano ──────────────────────────
   O fechamento dele não é só mensal nem só anual: tem o do mês que acabou de
   fechar, o trimestral, o semestral e o do ano. Um deck que só sabe "mês ou
   ano" obriga a refazer a conta na mão nos outros dois.

   Formatos: 2026 · 2026-10 · 2026-T3 · 2026-S1                           */
function _periodo(periodo){
  const t = String(periodo || '').trim().toUpperCase();
  const mT = t.match(/^(\d{4})-T([1-4])$/);
  const mS = t.match(/^(\d{4})-S([12])$/);
  const mM = t.match(/^(\d{4})-(\d{2})$/);
  const mA = t.match(/^(\d{4})$/);
  let ano, ini, fim, tipo, rotulo;
  if(mT){ ano = +mT[1]; const q = +mT[2]; ini = (q-1)*3; fim = ini+2; tipo = 'trimestre';
          rotulo = q + 'º Trimestre ' + ano; }
  else if(mS){ ano = +mS[1]; const h = +mS[2]; ini = (h-1)*6; fim = ini+5; tipo = 'semestre';
          rotulo = h + 'º Semestre ' + ano; }
  else if(mM){ ano = +mM[1]; ini = fim = (+mM[2]) - 1; tipo = 'mes';
          rotulo = MES[ini].charAt(0).toUpperCase() + MES[ini].slice(1) + ' de ' + ano; }
  else if(mA){ ano = +mA[1]; ini = 0; fim = 11; tipo = 'ano'; rotulo = 'Ano de ' + ano; }
  else { const h = new Date(); ano = h.getFullYear(); ini = 0; fim = 11; tipo = 'ano';
         rotulo = 'Ano de ' + ano; }
  const ultDia = new Date(ano, fim + 1, 0).getDate();
  const dd = n => String(n).padStart(2, '0');
  return { ano, ini, fim, tipo, rotulo, ultDia,
           de:  `${ano}-${dd(ini+1)}-01`,
           ate: `${ano}-${dd(fim+1)}-${dd(ultDia)}`,
           nMeses: fim - ini + 1 };
}
/* O período equivalente imediatamente anterior, do mesmo tamanho: semestre
   compara com semestre, trimestre com trimestre. Comparar o 2º semestre com
   o ano inteiro seria a leitura errada de sempre. */
function _periodoAnterior(p){
  const dd = n => String(n).padStart(2, '0');
  let ano = p.ano, ini = p.ini - p.nMeses, fim = p.fim - p.nMeses;
  while(ini < 0){ ano--; ini += 12; fim += 12; }
  const ultDia = new Date(ano, fim + 1, 0).getDate();
  return { ano, ini, fim, de:`${ano}-${dd(ini+1)}-01`, ate:`${ano}-${dd(fim+1)}-${dd(ultDia)}` };
}

/* ── Receita por cliente, mês a mês ────────────────────────────────────
   `contraparte` é quem pagou. O slide que ele usa mostra cliente × mês com
   total e status — e é o slide que explica a queda: contrato que encerrou
   aparece como linha que morre no meio do período, coisa que o total do mês
   sozinho nunca mostra. */
function _porCliente(ext, p){
  const dd = n => String(n).padStart(2, '0');
  const m = new Map();
  for(const l of ext){
    if(!l || l.tipo !== 'ganho' || l.status !== 'pago' || !l.data) continue;
    const d = String(l.data).slice(0,10);
    if(d < p.de || d > p.ate) continue;
    const v = Math.abs(Number(l.valor) || 0);
    if(!v) continue;
    const k = (l.contraparte || '').trim() || '(sem cliente)';
    if(!m.has(k)) m.set(k, { nome:k, meses:new Array(p.nMeses).fill(0), total:0 });
    const o = m.get(k);
    const idx = (parseInt(d.slice(5,7), 10) - 1) - p.ini;
    if(idx >= 0 && idx < p.nMeses) o.meses[idx] += v;
    o.total += v;
  }
  const lista = [...m.values()].sort((a,b) => b.total - a.total);
  const soma = lista.reduce((a,b) => a + b.total, 0) || 1;
  for(const c of lista){
    c.pct = (c.total / soma) * 100;
    /* "Ativo" aqui é fato do extrato, não cadastro: teve receita no último
       mês do período. É o que separa carteira viva de contrato encerrado. */
    c.ativo = c.meses[p.nMeses - 1] > 0;
  }
  return lista;
}

/* Despesa por categoria × mês — a tabela que mostra ONDE o dinheiro saiu ao
   longo do período, não só o bolo do fim. */
function _catPorMes(ext, p){
  const m = new Map();
  for(const l of ext){
    if(!l || l.tipo !== 'gasto' || l.status !== 'pago' || !l.data) continue;
    const d = String(l.data).slice(0,10);
    if(d < p.de || d > p.ate) continue;
    const v = Math.abs(Number(l.valor) || 0);
    if(!v) continue;
    const k = l.categoria || '(sem categoria)';
    if(!m.has(k)) m.set(k, { cat:k, meses:new Array(p.nMeses).fill(0), total:0 });
    const o = m.get(k);
    const idx = (parseInt(d.slice(5,7), 10) - 1) - p.ini;
    if(idx >= 0 && idx < p.nMeses) o.meses[idx] += v;
    o.total += v;
  }
  return [...m.values()].sort((a,b) => b.total - a.total);
}

/* Dentro da maior categoria, quem são os fornecedores — o slide de Infra-web
   do modelo dele. Vale pra qualquer categoria: a pergunta é sempre "esse
   bolo é formado por quem, e quem parou de cobrar?". */
function _fornecedoresDe(ext, p, categoria){
  if(!categoria) return [];
  const dd = n => String(n).padStart(2, '0');
  const m = new Map();
  for(const l of ext){
    if(!l || l.tipo !== 'gasto' || l.status !== 'pago' || !l.data) continue;
    if((l.categoria || '(sem categoria)') !== categoria) continue;
    const d = String(l.data).slice(0,10);
    if(d < p.de || d > p.ate) continue;
    const v = Math.abs(Number(l.valor) || 0);
    if(!v) continue;
    const k = (l.contraparte || '').trim() || (l.descricao || '').split('·')[0].trim() || '(sem nome)';
    if(!m.has(k)) m.set(k, { nome:k, total:0, ultimoMes:false });
    const o = m.get(k);
    o.total += v;
    if(parseInt(d.slice(5,7), 10) - 1 === p.fim) o.ultimoMes = true;
  }
  const lista = [...m.values()].sort((a,b) => b.total - a.total);
  const soma = lista.reduce((a,b) => a + b.total, 0) || 1;
  for(const f of lista) f.pct = (f.total / soma) * 100;
  return lista;
}

function _porCategoria(ext, de, ate){
  const m = new Map();
  for(const l of ext){
    if(!l || l.tipo !== 'gasto' || l.status !== 'pago' || !l.data) continue;
    const d = String(l.data).slice(0,10);
    if(d < de || d > ate) continue;
    const v = Math.abs(Number(l.valor) || 0);
    if(!v) continue;
    const k = l.categoria || '(sem categoria)';
    m.set(k, (m.get(k) || 0) + v);
  }
  return [...m.entries()].sort((a,b) => b[1]-a[1]);
}
/* ── O QUE ESTE DECK NÃO MOSTRA, E POR QUÊ ──────────────────────────
   Caixa e dívida ficaram de fora de propósito. Os dois dependem de regra de
   negócio que vive no app (âncora de saldo + movimentação do extrato; saldo
   devedor por cronograma + parcelamentos de imposto), e reproduzir essa
   regra aqui produziu três números diferentes do que a tela mostra — R$ 139
   mil de diferença na dívida e R$ 170 mil no caixa.

   Um deck que contradiz a tela vale menos do que um deck sem o número: o
   sócio vê 364 mil aqui e 192 mil lá, e a partir daí nenhum número do
   Forekash é confiável pra ele. Então o deck fica com o que vem DIRETO do
   extrato — receita, despesa, resultado, série e categorias —, que é
   primário e não tem regra no meio.

   Pra trazer caixa e dívida de volta, o caminho é portar as funções do app
   (`dispoSaldoHoje` e o saldo por cronograma) inteiras, não aproximar.    */

export async function montarDeck(env, periodo){
  const d = await carregar(env);
  const ext = d.ext || [];
  const p = _periodo(periodo);
  const y = p.ano;
  const dd = n => String(n).padStart(2, '0');

  const atual = _somaPeriodo(ext, p.de, p.ate);

  /* Período anterior cortado no MESMO dia: comparar um mês pela metade com um
     mês fechado é a leitura errada que todo painel faz. */
  const hoje = new Date();
  const corrente = p.tipo === 'mes' && y === hoje.getFullYear() && p.ini === hoje.getMonth();
  const diaCorte = corrente ? hoje.getDate() : p.ultDia;
  const ant = _periodoAnterior(p);
  let antAte = ant.ate;
  if(corrente){
    const au = new Date(ant.ano, ant.fim + 1, 0).getDate();
    antAte = `${ant.ano}-${dd(ant.fim+1)}-${dd(Math.min(diaCorte, au))}`;
  }
  const anterior = _somaPeriodo(ext, ant.de, antAte);
  const atualCorte = corrente
    ? _somaPeriodo(ext, p.de, `${y}-${dd(p.ini+1)}-${dd(diaCorte)}`)
    : atual;

  /* Série do PERÍODO, não do ano: um semestre com 12 colunas tem metade
     vazia, e metade vazia num gráfico lê como queda. */
  const serie = [];
  for(let k = 0; k < p.nMeses; k++){
    const m = p.ini + k;
    const u = new Date(y, m + 1, 0).getDate();
    const sm = _somaPeriodo(ext, `${y}-${dd(m+1)}-01`, `${y}-${dd(m+1)}-${dd(u)}`);
    serie.push({ mes: m, rotulo: MES[m].slice(0,3),
                 receita: sm.receita, despesa: sm.despesa,
                 resultado: sm.receita - sm.despesa });
  }
  /* Série do ano inteiro continua existindo pro gráfico de contexto. */
  const serieAno = [];
  for(let m = 0; m < 12; m++){
    const u = new Date(y, m + 1, 0).getDate();
    const sm = _somaPeriodo(ext, `${y}-${dd(m+1)}-01`, `${y}-${dd(m+1)}-${dd(u)}`);
    serieAno.push({ mes: m, receita: sm.receita, despesa: sm.despesa,
                    resultado: sm.receita - sm.despesa });
  }

  const catsTodas = _porCategoria(ext, p.de, p.ate);
  const cats = catsTodas.slice(0, 6);
  const totalGasto = catsTodas.reduce((a,b) => a + b[1], 0) || 1;
  const catMes = _catPorMes(ext, p);
  const clientes = _porCliente(ext, p);

  /* Concentração: quanto do faturamento mora nos três maiores. É o número que
     diz se a empresa tem carteira ou tem três contratos. */
  const top3 = clientes.slice(0, 3);
  const somaRec = clientes.reduce((a,b) => a + b.total, 0) || 1;
  const concentracao = {
    top3: top3.map(c => ({ nome:c.nome, total:c.total, pct:c.pct })),
    pctTop3: (top3.reduce((a,b) => a + b.total, 0) / somaRec) * 100,
    nClientes: clientes.length
  };

  /* Break-even de caixa: a despesa média do período é a linha que a receita
     precisa superar mês a mês pra operar no positivo sem depender de pico.
     Vem só do extrato — é média de despesa realizada, não rateio de custo
     fixo, e o deck diz isso com todas as letras. */
  const breakEven = atual.despesa / Math.max(1, p.nMeses);
  const mesesAcima = serie.filter(x => x.receita >= breakEven).length;

  /* O detalhe de UMA categoria: a maior que não seja folha nem dívida — que
     são as duas que todo mundo já sabe de cor. É onde mora o desperdício
     silencioso (assinatura que ninguém cancelou). */
  const alvo = catsTodas.find(c => !/folha|pessoa|sal|empr|juro|financ|imposto/i.test(c[0]));
  const detalheCat = alvo ? alvo[0] : (catsTodas[0] ? catsTodas[0][0] : null);
  const fornecedores = _fornecedoresDe(ext, p, detalheCat);

  const resultado = atual.receita - atual.despesa;
  const margem = atual.receita > 0 ? (resultado / atual.receita) * 100 : 0;
  const queima = atual.despesa / Math.max(1, p.nMeses);

  return {
    periodo, tipo: p.tipo, porMes: p.tipo === 'mes', ano: y,
    rotulo: p.rotulo, nMeses: p.nMeses, mesIni: p.ini, mesFim: p.fim,
    de: p.de, ate: p.ate,
    corrente, diaCorte, ultDia: p.ultDia,
    receita: atual.receita, despesa: atual.despesa, resultado, margem,
    anterior: { receita: anterior.receita, despesa: anterior.despesa,
                resultado: anterior.receita - anterior.despesa },
    atualCorte: { receita: atualCorte.receita, despesa: atualCorte.despesa,
                  resultado: atualCorte.receita - atualCorte.despesa },
    rotuloAnterior: _rotuloAnt(p, ant, corrente),
    serie, serieAno, cats, catMes, totalGasto, queima,
    clientes, concentracao,
    breakEven, mesesAcima,
    detalheCat, fornecedores,
    nLanc: atual.nLanc,
    geradoEm: new Date().toISOString()
  };
}
function _rotuloAnt(p, ant, corrente){
  if(p.tipo === 'mes') return MES[ant.ini] + (corrente ? ' no mesmo dia' : '');
  if(p.tipo === 'ano') return String(ant.ano);
  const nome = p.tipo === 'trimestre' ? 'trimestre' : 'semestre';
  return `${nome} anterior (${MES[ant.ini].slice(0,3)}–${MES[ant.fim].slice(0,3)}/${String(ant.ano).slice(2)})`;
}

// ── A leitura do MR KASH ───────────────────────────────────────────────
/* O deck mostra o número; o que falta num fechamento é o que ele significa.
   Mesma regra de sempre: os valores vão prontos e o modelo só interpreta. */
export async function narrarDeck(env, dados){
  if(!env.ANTHROPIC_API_KEY) return null;
  const n = v => Math.round((Number(v)||0) * 100) / 100;
  const sinais = {
    periodo: dados.rotulo, receita: n(dados.receita), despesa: n(dados.despesa),
    resultado: n(dados.resultado), margemPct: n(dados.margem),
    periodoAnterior: dados.rotuloAnterior, anterior: {
      receita: n(dados.anterior.receita), despesa: n(dados.anterior.despesa),
      resultado: n(dados.anterior.resultado) },
    queimaMensal: n(dados.queima),
    maioresGastos: dados.cats.map(c => ({ categoria: c[0], valor: n(c[1]) }))
  };
  const regra =
`Você é o MR KASH escrevendo a leitura de um fechamento que vai ser APRESENTADO
pra sócios. Não é relatório: é o que alguém diria em pé, na frente da tela.

Devolva SÓ JSON:
{"manchete":"uma frase que resume o período","leitura":"2 a 3 frases ligando os números — o que explica o resultado","decisoes":["3 itens, cada um uma ação concreta com o número que a justifica"]}

PROIBIDO: inventar número (use só os que vieram), repetir o dado como se fosse
análise, conselho genérico sem onde/quanto. Máximo 60 palavras na leitura.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers: Object.assign({ 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version':'2026-10-21',
      'content-type':'application/json' },
      env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
    body: JSON.stringify({ model: env.MRK_MODEL || 'claude-opus-5-5', max_tokens: 1200,
      output_config:{ effort:'low' },
      system:[{ type:'text', text: regra }],
      messages:[{ role:'user', content: JSON.stringify(sinais, null, 1) }] })
  });
  if(!r.ok) return null;
  const j = await r.json();
  const txt = (j.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('\n');
  const i = txt.indexOf('{');
  if(i < 0) return null;
  let nivel = 0, str = false, esc = false;
  for(let k = i; k < txt.length; k++){
    const c = txt[k];
    if(esc){ esc = false; continue; }
    if(c === '\\'){ esc = true; continue; }
    if(c === '"'){ str = !str; continue; }
    if(str) continue;
    if(c === '{') nivel++;
    else if(c === '}'){ nivel--; if(!nivel){ try{ return JSON.parse(txt.slice(i, k+1)); }catch(_){ return null; } } }
  }
  return null;
}

// ── A apresentação ─────────────────────────────────────────────────────
/* Motor próprio de ~60 linhas em vez de reveal.js: o que um fechamento
   precisa é avançar, voltar, tela cheia e saber onde está. Trazer uma
   biblioteca de CDN por isso seria uma dependência externa que some sem
   avisar — e esta página tem que abrir na sala de reunião. */
const _esc = t => String(t == null ? '' : t)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _brl = (v, dec) => {
  const n = Number(v) || 0;
  return (n < 0 ? '−R$ ' : 'R$ ') + Math.abs(n).toLocaleString('pt-BR',
    { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec });
};
const _pct = v => (Number(v) || 0).toFixed(1).replace('.', ',') + '%';
const _MESc = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

function _variacao(atual, ant, rotulo, menorEhMelhor){
  if(!ant) return '<span class="n">sem base de comparação</span>';
  const d = atual - ant, pct = (d / Math.abs(ant)) * 100;
  const bom = menorEhMelhor ? d <= 0 : d >= 0;
  return '<span class="' + (bom ? 'p' : 'q') + '">' + (d >= 0 ? '+' : '−')
       + Math.abs(pct).toFixed(0) + '%</span> <span class="n">vs. ' + _esc(rotulo) + '</span>';
}

/* Gráfico em SVG montado aqui: nada de biblioteca, nada de imagem. Escala
   compartilhada entre receita e despesa, senão as barras mentem. */
function _grafico(serie, hojeMes, V){
  const max = Math.max(1, ...serie.map(s => Math.max(s.receita, s.despesa)));
  const n = Math.max(1, serie.length);
  const W = 1160, H = 300, pad = 34, lg = (W - pad*2) / n;
  let bar = '', eixo = '';
  serie.forEach((s, i) => {
    const x = pad + i*lg, w = Math.min(lg*0.34, 56);
    const hr = (s.receita/max) * (H - 60), hd = (s.despesa/max) * (H - 60);
    const fut = hojeMes != null && (s.mes != null ? s.mes : i) > hojeMes;
    const op = fut ? '.38' : '1';
    bar += `<rect x="${(x + lg*0.1).toFixed(1)}" y="${(H-30-hr).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0,hr).toFixed(1)}" rx="2" fill="${V.ac}" opacity="${op}"/>`;
    bar += `<rect x="${(x + lg*0.1 + w + 3).toFixed(1)}" y="${(H-30-hd).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0,hd).toFixed(1)}" rx="2" fill="${V.ruim}" opacity="${op}"/>`;
    const rot = s.rotulo || _MESc[s.mes != null ? s.mes : i] || '';
    eixo += `<text x="${(x + lg/2).toFixed(1)}" y="${H-10}" text-anchor="middle" fill="${fut ? V.fraco : V.mudo}" font-size="12" font-family="${V.fNum.replace(/'/g,'')}">${rot}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="g" role="img" aria-label="Receita e despesa mês a mês">
    <line x1="${pad}" y1="${H-30}" x2="${W-pad}" y2="${H-30}" stroke="${V.linha}"/>
    ${bar}${eixo}</svg>`;
}

/* ── TEMAS ──────────────────────────────────────────────────────────────
   Quatro, e de verdade diferentes: muda fundo, tipografia, densidade e o
   papel da cor — não é a mesma tela repintada. O editor antigo tinha doze
   temas que, na prática, eram o mesmo slide com outro azul; é esse tipo de
   escolha que faz o usuário concluir que tema "não funciona".

   · terminal  — escuro, monoespaçado, verde. Leitura de operação.
   · relatorio — branco, serifa no título. O que se manda pro banco.
   · imprensa  — preto no branco, sem cor exceto o sinal. Denso, de jornal.
   · projecao  — contraste máximo e tipos enormes, pra sala com projetor ruim.
*/
const TEMAS = {
  terminal: {
    nome:'Terminal',
    fontes:'family=JetBrains+Mono:wght@500;700;800&family=Inter:wght@400;600;700;800',
    v:{ bg:'#060B16', tx:'#E2E8F0', tx2:'#CBD5E1', forte:'#F8FAFC', mudo:'#94A3B8',
        mudo2:'#64748B', fraco:'#475569', fraco2:'#334155', ac:'#34D399', ac2:'#0D9488',
        ruim:'#F87171', inv:'#0F172A', linha:'rgba(148,163,184,.16)', barra:'rgba(148,163,184,.14)',
        fTit:"Inter,system-ui,sans-serif", fNum:"'JetBrains Mono',monospace",
        fTxt:"Inter,system-ui,sans-serif", tTit:'-.03em', cxTit:'none', pesoTit:'800' }
  },
  relatorio: {
    nome:'Relatório',
    fontes:'family=JetBrains+Mono:wght@500;700;800&family=Inter:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,700',
    v:{ bg:'#FFFFFF', tx:'#1F2A33', tx2:'#3C4852', forte:'#0E1619', mudo:'#6C767E',
        mudo2:'#8A939A', fraco:'#A8B0B6', fraco2:'#C6CCD1', ac:'#1E6B47', ac2:'#3E9B72',
        ruim:'#C0563F', inv:'#FFFFFF', linha:'rgba(31,42,51,.14)', barra:'rgba(31,42,51,.08)',
        fTit:"'Source Serif 4',Georgia,serif", fNum:"'JetBrains Mono',monospace",
        fTxt:"Inter,system-ui,sans-serif", tTit:'-.015em', cxTit:'none', pesoTit:'700' }
  },
  imprensa: {
    nome:'Imprensa',
    fontes:'family=JetBrains+Mono:wght@500;700;800&family=Archivo:wght@500;600;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,700',
    v:{ bg:'#FBFBF9', tx:'#111111', tx2:'#333333', forte:'#000000', mudo:'#5A5A5A',
        mudo2:'#767676', fraco:'#9A9A9A', fraco2:'#C4C4C4', ac:'#111111', ac2:'#555555',
        ruim:'#A32B16', inv:'#FBFBF9', linha:'rgba(17,17,17,.2)', barra:'rgba(17,17,17,.1)',
        fTit:"Archivo,'Arial Narrow',sans-serif", fNum:"Archivo,'Arial Narrow',sans-serif",
        fTxt:"'Source Serif 4',Georgia,serif", tTit:'-.02em', cxTit:'uppercase', pesoTit:'800' }
  },
  projecao: {
    nome:'Projeção',
    fontes:'family=JetBrains+Mono:wght@500;700;800&family=Archivo:wght@600;800',
    v:{ bg:'#000000', tx:'#FFFFFF', tx2:'#E8E8E8', forte:'#FFFFFF', mudo:'#B8B8B8',
        mudo2:'#9A9A9A', fraco:'#7A7A7A', fraco2:'#5A5A5A', ac:'#FFD400', ac2:'#E0A800',
        ruim:'#FF6B5A', inv:'#000000', linha:'rgba(255,255,255,.26)', barra:'rgba(255,255,255,.18)',
        fTit:"Archivo,system-ui,sans-serif", fNum:"Archivo,system-ui,sans-serif",
        fTxt:"Archivo,system-ui,sans-serif", tTit:'-.03em', cxTit:'none', pesoTit:'800' }
  }
};
export function listaTemas(){ return Object.keys(TEMAS).map(k => ({ id:k, nome:TEMAS[k].nome })); }

export function renderDeck(d, leitura, tema){
  const T = TEMAS[tema] || TEMAS.terminal;
  const V = T.v;
  const hojeMes = (d.ano === new Date().getFullYear()) ? new Date().getMonth() : null;
  const res = d.corrente ? d.atualCorte : { receita:d.receita, despesa:d.despesa, resultado:d.resultado };
  const S = [];

  S.push(`<section class="capa">
    <div class="marca">FOREKASH</div>
    <h1>${_esc(d.rotulo)}</h1>
    <p class="sub">Fechamento${d.corrente ? ' parcial · dia ' + d.diaCorte + ' de ' + d.ultDia : ''}</p>
    <p class="viva">Os números são buscados quando esta página abre. Ninguém exportou nada.</p>
  </section>`);

  S.push(`<section>
    <h2>O período em um número</h2>
    <div class="kpi-um ${d.resultado >= 0 ? 'ok' : 'mal'}">${_brl(d.resultado, 0)}</div>
    <p class="kpi-leg">${d.resultado >= 0 ? 'sobrou' : 'faltou'} · margem ${_pct(d.margem)}</p>
    ${leitura && leitura.manchete ? `<p class="manchete">${_esc(leitura.manchete)}</p>` : ''}
    <div class="tri">
      <div><span>Receita</span><b class="p">${_brl(d.receita, 0)}</b><small>${_variacao(res.receita, d.anterior.receita, d.rotuloAnterior)}</small></div>
      <div><span>Despesa</span><b class="q">${_brl(d.despesa, 0)}</b><small>${_variacao(res.despesa, d.anterior.despesa, d.rotuloAnterior, true)}</small></div>
      <div><span>Resultado</span><b class="${d.resultado>=0?'p':'q'}">${_brl(d.resultado, 0)}</b><small>${_variacao(res.resultado, d.anterior.resultado, d.rotuloAnterior)}</small></div>
    </div>
  </section>`);

  S.push(`<section>
    <h2>Receita × despesa, mês a mês</h2>
    ${_grafico(d.serie, hojeMes, V)}
    <div class="leg"><i class="v"></i>Receita <i class="r"></i>Despesa${hojeMes != null ? ' <span class="n">· meses à frente em tom claro são projeção vazia, não queda</span>' : ''}</div>
  </section>`);

  const maior = d.cats.length ? d.cats[0][1] : 1;
  S.push(`<section>
    <h2>Onde o dinheiro saiu</h2>
    <div class="cats">${d.cats.map(([c,v]) => `
      <div class="cat">
        <div class="cat-t"><span>${_esc(c)}</span><b>${_brl(v, 0)}</b></div>
        <div class="cat-b"><i style="width:${((v/maior)*100).toFixed(1)}%"></i></div>
        <div class="cat-p">${_pct((v/d.totalGasto)*100)} do que saiu</div>
      </div>`).join('') || '<p class="n">Nenhum gasto baixado no período.</p>'}</div>
  </section>`);


  if(leitura && (leitura.leitura || (leitura.decisoes || []).length)){
    S.push(`<section class="escura">
      <div class="tag">LEITURA DO MR KASH</div>
      ${leitura.leitura ? `<p class="fio">${_esc(leitura.leitura)}</p>` : ''}
      ${(leitura.decisoes || []).length ? `<ol class="dec">${leitura.decisoes.map(x => `<li>${_esc(x)}</li>`).join('')}</ol>` : ''}
    </section>`);
  }

  const total = S.length;
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${_esc(d.rotulo)} · Forekash</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${T.fontes}&display=swap" rel="stylesheet">
<style>
:root{${Object.keys(V).map(k => '--' + k + ':' + V[k]).join(';')}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--tx);font-family:var(--fTxt);overflow:hidden}
#p{height:100vh;width:100vw;position:relative}
section{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;
  padding:6vh 7vw;opacity:0;pointer-events:none;transition:opacity .35s ease, transform .35s ease;
  transform:translateY(14px)}
section.on{opacity:1;pointer-events:auto;transform:none}
h1{font-family:var(--fTit);font-size:clamp(2.4rem,6vw,4.6rem);font-weight:var(--pesoTit);letter-spacing:var(--tTit);line-height:1.05;text-transform:var(--cxTit)}
h2{font-family:var(--fNum);font-size:.78rem;font-weight:700;letter-spacing:.18em;
  color:var(--mudo2);text-transform:uppercase;margin-bottom:3vh}
.capa{justify-content:flex-end}
.marca{font-family:var(--fNum);font-size:.76rem;letter-spacing:.3em;color:var(--ac);margin-bottom:2vh}
.sub{font-size:1.1rem;color:var(--mudo);margin-top:1.4vh}
.viva{font-size:.82rem;color:var(--fraco);margin-top:4vh;max-width:46ch;line-height:1.5}
.kpi-um{font-family:var(--fNum);font-size:clamp(3rem,10vw,7rem);font-weight:800;
  letter-spacing:-.04em;line-height:1}
.kpi-um.ok{color:var(--ac)}.kpi-um.mal{color:var(--ruim)}
.kpi-leg{font-family:var(--fNum);color:var(--mudo2);font-size:1rem;margin-top:.8vh}
.manchete{font-size:1.35rem;line-height:1.45;margin-top:3vh;max-width:30ch;color:var(--forte);font-weight:600}
.tri{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--linha);
  border:1px solid var(--linha);border-radius:12px;overflow:hidden;margin-top:4vh}
.tri>div{background:var(--bg);padding:2.4vh 1.6vw}
.tri span{display:block;font-family:var(--fNum);font-size:.64rem;letter-spacing:.14em;
  color:var(--mudo2);text-transform:uppercase}
.tri b{display:block;font-family:var(--fNum);font-size:clamp(1.2rem,2.6vw,2rem);
  font-weight:800;margin-top:.8vh;letter-spacing:-.02em}
.tri small{display:block;font-size:.76rem;margin-top:.7vh}
.p{color:var(--ac)}.q{color:var(--ruim)}.n{color:var(--fraco)}
.g{width:100%;height:auto;max-height:52vh}
.leg{display:flex;align-items:center;gap:8px;font-size:.78rem;color:var(--mudo);margin-top:2vh}
.leg i{width:11px;height:11px;border-radius:3px;display:inline-block}
.leg i.v{background:var(--ac)}.leg i.r{background:var(--ruim);margin-left:12px}
.cats{display:flex;flex-direction:column;gap:2.1vh}
.cat-t{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:.7vh}
.cat-t span{font-size:1.05rem;color:var(--tx2)}
.cat-t b{font-family:var(--fNum);font-size:1.05rem;color:var(--forte)}
.cat-b{height:6px;background:var(--barra);border-radius:3px;overflow:hidden}
.cat-b i{display:block;height:100%;background:linear-gradient(90deg,var(--ac),var(--ac2));border-radius:3px}
.cat-p{font-size:.72rem;color:var(--fraco);margin-top:.5vh}
.escura .tag{font-family:var(--fNum);font-size:.62rem;letter-spacing:.18em;
  color:var(--inv);background:var(--ac);padding:4px 10px;border-radius:5px;align-self:flex-start;font-weight:800}
.fio{font-size:clamp(1.1rem,2.4vw,1.7rem);line-height:1.5;margin-top:3vh;max-width:40ch}
.dec{margin-top:4vh;padding-left:0;list-style:none;counter-reset:d}
.dec li{counter-increment:d;position:relative;padding-left:3.2rem;margin-bottom:2.2vh;
  font-size:1.05rem;line-height:1.5;color:var(--tx2);max-width:56ch}
.dec li::before{content:counter(d,decimal-leading-zero);position:absolute;left:0;top:.1em;
  font-family:var(--fNum);font-size:.9rem;font-weight:800;color:var(--ac)}
#barra{position:fixed;left:0;bottom:0;height:3px;background:var(--ac);transition:width .3s ease;z-index:9}
#nav{position:fixed;right:2.2vw;bottom:2.4vh;display:flex;gap:8px;align-items:center;z-index:10}
#nav button{background:var(--barra);border:0;color:var(--mudo);width:34px;height:34px;
  border-radius:8px;cursor:pointer;font-size:1rem;line-height:1}
#nav button:hover{background:var(--linha);color:var(--forte)}
#cnt{font-family:var(--fNum);font-size:.76rem;color:var(--fraco);margin-right:6px}
#carimbo{position:fixed;left:2.2vw;bottom:2.4vh;font-family:var(--fNum);
  font-size:.64rem;color:var(--fraco2);z-index:10}
@media print{section{position:relative;opacity:1;transform:none;page-break-after:always;height:100vh}
  #nav,#barra,#carimbo{display:none}body{overflow:visible}}
</style></head><body>
<div id="p">${S.join('')}</div>
<div id="barra"></div>
<div id="carimbo">aberto em <span id="agora"></span> · dados ao vivo</div>
<nav id="nav"><span id="cnt"></span>
  <button onclick="ir(-1)" aria-label="Anterior">‹</button>
  <button onclick="ir(1)" aria-label="Próximo">›</button>
  <button onclick="tela()" aria-label="Tela cheia">⛶</button></nav>
<script>
var S=[].slice.call(document.querySelectorAll('section')),i=0,T=${total};
function pinta(){
  S.forEach(function(s,k){ s.classList.toggle('on', k===i); });
  document.getElementById('barra').style.width=((i+1)/T*100)+'%';
  document.getElementById('cnt').textContent=(i+1)+' / '+T;
  try{ history.replaceState(null,'','#'+(i+1)); }catch(e){}
}
function ir(p){ var n=i+p; if(n<0||n>=T) return; i=n; pinta(); }
function tela(){ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
addEventListener('keydown',function(e){
  if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ') { e.preventDefault(); ir(1); }
  else if(e.key==='ArrowLeft'||e.key==='PageUp') { e.preventDefault(); ir(-1); }
  else if(e.key==='Home'){ i=0; pinta(); } else if(e.key==='End'){ i=T-1; pinta(); }
  else if(e.key==='f'||e.key==='F') tela();
});
/* Toque: arrastar pro lado passa o slide — a reunião às vezes é no celular. */
var x0=null;
addEventListener('touchstart',function(e){ x0=e.touches[0].clientX; },{passive:true});
addEventListener('touchend',function(e){
  if(x0===null) return; var dx=e.changedTouches[0].clientX-x0; x0=null;
  if(Math.abs(dx)>60) ir(dx<0?1:-1);
},{passive:true});
var h=parseInt((location.hash||'').slice(1),10); if(h>0&&h<=T) i=h-1;
document.getElementById('agora').textContent=new Date().toLocaleString('pt-BR').slice(0,16);
pinta();
</script></body></html>`;
}
