'use strict';
/* SERVIÇO DE EMISSÃO — item 1.

   Por que container e não Worker/Edge Function: a Sefin Nacional é IIS com
   TLS 1.2 e exige mTLS. O rustls — base do Deno e dos Cloudflare Workers —
   não fecha handshake com ela. Só cliente OpenSSL passa. Testado.

   O Worker continua orquestrando; este serviço só assina e entrega.

   Sem estado: o certificado chega cifrado em cada chamada, é aberto na
   memória, usado e descartado. Nada é gravado.
*/
const http = require('http');
const { montaDPS, assina, envia } = require('./dps.js');
const { guardar, abrir, paraPem } = require('./cofre.js');
const correio = require('./email.js');

const PORTA = process.env.PORT || 8080;
const TOKEN = process.env.FK_NFSE_TOKEN || '';

/* O .pfx sobe do NAVEGADOR direto pra cá, sem passar pelo Worker — é um
   salto a menos para a chave privada do cliente. O preço é precisar de CORS.
   A origem permitida é declarada: `*` com credencial não serve, e aceitar
   qualquer site convidaria outro a mandar .pfx em nome do usuário. */
const ORIGENS = (process.env.FK_NFSE_ORIGENS || '').split(',').map(s => s.trim()).filter(Boolean);
function cors(req, res){
  const o = req.headers.origin || '';
  if(ORIGENS.includes(o) || ORIGENS.includes('*')) res.setHeader('Access-Control-Allow-Origin', o || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-fk-token');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
}
function json(res, st, obj){
  const b = JSON.stringify(obj);
  res.writeHead(st, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':Buffer.byteLength(b) });
  res.end(b);
}
function corpo(req){
  return new Promise((ok, erro) => {
    let d = '', n = 0;
    req.on('data', c => { n += c.length;
      if(n > 8e6) { erro(new Error('corpo grande demais')); req.destroy(); return; }
      d += c; });
    req.on('end', () => { try{ ok(d ? JSON.parse(d) : {}); }catch(e){ erro(new Error('JSON inválido')); } });
    req.on('error', erro);
  });
}

const rotas = {
  /* Recebe o .pfx uma vez e devolve o pacote cifrado que o app guarda.
     O .pfx em claro não volta nem fica. */
  'POST /cofre': async (req, res) => {
    const b = await corpo(req);
    if(!b.orgId || !b.pfxBase64) return json(res, 400, { erro: 'orgId e pfxBase64 obrigatórios' });
    const pfx = Buffer.from(b.pfxBase64, 'base64');
    /* Abre antes de guardar: senha errada tem que falhar AGORA, com a
       pessoa na tela, não no dia da primeira emissão. */
    const info = paraPem(pfx, b.senha);
    return json(res, 200, {
      pacote: guardar(b.orgId, pfx, b.senha),
      titular: info.titular, validade: info.validade,
    });
  },

  /* Emite. Recebe o pacote cifrado e os dados da DPS. */
  'POST /emitir': async (req, res) => {
    const b = await corpo(req);
    if(!b.pacote || !b.dps) return json(res, 400, { erro: 'pacote e dps obrigatórios' });
    let pem;
    try { const c = abrir(b.pacote); pem = paraPem(c.pfx, c.senha); }
    catch(e){ return json(res, 400, { erro: 'certificado: ' + e.message }); }

    const { xml, Id } = montaDPS(b.dps);
    let assinado;
    try { assinado = assina(xml, Id, pem.key, pem.cert); }
    catch(e){ return json(res, 500, { erro: 'assinatura: ' + e.message }); }

    envia(assinado, pem.cert, pem.key, (err, st, resp) => {
      if(err) return json(res, 502, { erro: 'rede: ' + err.message });
      let j = {}; try{ j = JSON.parse(resp); }catch(_){ j = { bruto: String(resp).slice(0, 500) }; }
      /* Repassa o status da Receita: 201 é nota gerada, 400 traz os códigos
         de erro dela, que são precisos e o app deve mostrar como vieram. */
      return json(res, st, Object.assign({ idDPS: Id }, j));
    }, b.ambiente === 'producao');
  },

  /* Manda a nota para o tomador. O PDF e o XML vêm prontos do app — o
     DANFSe é desenhado lá, e gerar de novo aqui seria ter dois leiautes.

     Limite de 8 MB no corpo (vem de `corpo()`): um DANFSe passa longe
     disso, e o teto evita virar repetidor de anexo de qualquer tamanho. */
  'POST /email': async (req, res) => {
    const b = await corpo(req);
    if(!b.para) return json(res, 400, { erro: 'destinatário obrigatório' });
    if(!correio.configurado())
      return json(res, 503, { erro: 'o serviço não tem remetente configurado (FK_SMTP_*)' });
    try{
      const r = await correio.enviar(b);
      return json(res, 200, Object.assign({ ok: true, enviadoEm: new Date().toISOString() }, r));
    }catch(e){
      return json(res, 502, { erro: 'envio: ' + e.message });
    }
  },

  /* Diz se o envio está de pé SEM mandar mensagem: conecta e autentica.
     O app usa isso para não prometer na tela o que o serviço não faz. */
  'GET /email/teste': async (_req, res) => json(res, 200, await correio.testar()),

  /* A saúde também conta se há remetente — é o que deixa a tela honesta. */
  'GET /saude': async (_req, res) => json(res, 200, {
    ok: true, servico: 'forekash-nfse',
    email: correio.configurado(), remetente: correio.configurado() ? correio.remetente() : null,
  }),
};

http.createServer(async (req, res) => {
  cors(req, res);
  if(req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }
  const chave = req.method + ' ' + req.url.split('?')[0];
  const fn = rotas[chave];
  if(!fn) return json(res, 404, { erro: 'rota desconhecida' });
  /* Só o Worker fala com este serviço. Sem token, nada entra — exceto a
     checagem de saúde, que não toca certificado. */
  if(chave !== 'GET /saude'){
    const t = req.headers['x-fk-token'] || '';
    if(!TOKEN || t !== TOKEN) return json(res, 401, { erro: 'não autorizado' });
  }
  try { await fn(req, res); }
  catch(e){ json(res, 500, { erro: e.message }); }
}).listen(PORTA, () => console.log('[forekash-nfse] ouvindo em :' + PORTA));
