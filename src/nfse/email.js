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

/* A CONFIGURAÇÃO PODE VIR DO COFRE, NÃO SÓ DO AMBIENTE.

   Pedir que o usuário edite um .env para configurar o envio é pedir
   acesso ao servidor — serve para quem desenvolve, não para quem usa o
   Forekash. A senha agora pode vir cifrada no mesmo cofre do certificado,
   configurada pela tela, e é aberta aqui na memória.

   As variáveis de ambiente continuam valendo como alternativa: quem roda
   o serviço para si pode preferi-las, e elas seguem sendo o padrão
   quando nenhuma configuração vem na chamada. */
function normaliza(c){
  if(!c) return null;
  const porta = parseInt(c.porta || c.port || 587, 10);
  const de = String(c.de || c.from || c.user || '').trim();
  if(!(c.host && c.user && c.senha && de)) return null;
  return { host: String(c.host).trim(), porta: porta, user: String(c.user).trim(),
           senha: String(c.senha), de: de, nome: String(c.nome || '').trim() };
}
const _cache = new Map();
function pegaTransporte(cfg){
  const c = normaliza(cfg) || normaliza(CFG);
  if(!c) throw new Error('remetente não configurado');
  /* Uma conexão por remetente: abrir uma a cada e-mail é lento e o
     provedor reclama. A chave não inclui a senha. */
  const chave = c.host + '|' + c.porta + '|' + c.user;
  if(!_cache.has(chave)){
    _cache.set(chave, nodemailer.createTransport({
      host: c.host,
      port: c.porta,
      /* 465 é TLS desde o primeiro byte; 587 abre em claro e sobe para TLS
         com STARTTLS. Errar isso dá timeout sem mensagem útil. */
      secure: c.porta === 465,
      auth: { user: c.user, pass: c.senha },
    }));
  }
  return { tp: _cache.get(chave), c: c };
}

/* `anexos` chega como [{nome, tipo, b64}]. */
async function enviar({ para, cc, responderPara, assunto, texto, html, anexos, smtp }) {
  if(!para) throw new Error('destinatário vazio');
  const { tp, c } = pegaTransporte(smtp);

  const info = await tp.sendMail({
    from: c.nome ? { name: c.nome, address: c.de } : c.de,
    to: para,
    /* Cópia configurada por cliente: muitos querem a nota também no
       contas a pagar, e repetir isso a cada envio é onde se esquece. */
    cc: cc || undefined,
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
async function testar(smtp){
  try{
    const { tp, c } = pegaTransporte(smtp);
    await tp.verify();
    return { ok:true, de: c.de };
  }catch(e){ return { ok:false, motivo: e.message }; }
}

module.exports = { enviar, testar, configurado, normaliza,
                   remetente: () => CFG.de };
