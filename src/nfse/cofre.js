'use strict';
/* COFRE DO CERTIFICADO — item 3.

   O .pfx de um cliente assina mais que nota fiscal: assina contrato,
   procuração, move coisa no e-CAC. Guardar isso por terceiros é custódia de
   identidade jurídica, não de dado financeiro.

   Desenho:
   - o .pfx nunca é gravado em claro, em lugar nenhum;
   - cifra AES-256-GCM com chave derivada por organização;
   - a CHAVE-MESTRA vive só na variável de ambiente DESTE serviço. O banco
     guarda o pacote cifrado; quem tiver só o banco não abre nada;
   - a senha do .pfx é cifrada junto, no mesmo pacote — guardar ao lado em
     claro anularia o resto;
   - decifra na memória, no instante do envio, e some.

   O que isso NÃO resolve: quem tiver acesso ao ambiente deste serviço abre
   tudo. Separar de verdade exigiria KMS/HSM. É o degrau seguinte, não este.
*/
const crypto = require('crypto');

const ALG = 'aes-256-gcm';

function chaveDe(orgId){
  const mestra = process.env.FK_NFSE_MASTER_KEY || '';
  if(mestra.length < 32) throw new Error('FK_NFSE_MASTER_KEY ausente ou curta demais (mín. 32 chars)');
  /* Chave por organização: vazar o pacote de um cliente não entrega os
     outros, e trocar a mestra re-deriva todas de uma vez. */
  return crypto.hkdfSync('sha256', Buffer.from(mestra, 'utf8'),
    Buffer.from('forekash-nfse', 'utf8'), Buffer.from('org:' + String(orgId), 'utf8'), 32);
}

/** Cifra o .pfx e a senha num pacote único e versionado. */
function guardar(orgId, pfxBuffer, senha){
  const chave = chaveDe(orgId);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALG, chave, iv);
  const claro = JSON.stringify({ pfx: Buffer.from(pfxBuffer).toString('base64'), senha: String(senha || '') });
  const dados = Buffer.concat([c.update(claro, 'utf8'), c.final()]);
  return {
    v: 1, alg: ALG, org: String(orgId),
    iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
    dados: dados.toString('base64'),
    guardadoEm: new Date().toISOString(),
  };
}

/** Abre o pacote. Devolve { pfx: Buffer, senha }. Sempre em memória. */
function abrir(pacote){
  if(!pacote || pacote.v !== 1) throw new Error('pacote de certificado inválido ou de versão desconhecida');
  const chave = chaveDe(pacote.org);
  const d = crypto.createDecipheriv(ALG, chave, Buffer.from(pacote.iv, 'base64'));
  d.setAuthTag(Buffer.from(pacote.tag, 'base64'));
  /* GCM: se o pacote foi adulterado, final() lança. É a diferença entre
     "cifrado" e "cifrado e íntegro". */
  const claro = Buffer.concat([d.update(Buffer.from(pacote.dados, 'base64')), d.final()]).toString('utf8');
  const o = JSON.parse(claro);
  return { pfx: Buffer.from(o.pfx, 'base64'), senha: o.senha };
}

/* PEM a partir do .pfx, só em memória — nunca toca o disco.

   O Node não lê PKCS#12: `createPrivateKey({format:'pkcs12'})` recusa o
   formato. Sobra node-forge, que faz em memória. Descompactar com `openssl`
   num arquivo temporário seria a alternativa óbvia e a pior: a chave privada
   de um cliente ficaria legível no disco do container. */
function paraPem(pfxBuffer, senha){
  const forge = require('node-forge');
  const p12 = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString('binary'))), String(senha || ''));
  const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
            || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  if(!bags || !bags.length) throw new Error('chave privada não encontrada no .pfx — senha errada?');
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if(!certs.length) throw new Error('certificado não encontrado no .pfx');
  return {
    key:  forge.pki.privateKeyToPem(bags[0].key),
    cert: forge.pki.certificateToPem(certs[0].cert),
    validade: certs[0].cert.validity.notAfter.toISOString().slice(0, 10),
    titular: (certs[0].cert.subject.getField('CN') || {}).value || '',
  };
}

module.exports = { guardar, abrir, paraPem };
