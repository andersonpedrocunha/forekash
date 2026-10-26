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
import { perguntar, postar, assinaturaValida, APRENDER,
         LANCAR, GRAFICAR, separarLancamento, separarMemoria,
         cartaoLancamento } from './mrkash.js';

/* Toda resposta do modelo passa por aqui antes de virar mensagem.
   A marca sai do texto SEMPRE; gravar é que depende de quem falou — memória
   muda toda resposta seguinte, inclusive as que o time inteiro lê, então
   ensinar é escrita e segue a mesma trava do lançamento. */
async function colher(env, cfg, resp, quem){
  const { prosa, fatos } = separarMemoria(resp);
  const texto = prosa || resp;
  if(!fatos.length) return texto;
  /* Ensinar é escrita e segue a trava do lançamento. Mas em silêncio não:
     quem não pode ensinar precisa saber que não pegou, senão repete a
     correção pra sempre achando que funcionou. O id vai junto porque o
     erro mais comum aqui é um id colado pela metade na variável. */
  if(!podeEscrever(cfg, quem))
    return texto + '\n\n_Isso eu não guardo: ensinar é só pra quem pode escrever no ' +
           'Forekash, e teu id (`' + quem + '`) não está na lista._';
  /* Gravar é esperado, não disparado e esquecido. Memória que falhou em
     silêncio é pior que memória que não existe: ele segue achando que o
     MR KASH aprendeu, repete a correção daqui a um mês e descobre que
     nunca pegou. Uma ida ao Supabase custa menos que esse mal-entendido. */
  const erros = [], guardados = [];
  for(const f of fatos){
    try{
      const r = await salvarMemoria(env, f.fato, f.tag, !!f.corrige, quem);
      if(r) guardados.push(r.fato);
    }catch(e){ erros.push(e && e.message || 'erro'); }
  }
  if(erros.length)
    return texto + '\n\n_Não consegui guardar isso: ' + erros[0].slice(0, 140) +
           '. Me conta de novo depois._';
  /* Linha discreta, como no app. Existe porque sem ela ele não tem como
     saber se pegou: ficou ensinando no escuro e só descobria abrindo a
     tela do Forekash. */
  if(guardados.length)
    return texto + '\n\n_anotado · ' + guardados.join('_\n_anotado · ') + '_';
  return texto;
}

const ok = (t) => new Response(t || '', { status: 200 });

/* ── A configuração do Slack mora no Forekash ─────────────────────────
   Canal padrão e quem pode escrever eram variável do Cloudflare: pra
   trocar de canal era preciso editar um arquivo e publicar o Worker.
   Agora ficam num blob como qualquer outro módulo, editável na tela.

   As variáveis continuam valendo como fallback — se o blob não existe ou
   veio quebrado, ele não fica sem canal nenhum.

   O token do Slack NÃO vem pra cá e não vai vir: é credencial do
   workspace inteiro, e blob é coisa que o navegador lê. Segredo continua
   sendo segredo. */
async function cfgSlack(env){
  const padrao = {
    canal: env.SLACK_CANAL_EQUIPE || '',
    quemPode: String(env.MRK_SLACK_USERS || '').split(/[\s,]+/).filter(Boolean),
    liberar: String(env.MRK_SLACK_LIBERAR || '')
  };
  try{
    const r = await fetch(env.SUPABASE_URL +
      `/rest/v1/module_blobs?org_id=eq.${env.FOREKASH_ORG_ID}&module=eq.slack_cfg&select=data`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY,
                   Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY } });
    if(!r.ok) return padrao;
    const j = await r.json();
    const d = j[0] && j[0].data;
    if(!d) return padrao;
    return {
      canal: String(d.canal || '').trim() || padrao.canal,
      quemPode: Array.isArray(d.quemPode) && d.quemPode.length ? d.quemPode : padrao.quemPode,
      liberar: typeof d.liberar === 'string' ? d.liberar : padrao.liberar
    };
  }catch(_){ return padrao; }
}
const podeEscrever = (cfg, quem) => !!quem && cfg.quemPode.includes(quem);

/* O que o MR KASH pode ver quando responde PELO SLACK. Trava ligada por
   padrão: se a variável não existir, ele fica no modo restrito em vez de
   abrir tudo — esquecer de configurar não pode virar vazamento.
   `MRK_SLACK_LIBERAR="pessoa"` solta o individual; `"divida"` solta a dívida;
   `"pessoa divida"` solta as duas. */
function escopoSlack(cfg){
  const livre = String((cfg && cfg.liberar) || '').toLowerCase();
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
      const cfg = await cfgSlack(env);
      /* O básico é aberto porque a tela consulta antes de ter sessão e
         porque "as chaves existem?" não diz nada de ninguém. O detalhe NÃO:
         id de canal, id de quem pode escrever e um pedaço de um fato da
         memória são coisa da casa, e este endereço está na internet aberta.
         Antes isso saía pra qualquer um com a URL. */
      const r = { ok: true, cron: !!cfg.canal,
                  modelo: env.MRK_MODEL || 'claude-opus-5-5',
                  temChaves: {
                    anthropic: !!env.ANTHROPIC_API_KEY, supabase: !!env.SUPABASE_SERVICE_KEY,
                    slackBot: !!env.SLACK_BOT_TOKEN, slackAssinatura: !!env.SLACK_SIGNING_SECRET
                  } };
      /* "O token tem permissão de listar canal?" não diz nada da empresa —
         responde 'ok' ou 'missing_scope'. Fica aberto porque é justamente a
         pergunta de quem ainda não conseguiu entrar na tela. */
      if(url.searchParams.get('teste') && env.SLACK_BOT_TOKEN){
        try{
          const q = await fetch('https://slack.com/api/users.conversations?limit=1', {
            headers: { Authorization: 'Bearer ' + env.SLACK_BOT_TOKEN } });
          const j = await q.json();
          /* O cabeçalho diz os escopos que ESTE token tem. Conferir contra a
             lista do que o MR KASH usa é mais honesto que testar uma chamada
             só: "ok" num endpoint não diz nada sobre os outros, e foi o que
             fez a tela afirmar que estava tudo certo enquanto as reações
             ainda não tinham permissão. */
          const tem = String(q.headers.get('x-oauth-scopes') || '')
            .split(',').map(x => x.trim()).filter(Boolean);
          const PRECISA = {
            'chat:write':      'postar',
            'app_mentions:read':'ouvir quando chamam',
            'commands':        'os comandos /mrkash e /grafico',
            'channels:read':   'listar canais públicos',
            'groups:read':     'listar canais privados',
            'users:read':      'listar o time',
            'channels:join':   'entrar sozinho no canal escolhido',
            'reactions:write': 'marcar o ✅ no aviso',
            'reactions:read':  'contar quem confirmou'
          };
          const falta = Object.keys(PRECISA).filter(k => !tem.includes(k));
          r.escopos = falta.length ? 'falta' : 'ok';
          if(falta.length) r.faltaEscopo = falta.map(k => k + ' (' + PRECISA[k] + ')');
          if(!j.ok) r.slackDisse = j.error || 'recusou';
        }catch(e){ r.escopos = 'erro: ' + (e && e.message || 'falhou'); }
      }
      if(url.searchParams.get('teste') && await sessaoValida(request, env)){
        r.canal = cfg.canal;
        try{
          const q = await fetch(env.SUPABASE_URL + '/rest/v1/module_blobs?select=module&limit=1',
            { headers: { apikey: env.SUPABASE_SERVICE_KEY,
                         Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY } });
          r.supabase = q.ok ? 'ok' : ('erro ' + q.status + ': ' + (await q.text()).slice(0,120));
        }catch(e){ r.supabase = 'erro: ' + (e && e.message || 'falhou'); }
        /* Quantos fatos ele já guardou. Serve pra responder "ensinei e não
           pegou?" sem precisar abrir o Supabase nem o Forekash. */
        try{
          const q = await fetch(env.SUPABASE_URL +
            `/rest/v1/module_blobs?org_id=eq.${env.FOREKASH_ORG_ID}&module=eq.mrk_memoria&select=data`,
            { headers: { apikey: env.SUPABASE_SERVICE_KEY,
                         Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY } });
          const j = q.ok ? await q.json() : [];
          const lista = (j[0] && j[0].data && j[0].data.lista) || [];
          r.memoria = { fatos: lista.length,
                        ultimo: lista.length ? String(lista[lista.length-1].fato).slice(0,80) : null };
        }catch(e){ r.memoria = 'erro: ' + (e && e.message || 'falhou'); }
        r.quemPodeEnsinar = cfg.quemPode;
      }
      return Response.json(r);
    }
    /* Lista os canais pra escolher na tela do Forekash. Só os que o MR KASH
       já é membro: postar num canal onde ele não entrou falha com
       not_in_channel, e oferecer na lista o que não funciona é pior que não
       oferecer. */
    if(url.pathname === '/api/mrkash/canais') return canaisSlack(request, env);
    /* Quem está no workspace, pra escolher na tela quem pode escrever pelo
       Slack em vez de colar id na mão. */
    if(url.pathname === '/api/mrkash/pessoas') return pessoasSlack(request, env);
    /* Quem confirmou, pra tela do Forekash mostrar no card do aviso. */
    if(url.pathname === '/api/mrkash/limpar-testes') return limparTestes(request, env);
    if(url.pathname === '/api/mrkash/confirmacoes'){
      if(!await sessaoValida(request, env))
        return Response.json({ ok:false, erro:'sem sessão' }, { status: 401 });
      return Response.json({ ok:true, confirmacoes: await quemConfirmou(env) });
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

  const cfg = await cfgSlack(env);

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
      try{ txt = montarGrafico(await carregar(env), achado.id, escopoSlack(cfg)); }
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
    if(!podeEscrever(cfg, user))
      return Response.json({ response_type:'ephemeral',
        text:'Disparar aviso no canal não é pra ti.\n_(teu id é `' + user + '`)_' });
    const qual = texto.replace(/^(testar|aviso|avisar)\s*/i, '').trim().toLowerCase();
    const canal = cfg.canal;
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
          /* Este caminho também esquecia o ✅. Três lugares postam aviso —
             cron, botão da tela e /mrkash testar — e cada um que esquece
             vira um "não funciona" que parece defeito da reação. */
          const rr = await postar(env, alvo.canal || canal,
                                  avisoResolve(alvo.texto, agoraSP(), alvo));
          if(rr && rr.ts)
            await gravarDisparo(env, alvo.id, 'teste-' + Date.now(),
                                rr.channel || alvo.canal || canal, rr.ts);
          let extra = '';
          if(alvo.confirmar && rr && rr.ts){
            const c = await poeCheck(env, rr.channel || alvo.canal || canal, rr.ts);
            extra = c === 'ok' ? ' Com o ✅.' : ' Sem o ✅: ' + c + '.';
          } else if(alvo.confirmar){
            extra = ' Sem o ✅: o Slack não devolveu o id da mensagem.';
          }
          msg = '"' + (alvo.titulo || 'aviso') + '" postado no canal.' + extra;
        }
      }catch(e){ msg = 'Não consegui postar: ' + (e && e.message || 'erro'); }
      await fetch(p.get('response_url'), { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ response_type:'ephemeral', text: msg }) });
    })());
    return Response.json({ response_type:'ephemeral', text:'Postando...' });
  }

  const responseUrl = p.get('response_url');
  /* Em canal só de aviso o comando ainda funciona — quem digitou quer uma
     resposta —, mas ela sai privada. Calar aqui também faria a pessoa achar
     que o MR KASH quebrou, e isso é pior que uma resposta que ninguém mais
     vê. O canal continua limpo: ninguém além de quem perguntou lê. */
  const calado = (cfg.soAviso || []).includes(p.get('channel_id'));
  ctx.waitUntil((async () => {
    let txt, deuCerto = true;
    try{
      const d = await carregar(env);
      /* APRENDER vai junto aqui também: corrigir ele por comando tem que
         valer tanto quanto corrigir por menção. */
      txt = await colher(env, cfg,
        await perguntar(env, texto, briefing(d, escopoSlack(cfg)), null, APRENDER),
        user);
    }catch(e){ txt = 'Deu ruim aqui: ' + (e && e.message || 'erro'); deuCerto = false; }
    /* Resposta vai pro canal: a regra de não atender no privado vale aqui
       também. Efêmera fica num canal mas só quem perguntou lê e não sobra
       histórico — é a DM com outra roupa. O Slack mostra junto o comando
       que a pessoa digitou, então fica o par pergunta-resposta.
       Erro continua privado: não é resposta, é defeito, e encher o canal
       com pilha de erro não registra nada que sirva. */
    await fetch(responseUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(deuCerto && !calado
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

  let texto = '', pedido = '', id = 0;
  try{ const b = (await request.json()) || {};
       texto = String(b.texto || '').trim(); pedido = String(b.canal || '').trim();
       id = Number(b.id) || 0; }catch(_){}
  const canal = pedido || (await cfgSlack(env)).canal;
  if(!canal) return erro('canal não configurado');
  if(!texto) return erro('sem texto');
  let check = '';
  try{
    const r = await postar(env, canal, texto);
    /* O "Testar" tinha que fazer exatamente o que o disparo faz, e não
       fazia: o ✅ só era marcado no caminho do cron. Testar uma coisa e
       mandar outra é pior que não ter teste — ele conferiu e concluiu que
       a reação estava quebrada, quando só faltava aqui. */
    if(!r || !r.ts){
      check = 'o Slack não devolveu o id da mensagem';
    } else {
      const lista = await listaDeAvisos(env);
      /* Acha pelo id quando ele vem. Sem id — página em cache, que é o caso
         mais comum logo depois de um deploy — cai pro texto: a mensagem que
         acabou de sair É o texto do aviso, resolvido. Depender do cliente
         mandar tudo certo fez este teste falhar calado três vezes. */
      let aviso = id ? lista.find(a => Number(a.id) === id) : null;
      if(!aviso){
        const limpo = x => String(x || '').replace(/\s+/g, ' ').trim();
        aviso = lista.find(a => limpo(avisoResolve(a.texto, agoraSP2(), a)) === limpo(texto))
             || lista.find(a => limpo(a.texto) === limpo(texto));
      }
      const onde = r.channel || canal;
      if(!aviso) check = 'não achei esse aviso na nuvem' + (id ? ' (id ' + id + ')' : ' pelo texto');
      else if(!aviso.confirmar) check = 'o aviso "' + (aviso.titulo||'?') + '" não está pedindo confirmação';
      else check = await poeCheck(env, onde, r.ts);
      /* Registra TODO teste, com ou sem ✅: é esta marca que o "limpar
         testes" usa pra saber o que pode apagar. Guardar só os que reagiram
         deixaria o resto encalhado no canal pra sempre. */
      await gravarDisparo(env, (aviso && aviso.id) || 0, 'teste-' + Date.now(), onde, r.ts);
      console.log('[aviso] teste id=' + (id || '-') + ' achou=' + (aviso ? aviso.id : 'nao') +
                  ' confirmar=' + (aviso ? !!aviso.confirmar : '-') +
                  ' canal=' + onde + ' ts=' + r.ts + ' check=' + check);
    }
  }catch(e){ return erro((e && e.message) || 'falhou', 502); }
  return Response.json({ ok:true, check });
}

/* Só sessão do Forekash passa: estes dois endereços expõem o quadro de
   pessoas e de canais do workspace, que não é coisa pra ficar aberta. */
async function sessaoValida(request, env){
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if(!jwt) return false;
  const r = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + jwt } });
  return r.ok;
}

async function pessoasSlack(request, env){
  const erro = (e, st) => Response.json({ ok:false, erro:e }, { status: st || 400 });
  if(!await sessaoValida(request, env)) return erro('sem sessão', 401);
  if(!env.SLACK_BOT_TOKEN) return erro('sem token do Slack');
  try{
    const r = await fetch('https://slack.com/api/users.list?limit=400', {
      headers: { Authorization: 'Bearer ' + env.SLACK_BOT_TOKEN } });
    const j = await r.json();
    if(!j.ok) return Response.json({ ok:false, erro: j.error || 'slack recusou',
      escopo: j.error === 'missing_scope' ? 'users:read' : null }, { status: 502 });
    const gente = (j.members || [])
      .filter(m => m && !m.deleted && !m.is_bot && m.id !== 'USLACKBOT')
      .map(m => ({ id: m.id,
                   nome: (m.profile && (m.profile.real_name || m.profile.display_name)) || m.name }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return Response.json({ ok:true, pessoas: gente });
  }catch(e){ return erro((e && e.message) || 'falhou', 502); }
}

/* Apaga do canal as mensagens que os TESTES postaram. Só essas: a trava é
   a marca 'teste-' na chave do disparo, posta na hora da gravação. Aviso de
   verdade não tem essa marca e não é tocado por este caminho — apagar um
   lembrete que o time já leu seria pior que deixar teste encalhado.

   O Slack só deixa um bot apagar o que ele mesmo postou, o que é uma
   segunda trava de graça. */
async function limparTestes(request, env){
  const erro = (e, st) => Response.json({ ok:false, erro:e }, { status: st || 400 });
  if(!await sessaoValida(request, env)) return erro('sem sessão', 401);
  const d = await lerDisparos(env);
  const alvos = Object.keys(d).filter(k => k.includes('|teste-'));
  if(!alvos.length) return Response.json({ ok:true, apagadas:0, falhas:[] });

  let apagadas = 0; const falhas = [];
  for(const k of alvos){
    const x = d[k] || {};
    if(!x.canal || !x.ts){ delete d[k]; continue; }
    try{
      const r = await fetch('https://slack.com/api/chat.delete', {
        method:'POST',
        headers:{ Authorization:'Bearer ' + env.SLACK_BOT_TOKEN, 'content-type':'application/json' },
        body: JSON.stringify({ channel: x.canal, ts: x.ts })
      });
      const j = await r.json();
      /* Já apagada na mão conta como sucesso: o objetivo é não estar lá. */
      if(j.ok || j.error === 'message_not_found'){ apagadas++; delete d[k]; }
      else falhas.push(j.error || 'recusou');
    }catch(e){ falhas.push((e && e.message) || 'falhou'); }
  }
  await fetch(env.SUPABASE_URL + '/rest/v1/module_blobs?on_conflict=org_id,module', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY,
               Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
               'content-type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ org_id: env.FOREKASH_ORG_ID, module: 'avisos_disparos', data: d })
  });
  return Response.json({ ok:true, apagadas, falhas: [...new Set(falhas)] });
}

async function canaisSlack(request, env){
  const erro = (e, st) => Response.json({ ok:false, erro:e }, { status: st || 400 });
  if(!await sessaoValida(request, env)) return erro('sem sessão', 401);
  if(!env.SLACK_BOT_TOKEN) return erro('sem token do Slack');

  const achados = [];
  let cursor = '';
  try{
    /* 12 páginas = 2400 canais. O limite anterior, de 4, cortava em 800 —
       e num workspace deste tamanho o que ficava de fora sumia em silêncio,
       sem a tela ter como saber que a lista estava incompleta. */
    for(let i = 0; i < 12; i++){
      const q = new URLSearchParams({ limit: '200', exclude_archived: 'true',
        types: 'public_channel,private_channel' });
      if(cursor) q.set('cursor', cursor);
      /* `conversations.list` e não `users.conversations`: aquele só devolvia
         os canais onde o MR KASH já tinha entrado, então o #taller nunca
         aparecia pra escolher. Aqui vem o workspace todo, e cada um diz se
         ele é membro — quem não é, ele entra na hora de postar. */
      const r = await fetch('https://slack.com/api/conversations.list?' + q, {
        headers: { Authorization: 'Bearer ' + env.SLACK_BOT_TOKEN } });
      const j = await r.json();
      if(!j.ok){
        /* missing_scope é o caso comum e tem conserto conhecido — devolve o
           nome do escopo em vez de "deu erro". */
        return Response.json({ ok:false, erro: j.error || 'slack recusou',
          escopo: j.error === 'missing_scope' ? 'channels:read,groups:read' : null }, { status: 502 });
      }
      for(const c of (j.channels || []))
        achados.push({ id: c.id, nome: c.name, privado: !!c.is_private,
                       membro: c.is_member !== false });
      cursor = (j.response_metadata && j.response_metadata.next_cursor) || '';
      if(!cursor) break;
    }
  }catch(e){ return erro((e && e.message) || 'falhou', 502); }

  /* Onde ele já está vem primeiro. Num workspace de centenas de canais, o
     punhado em que o MR KASH foi convidado é o que alguém procura em 99%
     das vezes — e era justamente o que ficava perdido no meio do alfabeto. */
  achados.sort((a, b) => (b.membro - a.membro) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return Response.json({ ok:true, padrao: (await cfgSlack(env)).canal,
                         truncou: !!cursor, canais: achados });
}

/* avisoResolve espera um Date; agoraSP() devolve as partes em São Paulo.
   Este converte pra Date sem sair do fuso. */
function agoraSP2(){
  const t = agoraSP();
  return new Date(t.ano, t.mes - 1, t.dia, t.hora, t.minuto);
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
      try{ txt = montarGrafico(await carregar(env), id, escopoSlack(await cfgSlack(env))); }
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

  if(!podeEscrever(await cfgSlack(env), quem)){
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
  const cfgC = await cfgSlack(env);
  /* Canal só de aviso: ele não responde, e não responde em silêncio mesmo.
     Uma linha do tipo "aqui eu não converso" ainda é o bot falando no canal,
     e sairia toda vez que alguém o citasse de passagem. */
  if((cfgC.soAviso || []).includes(m.channel)) return;
  const d = await carregar(env);
  /* APRENDER vem ANTES de LANCAR e GRAFICAR: os dois terminam dizendo
     "para qualquer outra mensagem, responda normalmente e não escreva o
     bloco", e com a regra de aprender logo atrás disso ela ficava lida
     como mais uma exceção que não vale. */
  const cfg = cfgC;
  const bruto = await perguntar(env, texto, briefing(d, escopoSlack(cfg)), null,
                                APRENDER + LANCAR + GRAFICAR + '\n\n' + vocabulario(d));
  const resp = await colher(env, cfg, bruto, m.user);
  const thread = { thread_ts: m.thread_ts || m.ts };

  /* Gráfico pedido por menção sai no canal, não efêmero — é mensagem de
     verdade, não resposta de comando. */
  const g = /^[ \t]*GRAFICO[ \t]*:[ \t]*([a-z]+)/mi.exec(resp);
  if(g){
    /* `reply_broadcast` manda o gráfico pra thread E pro canal. Resposta de
       pergunta pode ficar na thread; gráfico é feito pra todo mundo ver, e
       thread colapsada esconde de quem não abrir. */
    await postar(env, m.channel, montarGrafico(d, g[1].toLowerCase(), escopoSlack(cfg)),
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
/* Gêmeo do avisoResolve() do app. Se os dois resolverem diferente, a prévia
   mente — e a prévia é a única coisa que alguém olha antes de deixar um
   lembrete rodando sozinho por um ano. */
const AV_MES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const AV_MES_LONGO = ['janeiro','fevereiro','março','abril','maio','junho',
                      'julho','agosto','setembro','outubro','novembro','dezembro'];
function avisoResolve(txt, quando, aviso){
  const d = (quando instanceof Date && !isNaN(quando)) ? quando : new Date();
  const diaPag = Number((aviso || {}).diaPagamento) || 0;
  const mes = (delta, longo) => {
    const x = new Date(d.getFullYear(), d.getMonth() + delta, 1);
    return longo ? AV_MES_LONGO[x.getMonth()]
                 : AV_MES_CURTO[x.getMonth()] + '/' + String(x.getFullYear()).slice(2);
  };
  const dois = n => String(n).padStart(2, '0');
  return String(txt || '').replace(/\{([^}\n]{1,40})\}/g, (todo, dentro) => {
    const k = dentro.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const longo = /\bextenso\b/.test(k);
    const base = k.replace(/\bextenso\b/, '').replace(/\s+/g, ' ').trim();
    if(base === 'mes') return mes(0, longo);
    if(base === 'mes passado' || base === 'mes anterior') return mes(-1, longo);
    if(base === 'mes que vem' || base === 'proximo mes') return mes(1, longo);
    if(base === 'ano') return String(d.getFullYear());
    if(base === 'data') return dois(d.getDate()) + '/' + dois(d.getMonth()+1) + '/' + d.getFullYear();
    /* Aviso que dispara dia 28 fala do pagamento do mês SEGUINTE. Sem o
       sufixo, saía a data do próprio mês — já vencida. */
    const q = _avQualifica(base);
    if(q.base === 'pagamento' || q.base === 'dia do pagamento')
      return diaPag ? _avDiaEm(d, diaPag, q.delta) : todo;
    const m = q.base.match(/^dia\s+(\d{1,2})$/);
    if(m) return _avDiaEm(d, Math.min(31, Math.max(1, Number(m[1]))), q.delta);
    return todo;
  });
}
function _avQualifica(base){
  let delta = 0, b = base;
  const tira = (rx, dd) => { if(rx.test(b)){ b = b.replace(rx, '').trim(); delta = dd; } };
  tira(/\s*(do\s+)?(mes\s+)?que\s+vem$/, 1);
  tira(/\s*(do\s+)?proximo\s+mes$/, 1);
  tira(/\s*(do\s+)?(mes\s+)?passado$/, -1);
  tira(/\s*(do\s+)?mes\s+anterior$/, -1);
  return { base: b.replace(/\s+/g, ' ').trim(), delta };
}
function _avDiaEm(d, n, delta){
  const x = new Date(d.getFullYear(), d.getMonth() + (delta || 0), 1);
  return String(n).padStart(2,'0') + '/' + String(x.getMonth() + 1).padStart(2,'0');
}


/* ── Quem já mandou ───────────────────────────────────────────────────
   Um lembrete mensal sem retorno é grito no escuro: ninguém sabe quem já
   fez, e quem fez segue sendo cobrado junto com quem não fez.

   A confirmação é um ✅ na própria mensagem, não um botão. É o gesto que
   todo mundo já faz no Slack sem pensar, aparece como contador do lado da
   mensagem e dá pra ver quem reagiu passando o mouse. Botão seria mais
   formal e menos usado.

   O MR KASH marca o ✅ sozinho logo depois de postar. Não é pra inflar o
   número — é porque reação vazia não aparece: sem alguém começar, não há
   pílula pra clicar, e aí cada pessoa teria que achar o emoji no seletor.
   A dele é descontada na hora de contar.                                */
const CONF_EMOJI = 'white_check_mark';

/* Onde cada disparo foi parar. Sem guardar canal e ts, não há como voltar
   depois pra perguntar ao Slack quem reagiu. */
async function lerDisparos(env){
  const r = await fetch(env.SUPABASE_URL +
    `/rest/v1/module_blobs?org_id=eq.${env.FOREKASH_ORG_ID}&module=eq.avisos_disparos&select=data`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY,
                 Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY } });
  if(!r.ok) return {};
  const j = await r.json();
  return (j[0] && j[0].data) || {};
}

async function gravarDisparo(env, avisoId, slot, canal, ts){
  const d = await lerDisparos(env);
  /* Chave por aviso E por horário exato: o mesmo lembrete roda todo mês e
     cada envio tem a sua lista de quem confirmou. */
  d[String(avisoId) + '|' + slot] = { canal, ts, quando: new Date().toISOString() };
  /* Só os 24 disparos mais recentes. Isto cresce pra sempre e ninguém vai
     perguntar quem mandou a nota de dois anos atrás. */
  const chaves = Object.keys(d).sort((a, b) =>
    String((d[a]||{}).quando||'').localeCompare(String((d[b]||{}).quando||'')));
  while(chaves.length > 24) delete d[chaves.shift()];
  await fetch(env.SUPABASE_URL + '/rest/v1/module_blobs?on_conflict=org_id,module', {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY,
               Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
               'content-type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ org_id: env.FOREKASH_ORG_ID, module: 'avisos_disparos', data: d })
  });
}

async function poeCheck(env, canal, ts){
  try{
    const r = await fetch('https://slack.com/api/reactions.add', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.SLACK_BOT_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ channel: canal, timestamp: ts, name: CONF_EMOJI })
    });
    const j = await r.json();
    /* Falhar aqui não derruba o aviso: a mensagem já foi, e sem a pílula as
       pessoas ainda conseguem reagir pelo seletor. Mas DEVOLVE o motivo —
       engolir isso me fez caçar o defeito três vezes às cegas. */
    if(j.ok || j.error === 'already_reacted') return 'ok';
    return j.error || 'recusou';
  }catch(e){ return (e && e.message) || 'falhou'; }
}

/* Quem reagiu em cada disparo guardado. O próprio bot sai da conta. */
async function quemConfirmou(env){
  const disparos = await lerDisparos(env);
  const eu = await idDoBot(env);
  const saida = {};
  for(const k of Object.keys(disparos)){
    const d = disparos[k];
    if(!d || !d.canal || !d.ts) continue;
    try{
      const r = await fetch('https://slack.com/api/reactions.get?channel=' +
        encodeURIComponent(d.canal) + '&timestamp=' + encodeURIComponent(d.ts), {
        headers: { Authorization: 'Bearer ' + env.SLACK_BOT_TOKEN } });
      const j = await r.json();
      if(!j.ok){ saida[k] = { erro: j.error || 'recusou' }; continue; }
      const rs = (j.message && j.message.reactions) || [];
      const check = rs.find(x => x.name === CONF_EMOJI) || { users: [] };
      saida[k] = { quando: d.quando,
                   quem: (check.users || []).filter(u => u !== eu) };
    }catch(e){ saida[k] = { erro: (e && e.message) || 'falhou' }; }
  }
  return saida;
}

let _idBot = null;
async function idDoBot(env){
  if(_idBot) return _idBot;
  try{
    const r = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: 'Bearer ' + env.SLACK_BOT_TOKEN } });
    const j = await r.json();
    _idBot = j.ok ? j.user_id : '';
  }catch(_){ _idBot = ''; }
  return _idBot;
}

async function avisosDoMes(env){
  const canal = (await cfgSlack(env)).canal;
  if(!canal) throw new Error('nenhum canal configurado');
  const t = agoraSP();
  const lista = await listaDeAvisos(env);
  const disparos = await lerDisparos(env);
  for(const a of lista){
    if(!vaiDisparar(a, t)) continue;
    /* Trava contra repetição. O cron pode rodar de novo no mesmo minuto —
       a Cloudflare não promete exatamente uma execução — e postar duas
       vezes o mesmo lembrete no canal da empresa é o tipo de erro que
       ninguém esquece. A marca é o horário exato do aviso, não a hora da
       execução, então duas rodadas da mesma janela caem na mesma chave. */
    const slot = t.iso + 'T' + String(a.hora || '17:30').slice(0,5);
    if(disparos[String(a.id) + '|' + slot]) continue;
    /* Um aviso que falhe não pode derrubar os outros do mesmo horário. */
    const txt = avisoResolve(a.texto, t, a);
    try{
      const r = await postar(env, a.canal || canal, txt);
      const onde = (r && r.channel) || a.canal || canal;
      if(a.confirmar && r && r.ts){
        const c = await poeCheck(env, onde, r.ts);
        if(c !== 'ok') console.warn('[aviso] ' + (a.titulo||a.id) + ' sem ✅: ' + c);
      }
      /* Registra SEMPRE, com ou sem confirmação: é o que impede o segundo
         disparo da mesma janela. */
      await gravarDisparo(env, a.id, slot, onde, (r && r.ts) || '');
    }
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
/* Janela do cron. Tem que casar com o intervalo em wrangler.jsonc: maior
   que o intervalo dispara duas vezes, menor deixa horário passar batido. */
const JANELA = 10;

export function vaiDisparar(a, t){
  if(!a || a.ativo === false || !String(a.texto || '').trim()) return false;
  /* Antes isto comparava só a hora. Um aviso marcado pras 14:30 saía às
     14:00 — o campo de minuto na tela era decoração, e ninguém ia
     desconfiar porque a mensagem CHEGAVA, só que meia hora antes. */
  const hhmm = String(a.hora || '17:30');
  const hora = Number(hhmm.slice(0,2)), minuto = Number(hhmm.slice(3,5)) || 0;
  const alvo = hora * 60 + minuto, agora = t.hora * 60 + t.minuto;
  if(agora < alvo || agora >= alvo + JANELA) return false;
  if(a.frequencia === 'unica')  return String(a.data || '') === t.iso;
  if(a.frequencia === 'semanal') return Number(a.diaSemana ?? 1) === t.semana;
  // mensal: dia 31 em mês de 30 cai no último dia, em vez de sumir
  const ultimo = new Date(t.ano, t.mes, 0).getDate();
  return Math.min(Number(a.dia || 1), ultimo) === t.dia;
}
