'use strict';
/* ENVIO DA NOTA POR E-MAIL.

   O Emissor Nacional não manda nada para o tomador — a entrega é de quem
   emite. Até agora o Forekash também não mandava, e pior: tinha um botão
   dizendo que tinha mandado.

   Vai por SMTP, configurado em variáveis de ambiente, pelo mesmo motivo
   que a assinatura mora aqui: é uma credencial que não pode passar pelo
   navegador. O remetente é de quem emite, não do Forekash — quem recebe
   precisa reconhecer de quem veio, e responder para o lugar certo.

   O PDF e o XML chegam prontos do app, em base64. Este arquivo não sabe
   o que é um DANFSe; só sabe anexar. */
const nodemailer = require('nodemailer');

const CFG = {
  host:   process.env.FK_SMTP_HOST || '',
  porta:  parseInt(process.env.FK_SMTP_PORT || '587', 10),
  user:   process.env.FK_SMTP_USER || '',
  senha:  process.env.FK_SMTP_PASS || '',
  de:     process.env.FK_SMTP_FROM || process.env.FK_SMTP_USER || '',
  nome:   process.env.FK_SMTP_NOME || '',
};

function configurado(){
  return !!(CFG.host && CFG.user && CFG.senha && CFG.de);
}

let transporte = null;
function pegaTransporte(){
  if(transporte) return transporte;
  transporte = nodemailer.createTransport({
    host: CFG.host,
    port: CFG.porta,
    /* 465 é TLS desde o primeiro byte; 587 abre em claro e sobe para TLS
       com STARTTLS. Errar isso dá timeout sem mensagem útil. */
    secure: CFG.porta === 465,
    auth: { user: CFG.user, pass: CFG.senha },
  });
  return transporte;
}

/* `anexos` chega como [{nome, tipo, b64}]. */
async function enviar({ para, responderPara, assunto, texto, html, anexos }) {
  if(!configurado()) throw new Error('remetente não configurado no serviço (FK_SMTP_*)');
  if(!para) throw new Error('destinatário vazio');

  const info = await pegaTransporte().sendMail({
    from: CFG.nome ? { name: CFG.nome, address: CFG.de } : CFG.de,
    to: para,
    /* Quem recebe responde para quem emitiu, não para o serviço. */
    replyTo: responderPara || undefined,
    subject: assunto || 'Nota Fiscal de Serviços Eletrônica',
    text: texto || '',
    html: html || undefined,
    attachments: (anexos || []).map(a => ({
      filename: a.nome,
      content: Buffer.from(a.b64 || '', 'base64'),
      contentType: a.tipo || 'application/octet-stream',
    })),
  });
  return { id: info.messageId, aceitos: info.accepted || [], recusados: info.rejected || [] };
}

/* Verifica a conexão e a autenticação sem mandar mensagem nenhuma — serve
   para o app dizer na tela se o envio está de pé antes de alguém emitir. */
async function testar(){
  if(!configurado()) return { ok:false, motivo:'FK_SMTP_* não configurado' };
  try{ await pegaTransporte().verify(); return { ok:true, de: CFG.de }; }
  catch(e){ return { ok:false, motivo: e.message }; }
}

module.exports = { enviar, testar, configurado, remetente: () => CFG.de };
