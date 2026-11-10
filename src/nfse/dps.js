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

  /* O MAPEAMENTO É CONTRAINTUITIVO — e provado contra a nota real.

     `vPis` e `vCofins` dentro de `piscofins` são DÉBITO DE APURAÇÃO
     PRÓPRIA, não retenção. Mandando os valores ali, a Receita devolveu
     retenção de 180,00 (só IRRF+CSLL) e excluiu PIS/COFINS da base do
     IBS/CBS — 6.793,20 em vez de 7.056,00. Nota diferente da real.

     A retenção se declara assim:
       piscofins → só CST e tpRetPisCofins (3 = PIS/COFINS/CSLL retidos)
       vRetCSLL  → o TOTAL de PIS + COFINS + CSLL retidos

     Com isso o retorno bate à vírgula com a NFS-e 86: retenção 442,80,
     líquido 6.757,20, IBS 7,06, CBS 63,50. O DANFSe chama esse total de
     "Contribuições Sociais - Retidas". */
  let x = '<tribFed>';
  if(tpRet !== '0'){
    x += '<piscofins>'
      +  el('CST', d.cstPisCofins || '08')
      +  el('tpRetPisCofins', tpRet)
      +  '</piscofins>';
  }
  if(vCp)   x += el('vRetCP', dec(vCp));
  if(vIrrf) x += el('vRetIRRF', dec(vIrrf));
  const socRetidas = +(vPis + vCof + vCsll).toFixed(2);
  if(socRetidas) x += el('vRetCSLL', dec(socRetidas));
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
          /* `xEstProvReg` é OBRIGATÓRIO no endereço do exterior — estado,
             província ou região. Sem ele: "endExt has incomplete content".
             É o equivalente da UF, e não tem valor padrão possível. */
          ? '<endExt>' + el('cPais', t.cPais) + el('cEndPost', t.CEP)
            + el('xCidade', t.xCidade) + el('xEstProvReg', t.xEstProvReg || t.uf || '') + '</endExt>'
          : '<endNac>' + el('cMun', t.cMun) + el('CEP', dig(t.CEP)) + '</endNac>')
  +       el('xLgr', t.xLgr) + el('nro', t.nro) + el('xBairro', t.xBairro)
  +     '</end>'
  /* Opcionais, e nessa ordem (fone antes de email, como o XSD pede).
     `el()` some sozinho quando vazio — então sem e-mail, sem elemento. */
  +     el('fone', t.fone) + el('email', t.email)
  +   '</toma>'
  +   '<serv>'
  +     '<locPrest>' + el('cLocPrestacao', d.cLocPrestacao) + '</locPrest>'
  +     '<cServ>' + el('cTribNac', d.cTribNac) + el('cNBS', d.cNBS) + el('xDescServ', d.xDescServ) + '</cServ>'
  +   '</serv>'
  +   '<valores>'
  +     '<vServPrest>' + el('vServ', dec(d.vServ)) + '</vServPrest>'
  +     '<trib>'
  +       '<tribMun>'
  +         el('tribISSQN', d.tribISSQN)
  /* PAÍS DO RESULTADO — é ele que caracteriza a exportação.
     Sem `cPaisResult`, "exportação de serviço" fica sem o fato que a
     sustenta: o ISSQN não incide porque o RESULTADO se verificou fora do
     Brasil. O portal pede isso numa pergunta própria, e é prova que o
     Fisco pode cobrar depois. */
  +         (exp ? el('cPaisResult', d.cPaisResult || d.paisToma || '') : '')
  +         el('tpRetISSQN', '1')
  /* ALÍQUOTA NÃO SE INFORMA. E0617: "não é permitido informar alíquota
     quando o prestador não é optante do Simples". Quem define é o município,
     pela parametrização nacional — mandar a nossa é tentar escolher o
     imposto. Só o optante do Simples (opSimpNac=3) declara a dele. */
  +         ((exp || d.prest.opSimpNac !== '3') ? '' : el('pAliq', dec(d.pAliq)))
  +       '</tribMun>'
  /* ORDEM DO XSD: tribMun → tribFed → totTrib. Eu tinha posto tribFed
     primeiro e a Receita recusou com E1235. Sequência em XSD não é
     sugestão: campo certo na posição errada é campo inválido. */
  +       _tribFed(d, exp)
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
  /* indDest: 0 = destinatário É o adquirente; 1 = é outro.
     Na EXPORTAÇÃO tem que ser 1. Com 0 a Receita exige tomador com CNPJ/CPF
     e endereço NACIONAL — ela entende que a incidência do IBS/CBS cai no
     município brasileiro do adquirente, e o nosso está no exterior.
     Mensagem dela, literal: "...e houver a informação de que o destinatário
     é o próprio adquirente (indDest = 0)". */
  +     el('cIndOp', d.cIndOp) + el('indDest', exp ? '1' : '0')
  +     (exp ? '<dest>' + (d.toma.NIF ? el('NIF', d.toma.NIF) : el('cNaoNIF','2'))
               + el('xNome', d.toma.xNome) + '</dest>' : '')
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
