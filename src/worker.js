/* ═══════════════════════════════════════════════════════════════════════
   MR KASH FORA DA ABA
   ═══════════════════════════════════════════════════════════════════════
   Duas bocas, uma cabeça:
   - scheduled()  → os avisos do mês no canal da empresa
   - fetch()      → responde quando chamam no Slack; o resto do site segue
                    sendo servido pelos assets, exatamente como antes

   Tudo que não for /api/ cai em env.ASSETS.fetch — o site não muda de
   comportamento por existir um Worker na frente.                          */

import { carregar, briefing, vocabulario, criarLancamento,
         grafico, GRAFICOS } from './forekash.js';
import { perguntar, postar, assinaturaValida, podeLancar,
         LANCAR, separarLancamento, cartaoLancamento } from './mrkash.js';

const ok = (t) => new Response(t || '', { status: 200 });

/* O que o MR KASH pode ver quando responde PELO SLACK. Trava ligada por
   padrão: se a variável não existir, ele fica no modo restrito em vez de
   abrir tudo — esquecer de configurar não pode virar vazamento.
   `MRK_SLACK_LIBERAR="pessoa"` solta o individual; `"divida"` solta a dívida;
   `"pessoa divida"` solta as duas. */
function escopoSlack(env){
  const livre = String(env.MRK_SLACK_LIBERAR || '').toLowerCase();
  return { semPessoa: !livre.includes('pessoa'), semDivida: !livre.includes('divida') };
}

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if(url.pathname === '/api/slack/events' && request.method === 'POST')
      return eventosSlack(request, env, ctx);
    if(url.pathname === '/api/slack/comando' && request.method === 'POST')
      return comandoSlack(request, env, ctx);
    if(url.pathname === '/api/slack/interativo' && request.method === 'POST')
      return interativoSlack(request, env, ctx);
    /* Só pra conferir que o Worker está no ar sem falar com o Slack.
       Não devolve número nenhum: é diagnóstico de encanamento.

       Com ?teste=1 ele tenta LER o banco e diz se conseguiu. Existe porque
       descobrir que uma chave foi colada errada pelo erro que aparece no
       Slack custa uma ida e volta inteira a cada tentativa — e chave longa
       colada em campo de painel erra com frequência. Devolve "ok" ou o
       motivo, nunca dado financeiro. */
    if(url.pathname === '/api/mrkash/ping'){
      const r = { ok: true, cron: !!env.SLACK_CANAL_EQUIPE,
                  modelo: env.MRK_MODEL || 'claude-opus-5-5',
                  temChaves: {
                    anthropic: !!env.ANTHROPIC_API_KEY, supabase: !!env.SUPABASE_SERVICE_KEY,
                    slackBot: !!env.SLACK_BOT_TOKEN, slackAssinatura: !!env.SLACK_SIGNING_SECRET
                  } };
      if(url.searchParams.get('teste')){
        try{
          const q = await fetch(env.SUPABASE_URL + '/rest/v1/module_blobs?select=module&limit=1',
            { headers: { apikey: env.SUPABASE_SERVICE_KEY,
                         Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY } });
          r.supabase = q.ok ? 'ok' : ('erro ' + q.status + ': ' + (await q.text()).slice(0,120));
        }catch(e){ r.supabase = 'erro: ' + (e && e.message || 'falhou'); }
      }
      return Response.json(r);
    }
    return new Response('não existe', { status: 404 });
  },

  async scheduled(event, env, ctx){
    ctx.waitUntil(avisosDoMes(env).catch(e => console.error('aviso mensal:', e && e.message)));
  }
};

// ── Interação ───────────────────────────────────────────────────────────
async function eventosSlack(request, env, ctx){
  const corpo = await request.text();
  const assinado = await assinaturaValida(env, request.headers.get('x-slack-signature'),
                                          request.headers.get('x-slack-request-timestamp'), corpo);
  if(!assinado) return new Response('assinatura inválida', { status: 401 });
  const ev = JSON.parse(corpo);
  if(ev.type === 'url_verification') return ok(ev.challenge);   // handshake da instalação

  const m = ev.event || {};
  if(m.bot_id || m.subtype) return ok();          // não responde a si mesmo nem a edição
  if(m.type !== 'app_mention' && !(m.type === 'message' && m.channel_type === 'im')) return ok();

  /* O Slack reenvia se não receber 200 em 3 segundos, e o modelo pensa mais
     que isso. Responde já e manda a resposta depois. */
  ctx.waitUntil(responder(env, m).catch(async e => {
    console.error('responder:', e && e.message);
    try{ await postar(env, m.channel, 'Deu ruim aqui: ' + (e && e.message || 'erro'),
                      { thread_ts: m.thread_ts || m.ts }); }catch(_){}
  }));
  return ok();
}

async function comandoSlack(request, env, ctx){
  const corpo = await request.text();
  const assinado = await assinaturaValida(env, request.headers.get('x-slack-signature'),
                                          request.headers.get('x-slack-request-timestamp'), corpo);
  if(!assinado) return new Response('assinatura inválida', { status: 401 });
  const p = new URLSearchParams(corpo);
  const user = p.get('user_id');
  let texto = (p.get('text') || '').trim();

  /* `/grafico` é comando próprio, não um argumento escondido dentro de
     `/mrkash`. Enterrado lá, ninguém descobre que existe; como comando, o
     autocomplete do Slack mostra as opções enquanto a pessoa digita.
     Os dois caem aqui — o que muda é só o prefixo. */
  if((p.get('command') || '').replace('/','') === 'grafico') texto = 'grafico ' + texto;

  if(!texto)
    return Response.json({ response_type: 'ephemeral', text: 'Pergunta alguma coisa.' });

  /* Gatilho manual dos avisos. Existe porque o automático só dispara no dia
     marcado, e descobrir daqui a uma semana que a postagem no canal falha é
     tarde demais. Também serve no dia a dia: dá pra repetir um lembrete sem
     esperar o mês virar.

     Vai pra lista, não pro público: perguntar é livre, mas disparar mensagem
     no canal da empresa inteira em nome do MR KASH, não. */
  /* `/mrkash grafico` sem nada lista o que existe, com botão. Com o nome,
     desenha direto. Ler é livre, então gráfico também é — o recorte de folha
     e dívida vale aqui igual ao das respostas. */
  if(/^(gr[áa]fico|graf)\b/i.test(texto)){
    const qual = texto.replace(/^(gr[áa]fico|graf)\s*/i, '').trim().toLowerCase();
    const achado = GRAFICOS.find(g => qual && (g.id === qual || g.titulo.toLowerCase().includes(qual)));
    if(!achado){
      return Response.json({ response_type:'ephemeral', text:'Qual deles?', blocks: [
        { type:'section', text:{ type:'mrkdwn', text:'*Qual deles?*' } },
        { type:'actions', block_id:'grafico', elements: GRAFICOS.map(g => ({
            type:'button', action_id:'graf:' + g.id, value:g.id,
            text:{ type:'plain_text', text:g.titulo } })) },
        { type:'context', elements:[{ type:'mrkdwn',
            text:'Ou direto: ' + GRAFICOS.map(g => '`/grafico ' + g.id + '`').join(' · ') }] }
      ]});
    }
    ctx.waitUntil((async () => {
      let txt;
      try{ txt = montarGrafico(await carregar(env), achado.id, escopoSlack(env)); }
      catch(e){ txt = 'Não desenhei: ' + (e && e.message || 'erro'); }
      await fetch(p.get('response_url'), { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ response_type:'in_channel', text: txt }) });
    })());
    return Response.json({ response_type:'ephemeral', text:'Desenhando...' });
  }

  const teste = /^(testar|aviso|avisar)\b/i.exec(texto);
  if(teste){
    if(!podeLancar(env, user))
      return Response.json({ response_type:'ephemeral',
        text:'Disparar aviso no canal não é pra ti.\n_(teu id é `' + user + '`)_' });
    const qual = texto.replace(/^(testar|aviso|avisar)\s*/i, '').trim().toLowerCase();
    const canal = env.SLACK_CANAL_EQUIPE;
    if(!canal) return Response.json({ response_type:'ephemeral', text:'SLACK_CANAL_EQUIPE não configurado.' });
    ctx.waitUntil((async () => {
      let msg;
      try{
        if(/benef/.test(qual)){ await avisoBeneficios(env, canal); msg = 'Aviso de benefícios postado no canal.'; }
        else                  { await avisoNota(env, canal);       msg = 'Lembrete da nota postado no canal.'; }
      }catch(e){ msg = 'Não consegui postar: ' + (e && e.message || 'erro'); }
      await fetch(p.get('response_url'), { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ response_type:'ephemeral', text: msg }) });
    })());
    return Response.json({ response_type:'ephemeral', text:'Postando...' });
  }

  const responseUrl = p.get('response_url');
  ctx.waitUntil((async () => {
    let txt;
    try{
      const d = await carregar(env);
      txt = await perguntar(env, texto, briefing(d, escopoSlack(env)));
    }catch(e){ txt = 'Deu ruim aqui: ' + (e && e.message || 'erro'); }
    await fetch(responseUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ response_type: 'ephemeral', text: txt }) });
  })());
  // ack imediato: o Slack mostra isso enquanto ele pensa
  return Response.json({ response_type: 'ephemeral', text: 'Lendo teus números...' });
}

/* O gráfico em bloco de código: é o que chega igual no celular e no desktop.
   O rodapé fica FORA do bloco porque é fala, não dado. */
function montarGrafico(d, id, op){
  const g = grafico(d, id, op);
  if(!g) return 'Não tenho dado pra desenhar isso.';
  return '*' + g.titulo + '*\n```\n' + g.corpo + '\n```' + (g.rodape ? '\n' + g.rodape : '');
}

/* ── O clique nos botões ─────────────────────────────────────────────────
   É aqui, e só aqui, que algo é gravado. A proposta chega dentro do próprio
   botão, assinada pelo Slack; a permissão é conferida de novo, porque quem
   clica não é necessariamente quem pediu — num canal, qualquer um vê o
   cartão. */
async function interativoSlack(request, env, ctx){
  const corpo = await request.text();
  const assinado = await assinaturaValida(env, request.headers.get('x-slack-signature'),
                                          request.headers.get('x-slack-request-timestamp'), corpo);
  if(!assinado) return new Response('assinatura inválida', { status: 401 });
  const p = JSON.parse(new URLSearchParams(corpo).get('payload') || '{}');
  if(p.type !== 'block_actions') return ok();

  const acao = (p.actions || [])[0] || {};
  const quem = (p.user || {}).id;
  const url = p.response_url;
  const responder = (txt) => fetch(url, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ replace_original: true, text: txt }) });

  // gráfico não grava nada, então não passa pela lista
  if(String(acao.action_id || '').startsWith('graf:')){
    const id = acao.action_id.slice(5);
    ctx.waitUntil((async () => {
      let txt;
      try{ txt = montarGrafico(await carregar(env), id, escopoSlack(env)); }
      catch(e){ txt = 'Não desenhei: ' + (e && e.message || 'erro'); }
      await fetch(url, { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ replace_original: true, text: txt }) });
    })());
    return ok();
  }

  if(!podeLancar(env, quem)){
    /* Diz o ID de quem clicou: o erro mais comum é um ID colado pela metade
       na variável, e dizer a alguém o próprio ID não entrega nada. */
    ctx.waitUntil(responder('Lançar no financeiro não é pra ti.\n_(teu id é `' + quem + '`)_'));
    return ok();
  }
  if(acao.action_id === 'cancelar'){
    ctx.waitUntil(responder('Cancelado. Nada foi gravado.'));
    return ok();
  }
  if(acao.action_id !== 'confirmar') return ok();

  ctx.waitUntil((async () => {
    try{
      const c = JSON.parse(acao.value || '{}');
      const l = await criarLancamento(env, {
        tipo: c.t === 'g' ? 'ganho' : 'gasto', valor: c.v, data: c.dt,
        descricao: c.ds, categoria: c.c, contraparte: c.cp, conta: c.ct
      }, quem);
      const v = (Math.abs(Number(c.v)||0)).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      await responder('*Lançado.* ' + (c.cp || c.ds || 'sem fornecedor') + ', R$ ' + v +
        '. Está no Extrato Financeiro como pendente, nº ' + (l.local_id || '?') + '.');
    }catch(e){
      await responder('Não gravei: ' + (e && e.message || 'erro') + '\n_Nada foi alterado._');
    }
  })());
  return ok();
}

async function responder(env, m){
  const texto = String(m.text || '').replace(/<@[^>]+>/g, '').trim();
  if(!texto) return;
  const d = await carregar(env);
  const resp = await perguntar(env, texto, briefing(d, escopoSlack(env)), null,
                               LANCAR + '\n\n' + vocabulario(d));
  const { prosa, dados } = separarLancamento(resp);
  const thread = { thread_ts: m.thread_ts || m.ts };
  if(dados && dados.valor){
    /* Proposta, não gravação. O cartão é o modal que o Slack não tem. */
    await postar(env, m.channel, prosa || 'Confere antes de eu gravar:',
                 Object.assign({ blocks: cartaoLancamento(dados) }, thread));
  } else {
    await postar(env, m.channel, prosa || resp, thread);
  }
}

// ── Avisos do mês ───────────────────────────────────────────────────────
/* O cron dispara todo dia; quem decide se é dia de falar é esta função.
   Fazer assim em vez de um cron por aviso mantém a regra de "quando" no
   código, onde dá pra ler, em vez de espalhada na configuração. */
async function avisosDoMes(env){
  const canal = env.SLACK_CANAL_EQUIPE;
  if(!canal) throw new Error('SLACK_CANAL_EQUIPE não configurado');
  const agora = new Date();
  const diaDoMes = Number(new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Sao_Paulo', day:'numeric' }).format(agora));
  const diaNota = Number(env.MRK_DIA_NOTA || 1);
  const diaBenef = Number(env.MRK_DIA_BENEFICIOS || 7);

  if(diaDoMes === diaNota)  await avisoNota(env, canal);
  if(diaDoMes === diaBenef) await avisoBeneficios(env, canal);
}

/* Estes dois avisos não dependem de dado nenhum: o texto é o mesmo todo mês.
   Gerar com o modelo a cada disparo não compra nada e arrisca uma invenção
   nova por mês — nos testes ele produziu "metade do time não usa nenhum" e
   "sem nota o pagamento fica parado", duas coisas que ninguém mediu nem
   escreveu. Em canal de empresa isso vira fato repetido. Texto fixo, escrito
   na voz dele. O `redigirAviso` continua existindo para o dia em que o aviso
   reagir a número de verdade — aí o modelo tem o que dizer. */
const AVISO_NOTA =
  'Virou o mês. Ritual de sempre.\n' +
  'Quem presta serviço como *PJ*: a nota fiscal do mês vai pro financeiro.';

const AVISO_BENEFICIOS =
  'Lembrete do mês. Dois benefícios ativos:\n' +
  '*Wellhub* — academias e bem-estar. Tem teto de usuários cadastrados, então não ativa ' +
  'sozinho: quem quiser começar, avisa o financeiro.\n' +
  '*StarBem* — desconto em consultas e saúde. Vale pra todo mundo, é só baixar o app.';

async function avisoNota(env, canal){
  await postar(env, canal, env.MRK_TEXTO_NOTA || AVISO_NOTA);
}

async function avisoBeneficios(env, canal){
  await postar(env, canal, env.MRK_TEXTO_BENEFICIOS || AVISO_BENEFICIOS);
}
