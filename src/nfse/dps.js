'use strict';
const fs = require('fs'), zlib = require('zlib'), https = require('https');
const { SignedXml } = require('xml-crypto');

const esc = v => String(v == null ? '' : v)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const el  = (t, v) => (v === '' || v == null) ? '' : '<'+t+'>'+esc(v)+'</'+t+'>';
const dec = v => Number(v).toFixed(2);               // TSDec15V2: ponto, 2 casas
const dig = v => String(v||'').replace(/\D/g,'');

/* Id = DPS + 42 dígitos: cLocEmi(7) tpInsc(1) nInsc(14) serie(5) nDPS(15) */
function idDPS(d){
  return 'DPS' + String(d.cLocEmi).padStart(7,'0')
       + '2' + dig(d.prest.CNPJ).padStart(14,'0')
       + String(d.serie).padStart(5,'0')
       + String(d.nDPS).padStart(15,'0');
}

/* RETENÇÃO FEDERAL — só existe para tomador no Brasil.

   Nota de exportação sai com `0 - PIS/COFINS/CSLL Não Retidos` e valor
   nenhum; foi assim que a nota da Bloom saiu. Para tomador nacional, a
   retenção é o que separa o que a empresa fatura do que ela recebe:
   7.200,00 viram 6.757,20 no caixa.

   As alíquotas vêm do SERVIÇO, não daqui: variam por atividade e por quem
   é o tomador (órgão público retém diferente). O padrão é o da lei —
   PIS 0,65 + COFINS 3 + CSLL 1 = 4,65 (CSRF), e IRRF 1,5.

   Os três valores vão separados porque a DPS os quer separados; o DANFSe é
   que soma em "Contribuições Sociais - Retidas". */
function _tribFed(d, exp){
  if(exp || d.semRetencao) return '';
  const base = Number(d.vServ) || 0;
  const pct  = k => Number(d[k]) || 0;
  const v    = k => +(base * pct(k) / 100).toFixed(2);
  const vPis = v('pPis'), vCof = v('pCofins'), vCsll = v('pCsll'), vIrrf = v('pIrrf'), vCp = v('pInss');
  if(!(vPis || vCof || vCsll || vIrrf || vCp)) return '';
  /* tpRetPisCofins: 3 = PIS/COFINS/CSLL retidos; 1 = só PIS/COFINS;
     0 = nada retido. Mandar o código errado faz o tomador recolher o que
     não devia — ou deixar de recolher o que devia. */
  const tpRet = (vPis && vCof && vCsll) ? '3' : ((vPis || vCof) ? '1' : '0');
  let x = '<tribFed>';
  if(vPis || vCof){
    x += '<piscofins>'
      +  el('CST', d.cstPisCofins || '08')
      +  el('vBCPisCofins', dec(base))
      +  el('pAliqPis', dec(pct('pPis'))) + el('pAliqCofins', dec(pct('pCofins')))
      +  el('vPis', dec(vPis)) + el('vCofins', dec(vCof))
      +  el('tpRetPisCofins', tpRet)
      +  '</piscofins>';
  }
  if(vCp)   x += el('vRetCP', dec(vCp));
  if(vIrrf) x += el('vRetIRRF', dec(vIrrf));
  if(vCsll) x += el('vRetCSLL', dec(vCsll));
  return x + '</tribFed>';
}

function montaDPS(d){
  const Id = idDPS(d);
  const t = d.toma;
  const exp = d.tribISSQN === '3';                   // exportação de serviço
  const xml =
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">'
  + '<infDPS Id="'+Id+'">'
  +   el('tpAmb', d.tpAmb) + el('dhEmi', d.dhEmi) + el('verAplic', d.verAplic)
  +   el('serie', d.serie) + el('nDPS', d.nDPS) + el('dCompet', d.dCompet)
  /* finNFSe sobe pra cá: o XSD publicado (v1.01, 09/02/2026) coloca dentro
     de IBSCBS, mas o servidor exige logo depois de tpEmit. Quem manda é a
     API — o esquema em produção está à frente do publicado. */
  +   el('tpEmit', '1') + el('finNFSe','0') + el('cLocEmi', d.cLocEmi)
  +   '<prest>' + el('CNPJ', dig(d.prest.CNPJ)) + el('IM', d.prest.IM)
  +     '<regTrib>' + el('opSimpNac', d.prest.opSimpNac) + el('regEspTrib','0') + '</regTrib>'
  +   '</prest>'
  +   '<toma>'
  +     (t.NIF ? el('NIF', t.NIF) : el('CNPJ', dig(t.CNPJ)))
  +     el('xNome', t.xNome)
  +     '<end>'
  +       (t.NIF
          ? '<endExt>' + el('cPais', t.cPais) + el('cEndPost', t.CEP) + el('xCidade', t.xCidade) + '</endExt>'
          : '<endNac>' + el('cMun', t.cMun) + el('CEP', dig(t.CEP)) + '</endNac>')
  +       el('xLgr', t.xLgr) + el('nro', t.nro) + el('xBairro', t.xBairro)
  +     '</end>'
  +   '</toma>'
  +   '<serv>'
  +     '<locPrest>' + el('cLocPrestacao', d.cLocPrestacao) + '</locPrest>'
  +     '<cServ>' + el('cTribNac', d.cTribNac) + el('cNBS', d.cNBS) + el('xDescServ', d.xDescServ) + '</cServ>'
  +   '</serv>'
  +   '<valores>'
  +     '<vServPrest>' + el('vServ', dec(d.vServ)) + '</vServPrest>'
  +     '<trib>'
  +       _tribFed(d, exp)
  +       '<tribMun>'
  +         el('tribISSQN', d.tribISSQN)
  +         el('tpRetISSQN', '1')
  /* ALÍQUOTA NÃO SE INFORMA. E0617: "não é permitido informar alíquota
     quando o prestador não é optante do Simples". Quem define é o município,
     pela parametrização nacional — mandar a nossa é tentar escolher o
     imposto. Só o optante do Simples (opSimpNac=3) declara a dele. */
  +         ((exp || d.prest.opSimpNac !== '3') ? '' : el('pAliq', dec(d.pAliq)))
  +       '</tribMun>'
  /* TOTAIS DA LEI 12.741 — é uma ESCOLHA, não uma lista.
     Ou os três valores, ou os três percentuais, ou indTotTrib, ou pTotTribSN.
     E0713: para não optante do Simples, indTotTrib e pTotTribSN são
     proibidos — sobra declarar os percentuais, que é o que o portal pede. */
  +       '<totTrib><pTotTrib>'
  +         el('pTotTribFed', dec(d.pTotTribFed || 0))
  +         el('pTotTribEst', dec(d.pTotTribEst || 0))
  +         el('pTotTribMun', dec(d.pTotTribMun || 0))
  +       '</pTotTrib></totTrib>'
  +     '</trib>'
  +   '</valores>'
  +   '<IBSCBS>'
  +     el('cIndOp', d.cIndOp) + el('indDest','0')
  +     '<valores><trib>' + el('CST', d.CST) + el('cClassTrib', d.cClassTrib)
  +     '</trib></valores>'
  +   '</IBSCBS>'
  + '</infDPS></DPS>';
  return { xml, Id };
}

function assina(xml, Id, pem, cert){
  const sig = new SignedXml({
    privateKey: pem,
    publicCert: cert,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature',
                 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    uri: '#' + Id,
  });
  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infDPS']", action: 'after' },
  });
  return sig.getSignedXml();
}

/* O ambiente é parâmetro, nunca padrão silencioso: errar isso emite nota
   fiscal de verdade achando que era teste. Produção exige dizer. */
function envia(assinado, cert, key, cb, producao){
  const corpo = JSON.stringify({ dpsXmlGZipB64: zlib.gzipSync(Buffer.from(assinado,'utf8')).toString('base64') });
  const req = https.request({
    host: producao === true ? 'sefin.nfse.gov.br' : 'sefin.producaorestrita.nfse.gov.br',
    method:'POST', path:'/SefinNacional/nfse',
    cert, key, timeout:30000,
    headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(corpo)}
  }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>cb(null, r.statusCode, d)); });
  req.on('error', e => cb(e));
  req.end(corpo);
}
module.exports = { montaDPS, assina, envia, idDPS };
