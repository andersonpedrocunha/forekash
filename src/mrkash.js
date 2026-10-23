/* ═══════════════════════════════════════════════════════════════════════
   MR KASH NO SLACK — voz, modelo e as mensagens do mês
   ═══════════════════════════════════════════════════════════════════════
   A persona é a mesma do app; o que muda é a marcação (Slack usa *negrito*
   com um asterisco só) e o fato de que aqui ele fala num canal, com gente
   que não é o dono da empresa lendo. Por isso as duas faces estão separadas:
   AVISO (canal, time inteiro, nada de número financeiro) e ANÁLISE (resposta
   a quem tem permissão, com os números).                                  */

const VOZ =
  'Você é o MR KASH, o analista financeiro do Forekash — o sistema da TALLER.\n\n' +
  'Sua voz é a do Mr. Robot: seca, fragmentada, observacional, levemente cínica — nunca ' +
  'grosseira e nunca teatral. Frase curta, às vezes sem verbo. Abre pelo fato, não pelo ' +
  'preâmbulo. Não puxa o saco, não pede desculpa, não se oferece pra ajudar mais. Nada de ' +
  '"ótima pergunta", "vamos analisar", "espero ter ajudado". Quando o número é ruim, você diz ' +
  'que é ruim e cala — drama inventado em cima de dinheiro real é o contrário do que você faz.\n' +
  'NUNCA enumere com valor entre parênteses. O número vive dentro da frase. Centavo só quando ' +
  'muda a decisão: "R$ 87 mil" diz mais que "R$ 87.046,69".\n' +
  'Quando perguntarem de um jeito torto ou provocativo, responda no mesmo tom antes do número.\n\n' +
  'Formatação do Slack, não do app: *negrito* com um asterisco só, _itálico_ com underline, ' +
  '`código` com crase. Não existe <b> aqui. Sem emoji. Sem título em markdown.';

const SO_NUMEROS =
  '\n\nRegra que não se quebra: todo número que você disser tem que estar no quadro abaixo. ' +
  'Não estima, não extrapola, não completa de cabeça. Se a pergunta pede algo que não está lá, ' +
  'diga o que falta e em qual módulo do Forekash ele preenche. Chutar número de dinheiro é o ' +
  'pior erro possível aqui.\n' +
  'Nunca diga "panorama", "contexto" ou "os dados fornecidos" — isso é encanamento. Fale "os ' +
  'teus números", "o teu extrato", ou simplesmente diga o número.\n\n' +
  'Contabilidade da casa: transferência entre contas próprias não é receita nem despesa; ' +
  'cartão, aplicação e consórcio são CONTAS, e pagar fatura é transferência; a receita entra ' +
  'líquida de retenção, então o crédito nunca bate com a nota; a folha é indexada pelo mês do ' +
  'PAGAMENTO, não o da competência; realizado vem do Extrato, o resto é projeção.';

export async function perguntar(env, pergunta, quadro, historico){
  const msgs = (historico || []).slice(-8);
  msgs.push({ role: 'user', content: pergunta });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: Object.assign(
      { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21',
        'content-type': 'application/json' },
      env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
    body: JSON.stringify({
      model: env.MRK_MODEL || 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      /* O quadro é igual entre perguntas do mesmo dia: marcado como cacheável,
         a segunda em diante lê o prefixo por uma fração do preço. */
      system: [{ type: 'text', text: VOZ + SO_NUMEROS + '\n\n# OS NÚMEROS DESTA EMPRESA\n\n' + quadro,
                 cache_control: { type: 'ephemeral' } }],
      messages: msgs
    })
  });
  if(!r.ok){
    let det = ''; try{ det = ((await r.json()).error || {}).message || ''; }catch(_){}
    throw new Error('Anthropic ' + r.status + (det ? ' · ' + det.slice(0,300) : ''));
  }
  const j = await r.json();
  if(j.stop_reason === 'refusal') return 'Recusei essa. Pergunta de outro jeito.';
  return (j.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();
}

/* Aviso de canal: o time inteiro lê, então NADA de número financeiro aqui.
   É a diferença entre o MR KASH falando com o dono e falando com a empresa. */
export async function redigirAviso(env, instrucao){
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: Object.assign(
      { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21',
        'content-type': 'application/json' },
      env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
    body: JSON.stringify({
      model: env.MRK_MODEL || 'claude-opus-5-5',
      max_tokens: 1200,
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: VOZ +
        '\n\nAgora você fala NUM CANAL, com a empresa inteira lendo — não com o dono. ' +
        'Então: nenhum valor em reais, nenhum dado de faturamento, margem, caixa ou quanto ' +
        'alguém recebe. Você está avisando, não analisando. Curto: no máximo quatro linhas. ' +
        'Direto ao que a pessoa precisa fazer.\n\n' +
        /* Sem esta trava ele inventa: saiu "metade do time não usa nenhum" num aviso de
           benefício, número que ninguém mediu, e "sem nota o pagamento fica parado",
           regra que ninguém escreveu. Mentira em canal de empresa é pior que num chat
           privado — vira fato repetido por todo mundo. */
        'REGRA DURA: diga apenas o que está escrito na instrução abaixo. Não invente ' +
        'estatística de uso ("metade do time não usa"), não invente consequência ' +
        '("sem isso o pagamento trava"), não invente prazo, política ou número de pessoas. ' +
        'Se você acha que falta um detalhe, escreva sem ele. Um aviso curto e verdadeiro é ' +
        'melhor que um aviso redondo e inventado.' }],
      messages: [{ role: 'user', content: instrucao }]
    })
  });
  if(!r.ok) throw new Error('Anthropic ' + r.status);
  const j = await r.json();
  return (j.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();
}

// ── Slack ───────────────────────────────────────────────────────────────
export async function postar(env, canal, texto, extra){
  const r = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.SLACK_BOT_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ channel: canal, text: texto, unfurl_links: false }, extra || {}))
  });
  const j = await r.json();
  /* A API do Slack devolve 200 com ok:false — tratar só o status HTTP faz
     erro de permissão passar por sucesso e a mensagem simplesmente sumir. */
  if(!j.ok) throw new Error('Slack: ' + (j.error || 'falhou'));
  return j;
}

/* Assinatura do Slack. Sem isso qualquer um que descubra a URL fala pelo bot. */
export async function assinaturaValida(env, assinatura, ts, corpo){
  if(!assinatura || !ts) return false;
  // janela de 5 minutos contra replay
  if(Math.abs(Date.now()/1000 - Number(ts)) > 300) return false;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SLACK_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode('v0:' + ts + ':' + corpo));
  const esperado = 'v0=' + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2,'0')).join('');
  if(esperado.length !== assinatura.length) return false;
  let dif = 0;                                   // comparação de tempo constante
  for(let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ assinatura.charCodeAt(i);
  return dif === 0;
}

export function podePerguntar(env, userId){
  const lista = String(env.MRK_SLACK_USERS || '').split(/[\s,]+/).filter(Boolean);
  return lista.includes(userId);
}
