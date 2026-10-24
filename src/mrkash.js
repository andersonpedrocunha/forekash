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

/* Quando ele pede pra REGISTRAR algo, a resposta deixa de ser prosa e passa a
   ter um bloco de dados. Mesmo padrão usado no app para boleto: uma frase do
   que entendeu, e o JSON no fim. O servidor nunca grava direto o que o modelo
   devolve — o JSON vira um cartão com botão, e só o clique grava. */
export const LANCAR =
  '\n\n# QUANDO ELE PEDIR PRA LANÇAR ALGO\n' +
  'Se a mensagem for um pedido de registrar despesa ou receita ("lança 180 de uber", ' +
  '"recebi 5 mil da DOT ontem", "anota 300 de almoço"), responda em UMA frase curta ' +
  'dizendo o que entendeu e depois escreva, em linha isolada, LANCAMENTO: seguido ' +
  'apenas deste JSON:\n' +
  '{"tipo":"gasto ou ganho","valor":180.00,"data":"AAAA-MM-DD","descricao":"curta",' +
  '"categoria":"uma das categorias existentes","contraparte":"quem recebe ou quem paga",' +
  '"conta":"uma das contas existentes, ou vazio"}\n' +
  'Data: "hoje" é a data do quadro, "ontem" é o dia anterior. Sem data dita, use hoje. ' +
  'Campo que ele não disse vai vazio — não invente fornecedor nem conta. ' +
  'Se o valor não estiver claro, NÃO escreva o bloco: pergunte o valor em uma linha.\n' +
  'Para qualquer outra mensagem, responda normalmente e não escreva o bloco.';

/* Pedir gráfico em linguagem natural. Mesmo padrão do LANCAR: o modelo não
   desenha nada, só diz QUAL — quem desenha é o código, com o número certo. */
export const GRAFICAR =
  '\n\n# QUANDO ELE PEDIR UM GRÁFICO\n' +
  'Se a mensagem pedir gráfico, desenho, barra ou "me mostra" de um destes temas, ' +
  'responda SÓ com a linha GRAFICO: seguida do id, sem mais nada:\n' +
  '- `clientes` — quem mais faturou no ano\n' +
  '- `mes` — entrou × saiu mês a mês\n' +
  '- `categoria` — para onde o dinheiro foi\n' +
  '- `aberto` — quem está devendo\n' +
  '- `projecao` — o que falta entrar, mês a mês\n' +
  'Exemplo: "me mostra num gráfico quem tá devendo" → GRAFICO: aberto\n' +
  'Se o pedido não casar com nenhum desses cinco, responda normalmente em texto ' +
  'e não escreva a linha.';

export async function perguntar(env, pergunta, quadro, historico, extra){
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
      system: [{ type: 'text', text: VOZ + SO_NUMEROS + (extra || '') +
                 '\n\n# OS NÚMEROS DESTA EMPRESA\n\n' + quadro,
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

/* Tira o JSON do fim da resposta. Pega o último `{...}` equilibrado porque o
   modelo às vezes omite a cerca ```json e às vezes cola o bloco na marca. */
export function extrairJson(txt){
  const s = String(txt || '');
  const i = s.lastIndexOf('{');
  if(i < 0) return null;
  let nivel = 0, str = false, esc = false;
  for(let j = i; j < s.length; j++){
    const c = s[j];
    if(esc){ esc = false; continue; }
    if(c === '\\'){ esc = true; continue; }
    if(c === '"'){ str = !str; continue; }
    if(str) continue;
    if(c === '{') nivel++;
    else if(c === '}'){ nivel--; if(!nivel){ try{ return JSON.parse(s.slice(i, j + 1)); }catch(_){ return null; } } }
  }
  return null;
}

export function separarLancamento(txt){
  const m = /^[ \t]*LANCAMENTO[ \t]*:/mi.exec(String(txt || ''));
  if(!m) return { prosa: txt, dados: null };
  const dados = extrairJson(txt.slice(m.index));
  const prosa = txt.slice(0, m.index).replace(/```[a-z]*/gi, '').trim();
  return { prosa, dados };
}

/* O cartão de confirmação. É o que substitui o modal do app: ele vê o que
   foi entendido e decide. Nada vai pro banco antes do clique. */
/* A proposta viaja DENTRO do botão. Sem isso seria preciso guardar estado
   em algum lugar entre a mensagem e o clique, e um Worker não tem memória
   entre requisições. O payload do clique vem assinado pelo Slack, então
   ninguém altera o valor pelo caminho — e se alterasse, a assinatura cai. */
export function cartaoLancamento(d){
  const idProposta = JSON.stringify({
    t: d.tipo === 'ganho' ? 'g' : 'd', v: Math.abs(Number(d.valor) || 0),
    dt: d.data || '', ds: String(d.descricao || '').slice(0,120),
    c: d.categoria || '', cp: d.contraparte || '', ct: d.conta || ''
  }).slice(0, 1900);                       // o Slack corta o value em 2000
  const brlf = v => (Math.abs(Number(v) || 0)).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const dia = s => { const p = String(s || '').split('-'); return p.length === 3 ? p[2]+'/'+p[1]+'/'+p[0] : (s || '—'); };
  const linhas = [
    '*' + (d.tipo === 'ganho' ? 'Receita' : 'Despesa') + '*  ·  R$ ' + brlf(d.valor),
    '*Quando:* ' + dia(d.data),
    '*O quê:* ' + (d.descricao || '—'),
    '*Categoria:* ' + (d.categoria || '—'),
    (d.tipo === 'ganho' ? '*Cliente:* ' : '*Fornecedor:* ') + (d.contraparte || '—'),
    '*Conta:* ' + (d.conta || '— a definir —')
  ];
  return [
    { type: 'section', text: { type: 'mrkdwn', text: linhas.join('\n') } },
    { type: 'context', elements: [{ type: 'mrkdwn',
        text: 'Nasce como _pendente_. Nada foi gravado ainda.' }] },
    { type: 'actions', block_id: 'lancamento', elements: [
      { type: 'button', action_id: 'confirmar', style: 'primary',
        text: { type: 'plain_text', text: 'Confirmar' }, value: idProposta },
      { type: 'button', action_id: 'cancelar',
        text: { type: 'plain_text', text: 'Cancelar' }, value: idProposta }
    ]}
  ];
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

/* Perguntar é livre: a proteção mora no dado, não na porta. O quadro que vai
   pro modelo já não contém pagamento individual nem dívida, então qualquer um
   do canal pode perguntar quanto entrou sem ver o que não deve.

   GRAVAR é outra coisa — isso mexe no financeiro e fica na lista. */
export function podeLancar(env, userId){
  const lista = String(env.MRK_SLACK_USERS || '').split(/[\s,]+/).filter(Boolean);
  return lista.includes(userId);
}
