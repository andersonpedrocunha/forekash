/* ═══════════════════════════════════════════════════════════════════════
   ACOMPANHAR RECEITA NO SLACK
   ═══════════════════════════════════════════════════════════════════════
   Quem liga o acompanhamento é o app, marcando `metadata.slackTrack.ativo`
   no lançamento. Daqui pra frente quem fala é o Worker — e só ele.

   Por que o Worker e não o navegador: a aba fecha, o notebook dorme, e um
   recebimento que muda de status no domingo tem que avisar do mesmo jeito.
   Um dono só também é o que impede a mesma mudança virar duas mensagens.

   O cartão fica fixo no canal e é EDITADO a cada mudança, com a história
   indo pra thread. Assim quem chega agora lê o estado atual sem rolar, e
   quem acompanha vê o caminho sem poluir o canal.                         */

/* O rótulo depende da DIREÇÃO. "Recebido" num pagamento a fornecedor lê
   como se o dinheiro tivesse entrado — o contrário do que aconteceu. */
const STATUS_LBL_GANHO = {
  pendente: 'Em aberto', atrasado: 'Atrasado',
  parcial:  'Recebido em parte', pago: 'Recebido'
};
const STATUS_LBL_GASTO = {
  pendente: 'Em aberto', atrasado: 'Atrasado',
  parcial:  'Pago em parte',    pago: 'Pago'
};
const rotuloStatus = (linha, st) =>
  (linha && linha.tipo === 'gasto' ? STATUS_LBL_GASTO : STATUS_LBL_GANHO)[st];
const STATUS_ICO = { pendente:'○', atrasado:'●', parcial:'◐', pago:'●' };

function brl(v){
  return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR',
    { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function dataBR(ymd){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))
    ? ymd.slice(8,10) + '/' + ymd.slice(5,7) + '/' + ymd.slice(0,4) : '—';
}
function hojeSP(){
  const f = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo',
    year:'numeric', month:'2-digit', day:'2-digit' });
  return f.format(new Date());
}

/* ── as contas, iguais às do app ─────────────────────────────────────── */
function retTotal(m){
  const r = (m && m.retencoes) || [];
  return Array.isArray(r) ? r.reduce((s,x) => s + (parseFloat(x && x.valor) || 0), 0) : 0;
}
/* O que entra na conta é o líquido: a retenção é recolhida pelo cliente e
   nunca passa pelo caixa. Comparar baixa contra bruto faria todo título com
   retenção parecer eternamente parcial. */
function alvoCaixa(linha){
  const v = Math.abs(parseFloat(linha.valor) || 0);
  const r = retTotal(linha.metadata);
  return r ? Math.max(0, v - r) : v;
}
function recebido(linha){
  const b = (linha.metadata && linha.metadata.baixas) || [];
  if(Array.isArray(b) && b.length) return b.reduce((s,x) => s + (parseFloat(x && x.valor) || 0), 0);
  return linha.status === 'pago' ? alvoCaixa(linha) : 0;
}
function vencimento(linha){
  return (linha.metadata && linha.metadata.dataVencimento) || linha.data || '';
}
function statusDe(linha){
  const alvo = alvoCaixa(linha), rec = recebido(linha);
  if(linha.status === 'pago' || (alvo > 0 && rec >= alvo - 0.005)) return 'pago';
  if(rec > 0.005) return 'parcial';
  const v = vencimento(linha);
  if(v && v < hojeSP()) return 'atrasado';
  return 'pendente';
}

/* ── o cartão ────────────────────────────────────────────────────────
   Cinco coisas e mais nada: cliente, descrição, documento, vencimento,
   status.
   O valor fica de fora de propósito — o canal é da equipe inteira, e nem
   todo mundo que precisa saber que a nota venceu precisa saber quanto é.

   A barra lateral é o status, na mesma paleta do app: verde continua
   querendo dizer verde nos dois lugares. A marca no topo é o que separa
   o cartão do Forekash de qualquer outro bot no canal.                    */
const STATUS_COR = {
  pendente:'#64748B', atrasado:'#DC2626', parcial:'#D97706', pago:'#16A34A'
};
/* Quadrado cheio, sem canto arredondado: o arredondamento virava moldura
   clara quando o PNG era rasterizado sobre fundo branco. Nome versionado
   porque o Slack cacheia imagem pela URL — trocar o arquivo no mesmo
   endereço não troca o que o canal mostra. */
const MARCA = 'https://forekash.com.br/forekash-marca-v2.png';

/* O que o cartão mostra. O padrão é enxuto de propósito: nome, documento,
   vencimento e status respondem "de quem é, qual papel, pra quando e como
   está" — que é o que o canal precisa. VALOR fica de fora por padrão porque
   canal de Slack é lido por gente que não precisa ver quanto a empresa
   recebe ou paga. Quem quiser liga em Integrações; o produto não decide isso
   pelo cliente. */
const CARTAO_PADRAO = { descricao:true, documento:true, vencimento:true,
                        categoria:false, conta:false, valor:false };
const mostra = (campos, k) =>
  (campos && typeof campos[k] === 'boolean') ? campos[k] : CARTAO_PADRAO[k];

const moedaBR = v => {
  const n = Number(v);
  if(!isFinite(n)) return '';
  return 'R$ ' + Math.abs(n).toLocaleString('pt-BR',
    { minimumFractionDigits:2, maximumFractionDigits:2 });
};

function cartao(linha, campos){
  const st   = statusDe(linha);
  const ehGasto = (linha.tipo === 'gasto');
  const cli  = (linha.contraparte || '').trim()
            || (ehGasto ? '(fornecedor não informado)' : '(cliente não informado)');
  const desc = String(linha.descricao || '').trim();
  const venc = vencimento(linha);
  /* O número é o que o time usa pra achar a nota no sistema do cliente —
     sem ele, cobrar vira "aquela do mês passado". Vazio sai do cartão em
     vez de virar um traço: campo vazio ensina a ignorar o campo. */
  const doc  = String(linha.numero_documento || '').trim();

  /* A linha de baixo muda de texto conforme o estado — um rodapé que diz
     sempre a mesma coisa some da vista depois do terceiro cartão. */
  const rodape = st === 'pago'   ? 'fechado · não mexo mais neste'
               : st === 'atrasado' ? 'passou do vencimento · continuo de olho'
               : st === 'parcial'  ? 'parcial · aviso quando fechar'
               : 'de olho · aviso aqui quando mudar';

  return {
    /* O fallback é o que aparece na notificação do celular e na lista de
       conversas — tem que dizer de quem é e como está, sozinho. */
    text: cli + ' · ' + rotuloStatus(linha, st),
    attachments: [{
      color: STATUS_COR[st],
      blocks: [
        /* `block_id` é a identidade do cartão no canal — invisível pra quem
           lê, e é por ela que o Worker reconhece "este cartão já está aqui"
           sem depender de nenhum registro nosso. */
        { type:'context', block_id: 'fk-trk-' + (linha.local_id || '0'), elements:[
          { type:'image', image_url: MARCA, alt_text:'Forekash' },
          { type:'mrkdwn', text:'*FOREKASH*  ·  ' + (ehGasto ? 'despesa acompanhada' : 'receita acompanhada') }
        ]},
        { type:'section', text:{ type:'mrkdwn',
          text:'*' + cli + '*'
             + ((desc && mostra(campos,'descricao')) ? '\n' + desc.slice(0,220) : '') } },
        /* Status é a espinha do cartão — é por ele que o cartão existe, então
           não entra na escolha. O resto é opcional. */
        { type:'section', fields: [].concat(
            (doc && mostra(campos,'documento'))
              ? [{ type:'mrkdwn', text:'*Documento*\n' + doc }] : [],
            mostra(campos,'vencimento')
              ? [{ type:'mrkdwn', text:'*Vencimento*\n' + dataBR(venc) }] : [],
            (mostra(campos,'valor') && linha.valor != null)
              ? [{ type:'mrkdwn', text:'*Valor*\n' + moedaBR(linha.valor) }] : [],
            (mostra(campos,'categoria') && linha.categoria)
              ? [{ type:'mrkdwn', text:'*Categoria*\n' + String(linha.categoria).slice(0,60) }] : [],
            (mostra(campos,'conta') && linha.conta)
              ? [{ type:'mrkdwn', text:'*Conta*\n' + String(linha.conta).slice(0,60) }] : [],
            [{ type:'mrkdwn', text:'*Status*\n' + STATUS_ICO[st] + '  ' + rotuloStatus(linha, st) }]
          )},
        { type:'context', elements:[{ type:'mrkdwn', text:'MR KASH · ' + rodape }] }
      ]
    }]
  };
}

/* O que a thread diz quando muda. Frase curta: quem lê no celular lê a
   notificação, não abre o cartão. Sem valor aqui também. */
function recado(linha, antes, agora, recAntes, recAgora){
  const ehGasto = (linha && linha.tipo === 'gasto');
  if(agora === 'pago'){
    return (ehGasto ? '●  *Pago*' : '●  *Recebido*')
      + (linha.data_pagamento ? ' em ' + dataBR(linha.data_pagamento) : '');
  }
  if(agora === 'parcial'){
    if(antes === 'parcial')
      return ehGasto ? '◐  Entrou mais um pagamento parcial'
                     : '◐  Entrou mais um recebimento parcial';
    return ehGasto ? '◐  *Pago em parte* — ainda falta fechar'
                   : '◐  *Recebido em parte* — ainda falta fechar';
  }
  if(agora === 'atrasado') return '●  *Atrasado* — venceu em ' + dataBR(vencimento(linha));
  if(antes === 'pago') return '○  Baixa desfeita — voltou pra ' + rotuloStatus(linha, agora);
  return '○  Agora: ' + rotuloStatus(linha, agora);
}

/* ── Slack ───────────────────────────────────────────────────────────── */
async function slack(env, metodo, corpo){
  const r = await fetch('https://slack.com/api/' + metodo, {
    method:'POST',
    headers:{ Authorization:'Bearer ' + env.SLACK_BOT_TOKEN, 'content-type':'application/json' },
    body: JSON.stringify(corpo)
  });
  return r.json();   // o Slack devolve 200 com ok:false; quem chama confere
}

/* ── Supabase ────────────────────────────────────────────────────────── */
async function sbGet(env, caminho){
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/' + caminho, {
    headers:{ apikey: env.SUPABASE_SERVICE_KEY,
              Authorization:'Bearer ' + env.SUPABASE_SERVICE_KEY } });
  if(!r.ok) throw new Error('supabase ' + r.status + ': ' + (await r.text()).slice(0,160));
  return r.json();
}
/* ══ TRAVA CONTRA CARTÃO DUPLICADO ═════════════════════════════════
   A Cloudflare não promete execução única do cron: duas rodadas podem
   entrar na mesma janela, as duas lerem `ts` vazio e as duas postarem. Foi
   o que aconteceu com o cartão da Bloom — dois cartões idênticos no canal,
   e só um deles recebendo as atualizações depois.

   A reserva é feita NO BANCO, com filtro: o PATCH só se aplica se ninguém
   tiver reservado antes. Quem não conseguir a reserva não posta.
   Reserva velha (Worker que morreu no meio) vence em 5 minutos, senão o
   lançamento ficaria travado pra sempre. */
const RESERVA_MS = 5 * 60 * 1000;
async function reservar(env, linha){
  const t = Object.assign({}, linha.metadata.slackTrack);
  const antiga = t.postando ? (Date.now() - new Date(t.postando).getTime()) : null;
  if(antiga != null && antiga < RESERVA_MS){
    console.log('[trilha] ' + linha.local_id + ' já reservado há ' + Math.round(antiga/1000) + 's — pulando');
    return false;
  }
  const meta = Object.assign({}, linha.metadata);
  meta.slackTrack = Object.assign({}, t, { postando: new Date().toISOString() });
  /* O filtro é a trava: `postando` tem que continuar como estava. Se outra
     rodada reservou no meio, este PATCH não casa com nenhuma linha. */
  const filtro = (antiga == null)
    ? '&metadata->slackTrack->>postando=is.null'
    : '&metadata->slackTrack->>postando=eq.' + encodeURIComponent(t.postando);
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/extrato_lancamentos?id=eq.' + linha.id + filtro, {
    method:'PATCH',
    headers:{ apikey: env.SUPABASE_SERVICE_KEY,
              Authorization:'Bearer ' + env.SUPABASE_SERVICE_KEY,
              'content-type':'application/json', Prefer:'return=representation' },
    body: JSON.stringify({ metadata: meta })
  });
  if(!r.ok){ console.warn('[trilha] reserva falhou: ' + r.status); return false; }
  const linhas = await r.json();
  if(!linhas.length){ console.log('[trilha] ' + linha.local_id + ' reservado por outra rodada'); return false; }
  return true;
}

/* ══ SEGUNDO CARIMBO, FORA DO ALCANCE DO APP ═══════════════════════════
   O carimbo vive em `metadata.slackTrack.ts`, no mesmo objeto que o app
   escreve. Em 05/11/2026 uma aba aberta mandou esse objeto por cima sem o
   `ts` — e o cron, lendo "ainda não postei", publicou o mesmo cartão quatro
   vezes no canal do time. A trava no banco agora preserva campo a campo,
   mas depender de um lugar só pra uma coisa que aparece na frente de todo
   mundo é pouco.

   Então o Worker guarda um segundo registro no KV, onde o app não escreve e
   nem tem como: `trk:<org>:<local_id>` → o ts do cartão. Antes de publicar
   um cartão NOVO ele consulta esse livro. Se já houver registro, ele não
   posta: adota o ts de volta e segue atualizando o cartão que já existe —
   conserta o carimbo em vez de sujar o canal.

   Não substitui a trava do banco; é a segunda chave da mesma porta. */
const trkChave = (env, localId) => 'trk:' + env.FOREKASH_ORG_ID + ':' + localId;

/* TERCEIRA CHAVE: olhar o canal. O KV e o banco são registros NOSSOS; este
   é o fato. Procura no histórico recente um cartão com o `block_id` deste
   lançamento e devolve o ts dele.

   Degrada sem barulho: sem `channels:history`/`groups:history` o Slack
   responde `missing_scope`, e aí seguimos com as outras duas travas em vez
   de parar de postar. Instalação antiga continua funcionando; quem
   reinstalar ganha a camada a mais. */
async function trkNoCanal(env, canal, localId, desde){
  try{
    const corpo = { channel: canal, limit: 60 };
    if(desde){
      const t0 = Math.floor(new Date(desde).getTime() / 1000) - 120;
      if(isFinite(t0) && t0 > 0) corpo.oldest = String(t0);
    }
    const j = await slack(env, 'conversations.history', corpo);
    if(!j.ok){
      if(j.error !== 'missing_scope')
        console.warn('[trilha] não consegui ler o canal: ' + j.error);
      return null;
    }
    const marca = 'fk-trk-' + localId;
    /* Busca no JSON inteiro da mensagem: o bloco pode vir dentro de
       `blocks` ou de `attachments[].blocks` conforme como foi postado, e
       depender da forma exata seria frágil à toa. */
    const achada = (j.messages || []).find(m => {
      try{ return JSON.stringify(m).includes('"' + marca + '"'); }catch(_){ return false; }
    });
    return achada ? achada.ts : null;
  }catch(e){ console.warn('[trilha] leitura do canal falhou: ' + e.message); return null; }
}

async function trkLido(env, localId){
  try{
    if(!env.SLACK_INSTALLS) return null;
    return await env.SLACK_INSTALLS.get(trkChave(env, localId));
  }catch(e){ console.warn('[trilha] KV leitura falhou: ' + e.message); return null; }
}
async function trkAnotado(env, localId, ts, canalId){
  try{
    if(!env.SLACK_INSTALLS) return;
    await env.SLACK_INSTALLS.put(trkChave(env, localId),
      JSON.stringify({ ts: ts, canalId: canalId || '', em: new Date().toISOString() }));
  }catch(e){ console.warn('[trilha] KV escrita falhou: ' + e.message); }
}

/* Grava só o slackTrack, relendo a linha antes: entre a leitura do cron e a
   escrita o usuário pode ter mexido no lançamento, e mandar o metadata
   inteiro de volta apagaria a edição dele. */
async function gravarTrilha(env, id, trilha){
  const atual = await sbGet(env, 'extrato_lancamentos?id=eq.' + id + '&select=metadata');
  const meta = (atual[0] && atual[0].metadata) || {};
  meta.slackTrack = trilha;
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/extrato_lancamentos?id=eq.' + id, {
    method:'PATCH',
    headers:{ apikey: env.SUPABASE_SERVICE_KEY,
              Authorization:'Bearer ' + env.SUPABASE_SERVICE_KEY,
              'content-type':'application/json', Prefer:'return=minimal' },
    body: JSON.stringify({ metadata: meta })
  });
  if(!r.ok) throw new Error('não gravei a trilha: ' + r.status);
}

/* ── o passo do cron ─────────────────────────────────────────────────── */
export async function acompanharReceitas(env, canalPadrao, cfgCampos){
  /* Ordem igual à da tela: o canal do próprio lançamento manda, depois o
     canal das receitas, depois o padrão do Slack. */
  const linhas = await sbGet(env,
    'extrato_lancamentos?org_id=eq.' + env.FOREKASH_ORG_ID +
    '&metadata->slackTrack->>ativo=eq.true' +
    '&select=id,local_id,data,valor,descricao,categoria,contraparte,conta,status,tipo,' +
    'numero_documento,data_pagamento,metadata&limit=400');

  let novos = 0, mudados = 0;
  for(const l of linhas){
    const t = Object.assign({}, l.metadata.slackTrack);
    const canal = t.canal || canalPadrao;
    if(!canal){ console.warn('[trilha] sem canal pra ' + l.local_id); continue; }
    const st  = statusDe(l);
    const rec = recebido(l);
    const c   = cartao(l, cfgCampos);

    try{
      /* Primeiro contato: nasce o cartão no canal. Só depois de reservar. */
      if(!t.ts){
        /* ANTES DE POSTAR, PERGUNTA SE JÁ POSTOU. O carimbo do metadata pode
           ter sido apagado por uma aba antiga; o do KV, não. Se ele existe,
           o cartão está no canal — recupera o ts e não publica de novo. */
        const jaFoi = await trkLido(env, l.local_id);
        if(jaFoi){
          let v = null;
          try{ v = JSON.parse(jaFoi); }catch(_){ v = { ts: jaFoi }; }
          if(v && v.ts){
            console.warn('[trilha] ' + l.local_id + ' já tinha cartão (' + v.ts +
                         ') — carimbo perdido, recuperando em vez de repostar');
            t.ts = v.ts;
            if(v.canalId) t.canalId = v.canalId;
            t.statusVisto = st; t.recebidoVisto = rec;
            delete t.postando;
            await gravarTrilha(env, l.id, t);
            continue;
          }
        }
        /* E, por último, o fato: o cartão está no canal? Se estiver, não
           publica outro — adota o que já existe. */
        const tsNoCanal = await trkNoCanal(env, canal, l.local_id, t.desde);
        if(tsNoCanal){
          console.warn('[trilha] ' + l.local_id + ' já está no canal (' + tsNoCanal +
                       ') — adotando em vez de repostar');
          t.ts = tsNoCanal; t.canalId = t.canalId || canal;
          t.statusVisto = st; t.recebidoVisto = rec;
          delete t.postando;
          await trkAnotado(env, l.local_id, t.ts, t.canalId);
          await gravarTrilha(env, l.id, t);
          continue;
        }

        if(!await reservar(env, l)) continue;
        const r = await slack(env, 'chat.postMessage',
          Object.assign({ channel: canal, unfurl_links:false }, c));
        if(!r.ok){
          /* Canal público em que o bot ainda não entrou: entra e tenta de novo.
             Sem isto, ligar o acompanhamento salvava bonitinho e só falhava
             no primeiro disparo — calado. */
          if(r.error === 'not_in_channel'){
            const j = await slack(env, 'conversations.join', { channel: canal });
            if(!j.ok) throw new Error('não entrei no canal: ' + j.error);
            const r2 = await slack(env, 'chat.postMessage',
              Object.assign({ channel: canal, unfurl_links:false }, c));
            if(!r2.ok) throw new Error(r2.error);
            t.ts = r2.ts; t.canalId = r2.channel;
          } else throw new Error(r.error);
        } else { t.ts = r.ts; t.canalId = r.channel; }
        t.statusVisto = st; t.recebidoVisto = rec;
        t.desde = t.desde || new Date().toISOString();
        delete t.postando;                     // reserva cumprida
        /* O livro ANTES do banco: se a gravação do metadata falhar, o KV já
           impede o cartão repetido na próxima rodada. A ordem inversa
           deixaria exatamente a janela que causou as quatro mensagens. */
        await trkAnotado(env, l.local_id, t.ts, t.canalId);
        await gravarTrilha(env, l.id, t);
        novos++;
        continue;
      }

      /* Nada mudou: não custa nada e não diz nada. Sai. */
      const mudouStatus = t.statusVisto !== st;
      const mudouValor  = Math.abs((Number(t.recebidoVisto) || 0) - rec) > 0.005;
      if(!mudouStatus && !mudouValor) continue;

      await slack(env, 'chat.update',
        Object.assign({ channel: t.canalId || canal, ts: t.ts }, c));
      await slack(env, 'chat.postMessage', {
        channel: t.canalId || canal, thread_ts: t.ts, unfurl_links:false,
        text: recado(l, t.statusVisto, st, Number(t.recebidoVisto) || 0, rec)
      });
      t.statusVisto = st; t.recebidoVisto = rec;
      await gravarTrilha(env, l.id, t);
      mudados++;
    }catch(e){
      /* Um título que falhe não pode calar os outros da mesma rodada. */
      console.error('[trilha] lançamento ' + l.local_id + ':', e && e.message);
    }
  }
  if(novos || mudados) console.log('[trilha] ' + novos + ' novo(s), ' + mudados + ' atualizado(s)');
  return { novos, mudados, total: linhas.length };
}

export const _testes = { statusDe, alvoCaixa, recebido, cartao, recado, brl, dataBR };

/* ══ AVISOS DE LANÇAMENTO ═════════════════════════════════════════════════
   Anúncio configurado pela empresa, postado uma vez só quando a condição
   acontece. Diferente do cartão de receita: ali o cartão vive e é editado a
   cada mudança; aqui é um aviso e pronto.

   O caso que originou: a recarga do cartão de benefício cai em dia aleatório
   e alguém tinha que lembrar de avisar o time todo mês. O aviso não é "do
   iFood" — a empresa escreve a frase, escolhe o canal e o gatilho, e aponta
   o lançamento pro aviso. Serve pra qualquer anúncio que dependa de um
   lançamento acontecer.                                                    */

const AV_VARS = ['{descricao}','{valor}','{data}','{fornecedor}','{categoria}','{conta}'];

function avTexto(aviso, l){
  const m = l.metadata || {};
  const mapa = {
    '{descricao}': l.descricao || '—',
    '{valor}': brl(l.valor),
    '{data}': dataBR(m.dataVencimento || l.data),
    '{fornecedor}': l.contraparte || '—',
    '{categoria}': l.categoria || '—',
    '{conta}': l.conta || '—'
  };
  /* Mesma tolerância da prévia na tela: `{Valor}` e `{ valor }` valem igual.
     As duas pontas TÊM que substituir do mesmo jeito — se divergirem, ele
     configura olhando um texto e o canal recebe outro. */
  return String(aviso.texto || '')
    .replace(/\{\s*([a-zA-ZÀ-ÿ]+)\s*\}/g, (achado, nome) => {
      const k = '{' + String(nome).toLowerCase() + '}';
      return Object.prototype.hasOwnProperty.call(mapa, k) ? mapa[k] : achado;
    })
    .trim();
}

/* A condição do gatilho. Pago usa o mesmo critério do resto do app: tem baixa
   cobrindo o valor, ou o status diz pago. */
const AV_CRIADO_JANELA_MS = 36 * 60 * 60 * 1000;   // 36h
function avDisparou(aviso, l){
  const quando = aviso.quando || 'pago';
  if(quando === 'criado'){
    /* "Ao criar" tem que significar QUANDO FOI CRIADO, não "sempre que eu
       reparar que existe". Sem a janela, apontar esse aviso pra uma série de
       48 lançamentos antigos — pelo "este e os seguintes" — faria o canal
       receber 48 mensagens no mesmo minuto. */
    const c = (l.metadata && l.metadata.criadoEm) || '';
    const t = c ? Date.parse(c) : NaN;
    if(!isFinite(t)) return false;
    return (Date.now() - t) <= AV_CRIADO_JANELA_MS;
  }
  const st = statusDe(l);
  if(quando === 'pago') return st === 'pago';
  if(quando === 'vencido'){
    if(st === 'pago') return false;
    const venc = (l.metadata && l.metadata.dataVencimento) || l.data || '';
    return !!venc && venc < hojeSP();
  }
  return false;
}

/* Mesma reserva da trilha, por motivo igual: duas rodadas do cron podem
   entrar na mesma janela e postar o mesmo aviso duas vezes. A trava é no
   banco, com filtro — quem não conseguir reservar não posta. */
async function avReservar(env, linha){
  const m = Object.assign({}, linha.metadata);
  const antes = m.slackAvisoPostando || null;
  const idade = antes ? (Date.now() - new Date(antes).getTime()) : null;
  if(idade != null && idade < RESERVA_MS) return false;
  m.slackAvisoPostando = new Date().toISOString();
  const filtro = (idade == null)
    ? '&metadata->>slackAvisoPostando=is.null'
    : '&metadata->>slackAvisoPostando=eq.' + encodeURIComponent(antes);
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/extrato_lancamentos?id=eq.' + linha.id + filtro, {
    method:'PATCH',
    headers:{ apikey: env.SUPABASE_SERVICE_KEY,
              Authorization:'Bearer ' + env.SUPABASE_SERVICE_KEY,
              'content-type':'application/json', Prefer:'return=representation' },
    body: JSON.stringify({ metadata: m })
  });
  if(!r.ok) return false;
  return (await r.json()).length > 0;
}

/* Carimba o "já avisei". Relê a linha antes de gravar — entre a leitura do
   cron e a escrita o usuário pode ter mexido no lançamento, e devolver o
   metadata inteiro apagaria a edição dele. */
async function avCarimbar(env, id, ts, canal) {
  const atual = await sbGet(env, 'extrato_lancamentos?id=eq.' + id + '&select=metadata');
  const meta = (atual[0] && atual[0].metadata) || {};
  meta.slackAvisoPostado = new Date().toISOString();
  meta.slackAvisoTs = ts || '';
  meta.slackAvisoCanal = canal || '';
  delete meta.slackAvisoPostando;
  await fetch(env.SUPABASE_URL + '/rest/v1/extrato_lancamentos?id=eq.' + id, {
    method:'PATCH',
    headers:{ apikey: env.SUPABASE_SERVICE_KEY,
              Authorization:'Bearer ' + env.SUPABASE_SERVICE_KEY,
              'content-type':'application/json', Prefer:'return=minimal' },
    body: JSON.stringify({ metadata: meta })
  });
}

export async function avisarLancamentos(env, cfg, canalPadrao){
  const avisos = (cfg && cfg.avisosLanc) || [];
  if(!avisos.length) return 0;
  const porId = {};
  for(const a of avisos) if(a && a.id) porId[a.id] = a;

  /* Só o que aponta pra um aviso e ainda não foi anunciado. O carimbo é o que
     garante uma vez só — sem ele o cron repetiria o aviso a cada 10 minutos. */
  const linhas = await sbGet(env,
    'extrato_lancamentos?org_id=eq.' + env.FOREKASH_ORG_ID +
    '&metadata->>slackAviso=not.is.null' +
    '&metadata->>slackAvisoPostado=is.null' +
    '&select=id,local_id,data,valor,descricao,categoria,contraparte,conta,status,tipo,' +
    'data_pagamento,metadata&limit=200');

  let postados = 0;
  for(const l of linhas){
    const aviso = porId[(l.metadata || {}).slackAviso];
    if(!aviso || aviso.ativo === false) continue;
    if(!String(aviso.texto || '').trim()) continue;
    if(!avDisparou(aviso, l)) continue;

    const canal = aviso.canal || canalPadrao;
    if(!canal){ console.warn('[aviso] sem canal pra ' + l.local_id); continue; }
    if(!await avReservar(env, l)) continue;

    try{
      const texto = avTexto(aviso, l);
      let r = await slack(env, 'chat.postMessage',
        { channel: canal, text: texto, unfurl_links:false });
      /* Canal público em que o bot ainda não entrou: entra e tenta de novo —
         mesma recuperação da trilha. */
      if(!r.ok && (r.error === 'not_in_channel' || r.error === 'channel_not_found')){
        await slack(env, 'conversations.join', { channel: canal });
        r = await slack(env, 'chat.postMessage',
          { channel: canal, text: texto, unfurl_links:false });
      }
      if(!r.ok){ console.error('[aviso] ' + l.local_id + ': ' + r.error); continue; }
      await avCarimbar(env, l.id, r.ts, canal);
      postados++;
    }catch(err){
      console.error('[aviso] ' + l.local_id + ':', err && err.message);
    }
  }
  if(postados) console.log('[aviso] ' + postados + ' aviso(s) postado(s)');
  return postados;
}
