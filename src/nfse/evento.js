'use strict';
/* EVENTOS DE NFS-e — hoje só o cancelamento.
 *
 * Por que existe: o Forekash marcava a nota como cancelada no próprio
 * banco e não avisava ninguém. A nota seguia válida na Receita, contando
 * para apuração, enquanto a tela dizia CANCELADA. Estado fiscal inventado
 * é pior que erro visível: ninguém vai conferir o que o sistema afirma.
 *
 * Cancelar é registrar um EVENTO vinculado à chave de acesso — mesmo
 * caminho da DPS: XML assinado com o A1, gzipado, base64, por mTLS.
 */
const https = require('https');
const zlib  = require('zlib');
const { SignedXml } = require('xml-crypto');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const el = (t, v) => (v === '' || v == null) ? '' : '<'+t+'>'+esc(v)+'</'+t+'>';

/* Id = "PRE" + chave de acesso (50) + código do evento (6) = 56 dígitos,
   que é exatamente o que o XSD aceita (PRE[0-9]{56}). Cancelamento é
   evento único por nota, então não há sequencial a acrescentar. */
const EVT_CANCELAMENTO = '101101';
function idEvento(chave, codigo){
  const c = String(chave || '').replace(/\D/g, '');
  if(c.length !== 50) throw new Error('chave de acesso deve ter 50 dígitos');
  return 'PRE' + c + (codigo || EVT_CANCELAMENTO);
}

/* Justificativas que o leiaute aceita: 1 erro na emissão, 2 serviço não
   prestado, 9 outros. O texto é obrigatório e vai no evento — é ele que
   o fisco lê depois. */
function montaCancelamento(d){
  const Id = idEvento(d.chave);
  const agora = d.dhEvento || new Date().toISOString().replace(/\.\d{3}Z$/, '-03:00');
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>'
  + '<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">'
  +   '<infPedReg Id="' + Id + '">'
  +     el('tpAmb', d.tpAmb || '2')
  +     el('verAplic', d.verAplic || 'FOREKASH1.0')
  +     el('dhEvento', agora)
  +     el('CNPJAutor', String(d.cnpjAutor || '').replace(/\D/g, ''))
  +     el('chNFSe', String(d.chave).replace(/\D/g, ''))
  /* xDesc É OBRIGATÓRIO E TEM VALOR FIXO.

     O XSD define xDesc com o tipo embutido — uma enumeração de um valor
     só, "Cancelamento de NFS-e" — em vez de um `type=` nomeado. Meu
     extrator listava só os elementos com `type=`, então ele ficou
     invisível e eu montei o evento sem ele. A Receita recusou com E1235
     dizendo exatamente qual elemento esperava. */
  +     '<e101101>'
  +       el('xDesc', 'Cancelamento de NFS-e')
  +       el('cMotivo', d.cMotivo || '1')
  +       el('xMotivo', d.xMotivo)
  +     '</e101101>'
  +   '</infPedReg>'
  + '</pedRegEvento>';
  return { xml, Id };
}

/* Mesma assinatura da DPS, só que a referência aponta para infPedReg. */
function assinaEvento(xml, Id, pem, cert){
  const sig = new SignedXml({
    privateKey: pem,
    publicCert: cert,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infPedReg']",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature',
                 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    uri: '#' + Id,
  });
  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infPedReg']", action: 'after' },
  });
  return sig.getSignedXml();
}

/* O ambiente é parâmetro explícito, como na emissão: cancelar na produção
   restrita uma nota que está em produção não cancela nada. */
function enviaEvento(assinado, chave, cert, key, cb, producao){
  const corpo = JSON.stringify({
    pedidoRegistroEventoXmlGZipB64: zlib.gzipSync(Buffer.from(assinado, 'utf8')).toString('base64')
  });
  const req = https.request({
    host: producao === true ? 'sefin.nfse.gov.br' : 'sefin.producaorestrita.nfse.gov.br',
    method: 'POST',
    path: '/SefinNacional/nfse/' + String(chave).replace(/\D/g, '') + '/eventos',
    cert, key, timeout: 30000,
    headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(corpo) }
  }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => cb(null, r.statusCode, d)); });
  req.on('error', e => cb(e));
  req.end(corpo);
}

module.exports = { montaCancelamento, assinaEvento, enviaEvento, idEvento, EVT_CANCELAMENTO };
