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
         salvarMemoria, grafico, GRAFICOS } from './forekash.js';
import { perguntar, postar, assinaturaValida, podeLancar, APRENDER,
         LANCAR, GRAFICAR, separarLancamento, separarMemoria,
         cartaoLancamento } from './mrkash.js';

/* Toda resposta do modelo passa por aqui antes de virar mensagem.
   A marca sai do texto SEMPRE; gravar é que depende de quem falou — memória
   muda toda resposta seguinte, inclusive as que o time inteiro lê, então
   ensinar é escrita e segue a mesma trava do lançamento. */
async function colher(env, resp, quem, ctx){
  const { prosa, fatos } = separarMemoria(resp);
  if(fatos.length && podeLancar(env, quem)){
    const grava = (async () => {
      for(const f of fatos){
        try{ await salvarMemoria(env, f.fato, f.tag, !!f.corrige, quem); }
        catch(e){ console.warn('memória:', e && e.message); }
      }
    })();
    /* Gravar não pode atrasar a resposta: ele lê a mensagem agora e a
       memória entra em vigor da próxima pergunta. */
    if(ctx && ctx.waitUntil) ctx.waitUntil(grava); else await grava;
  }
  return prosa || resp;
}

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
    if(url.pathname === '/api/mrkash/aviso-agora' && request.method === 'POST')
      return avisoAgora(request, env);
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

  /* Nada de DM. Conversa sobre o dinheiro da empresa fica no canal, onde
     tem testemunha e histórico — no privado ninguém sabe o que foi
     perguntado nem o que foi respondido. Quem chamar na DM leva um recado
     curto e nenhum número. */
  if(m.type === 'message' && m.channel_type === 'im'){
    ctx.waitUntil(postar(env, m.channel,
      'No privado eu não falo de número. Me chama no canal.').catch(() => {}));
    return ok();
  }
  if(m.type !== 'app_mention') return ok();

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
        /* Sem `replace_original:false` o Slack troca a efêmera do "Desenhando..."
           e o gráfico nasce privado, em vez de aparecer pro canal. */
        body: JSON.stringify({ response_type:'in_channel', replace_original:false, text: txt }) });
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
        /* Agora os avisos são uma lista editável, então `/mrkash testar`
           acha pelo título em vez de escolher entre dois textos fixos. */
        const lista = await listaDeAvisos(env);
        const alvo = qual
          ? lista.find(a => String(a.titulo || '').toLowerCase().includes(qual) ||
                            String(a.texto  || '').toLowerCase().includes(qual))
          : lista.find(a => a.ativo !== false);
        if(!alvo){
          msg = lista.length
            ? 'Não achei esse aviso. Tem: ' + lista.map(a => '"' + (a.titulo||'?') + '"').join(', ')
            : 'Não tem aviso cadastrado. Cria em Configurações › Avisos no Slack.';
        } else {
          await postar(env, alvo.canal || canal, alvo.texto);
          msg = '"' + (alvo.titulo || 'aviso') + '" postado no canal.';
        }
      }catch(e){ msg = 'Não consegui postar: ' + (e && e.message || 'erro'); }
      await fetch(p.get('response_url'), { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ response_type:'ephemeral', text: msg }) });
    })());
    return Response.json({ response_type:'ephemeral', text:'Postando...' });
  }

  const responseUrl = p.get('response_url');
  ctx.waitUntil((async () => {
    let txt, deuCerto = true;
    try{
      const d = await carregar(env);
      /* APRENDER vai junto aqui também: corrigir ele por comando tem que
         valer tanto quanto corrigir por menção. */
      txt = await colher(env,
        await perguntar(env, texto, briefing(d, escopoSlack(env)), null, APRENDER),
        user, ctx);
    }catch(e){ txt = 'Deu ruim aqui: ' + (e && e.message || 'erro'); deuCerto = false; }
    /* Resposta vai pro canal: a regra de não atender no privado vale aqui
       também. Efêmera fica num canal mas só quem perguntou lê e não sobra
       histórico — é a DM com outra roupa. O Slack mostra junto o comando
       que a pessoa digitou, então fica o par pergunta-resposta.
       Erro continua privado: não é resposta, é defeito, e encher o canal
       com pilha de erro não registra nada que sirva. */
    await fetch(responseUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(deuCerto
        ? { response_type: 'in_channel', replace_original: false, text: txt }
        : { response_type: 'ephemeral', text: txt }) });
  })());
  // ack imediato: o Slack mostra isso enquanto ele pensa
  return Response.json({ response_type: 'ephemeral', text: 'Lendo teus números...' });
}

/* O botão "Testar" da tela de avisos. Posta agora, sem esperar o horário.

   Exige o token da sessão do Supabase e confere com o Supabase antes de
   postar: sem isso este endereço seria uma porta aberta pra qualquer um
   despejar mensagem no canal da empresa — basta conhecer a URL. O token do
   Slack fica no servidor, então o navegador não tem como postar sozinho;
   por isso o caminho passa por aqui. */
async function avisoAgora(request, env){
  const erro = (e, st) => Response.json({ ok:false, erro:e }, { status: st || 400 });
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if(!jwt) return erro('sem sessão', 401);
  const quem = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + jwt } });
  if(!quem.ok) return erro('sessão inválida', 401);

  const canal = env.SLACK_CANAL_EQUIPE;
  if(!canal) return erro('canal não configurado');
  let texto = '';
  try{ texto = String(((await request.json()) || {}).texto || '').trim(); }catch(_){}
  if(!texto) return erro('sem texto');
  try{ await postar(env, canal, texto); }
  catch(e){ return erro((e && e.message) || 'falhou', 502); }
  return Response.json({ ok:true });
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
      /* O menu era efêmero. Substituir ele deixava o gráfico privado — some
         com o menu e manda o gráfico como mensagem do canal. */
      await fetch(url, { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ delete_original: true }) });
      await fetch(url, { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ response_type:'in_channel', replace_original:false, text: txt }) });
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
  const bruto = await perguntar(env, texto, briefing(d, escopoSlack(env)), null,
                                LANCAR + GRAFICAR + APRENDER + '\n\n' + vocabulario(d));
  const resp = await colher(env, bruto, m.user);
  const thread = { thread_ts: m.thread_ts || m.ts };

  /* Gráfico pedido por menção sai no canal, não efêmero — é mensagem de
     verdade, não resposta de comando. */
  const g = /^[ \t]*GRAFICO[ \t]*:[ \t]*([a-z]+)/mi.exec(resp);
  if(g){
    /* `reply_broadcast` manda o gráfico pra thread E pro canal. Resposta de
       pergunta pode ficar na thread; gráfico é feito pra todo mundo ver, e
       thread colapsada esconde de quem não abrir. */
    await postar(env, m.channel, montarGrafico(d, g[1].toLowerCase(), escopoSlack(env)),
                 Object.assign({ reply_broadcast: true }, thread));
    return;
  }

  const { prosa, dados } = separarLancamento(resp);
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
  const t = agoraSP();
  const lista = await listaDeAvisos(env);
  for(const a of lista){
    if(!vaiDisparar(a, t)) continue;
    /* Um aviso que falhe não pode derrubar os outros do mesmo horário. */
    try{ await postar(env, a.canal || canal, a.texto); }
    catch(e){ console.error('aviso "' + (a.titulo || '?') + '":', e && e.message); }
  }
}

/* O texto dos avisos saiu do código: mora no módulo `avisos`, editado na
   tela de Configurações do Forekash. Mudar um lembrete era deploy; agora é
   dois cliques. O que continua aqui é só QUANDO disparar, e essa conta é a
   mesma escrita no app — se as duas divergirem, a tela promete uma data e a
   mensagem chega noutra. */
async function listaDeAvisos(env){
  const r = await fetch(env.SUPABASE_URL +
    `/rest/v1/module_blobs?org_id=eq.${env.FOREKASH_ORG_ID}&module=eq.avisos&select=data`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY,
                 Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY } });
  if(!r.ok) throw new Error('não li os avisos: ' + r.status);
  const j = await r.json();
  const d = (j[0] || {}).data || {};
  return Array.isArray(d.lista) ? d.lista : [];
}

/* Agora em São Paulo, decomposto. O cron roda em UTC e a conta feita lá
   erra o dia perto da meia-noite. */
export function agoraSP(){
  const f = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo',
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit',
    hour12:false, weekday:'short' });
  const p = {}; for(const x of f.formatToParts(new Date())) p[x.type] = x.value;
  const semana = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[p.weekday] ?? 0;
  return { ano:+p.year, mes:+p.month, dia:+p.day, hora:+p.hour, minuto:+p.minute, semana,
           iso: p.year + '-' + p.month + '-' + p.day };
}

/* Dispara agora? O cron roda de hora em hora, então basta bater a hora —
   a janela do minuto fica solta de propósito: se o cron atrasar três
   minutos, o aviso do mês não pode simplesmente não acontecer. */
export function vaiDisparar(a, t){
  if(!a || a.ativo === false || !String(a.texto || '').trim()) return false;
  if(Number(String(a.hora || '17:30').slice(0,2)) !== t.hora) return false;
  if(a.frequencia === 'unica')  return String(a.data || '') === t.iso;
  if(a.frequencia === 'semanal') return Number(a.diaSemana ?? 1) === t.semana;
  // mensal: dia 31 em mês de 30 cai no último dia, em vez de sumir
  const ultimo = new Date(t.ano, t.mes, 0).getDate();
  return Math.min(Number(a.dia || 1), ultimo) === t.dia;
}
