#!/usr/bin/env node
/* Importa o histórico bancário do Granatum para o Extrato do Forekash.
 *
 * Roda UMA vez, com a service_role key do Supabase no ambiente:
 *   SUPABASE_SERVICE_KEY='...' node scripts/importar-granatum.mjs
 *
 * Por que script e não SQL pela ferramenta: são 7.149 linhas (1,5 MB). Passar
 * isso por chamada de SQL custaria caro e lento; aqui o dado já está no disco
 * e sobe direto.
 *
 * Seguro por construção:
 *   · --dry por padrão: NÃO escreve nada, só mostra o que faria.
 *   · confere o maior local_id no servidor e numera a partir dele, então não
 *     colide com o que já existe.
 *   · idempotente: marca cada linha com metadata.importadoDe='granatum' e um
 *     hash; rodar de novo não duplica, porque ele relê o que já entrou.
 */
const URL_BASE = 'https://xgjqnwdhqlxhkgwowwej.supabase.co';
const ORG = 'c7ba3646-2b74-49d5-acc2-b363352d06ed';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const GRAVAR = process.argv.includes('--gravar');
const FORCAR = process.argv.includes('--forcar');

/* ═══ JÁ FOI FEITO — 05/11/2026 ═══════════════════════════════════════════
   As 7.149 linhas entraram pela ponte do Worker (`wrangler dev --remote`),
   que usa o secret que o Worker já tem: nenhuma chave precisou ser colada em
   lugar nenhum. Estão no banco com `importado_de = 'granatum'`, de
   2014-12-31 a 2025-12-31.

   Esta trava existe porque o comando ficou no histórico do terminal e uma
   seta pra cima bastaria pra rodar tudo de novo. Pior: o hash deste script
   NÃO é o que está gravado no banco (lá é sha1 de 6 campos; aqui era djb2 de
   5), então a deduplicação não reconheceria nada e ele inseriria as 7.149
   linhas DE NOVO — 16 mil lançamentos e R$ 17,4 milhões contados em dobro.
   O hash abaixo já foi alinhado, mas a trava fica: a fase 1 acabou.         */
if(!FORCAR){
  console.error('\n  A importação do Granatum JÁ FOI FEITA em 05/11/2026.\n');
  console.error('  7.149 lançamentos de 2014-12-31 a 2025-12-31 estão no Extrato,');
  console.error("  marcados com importado_de = 'granatum'.\n");
  console.error('  Não precisa de chave nenhuma, e rodar de novo não ajuda.');
  console.error('  Para conferir o que entrou, abra o Extrato e filtre por 2025.\n');
  console.error('  Se você REALMENTE precisa reimportar, apague antes o que entrou');
  console.error("  (delete por importado_de = 'granatum') e rode com --forcar.\n");
  process.exit(1);
}

if(!KEY){
  console.error('\n  Falta a chave. Pegue em Supabase → Settings → API → service_role e rode:\n');
  console.error("    SUPABASE_SERVICE_KEY='sua-chave' node scripts/importar-granatum.mjs\n");
  console.error('  Sem --gravar ele só simula.\n');
  process.exit(1);
}
if(/^(sua-chave|cole-a-chave-aqui|<.*>)$/i.test(KEY.trim())){
  console.error('\n  Isso ainda é o texto de exemplo, não a chave.\n');
  console.error('  Pegue em: https://supabase.com/dashboard/project/xgjqnwdhqlxhkgwowwej/settings/api-keys');
  console.error('  Copie a service_role (não a anon) — ela começa com "eyJ" e é bem longa.\n');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' };

const { createHash } = await import('node:crypto');
const fs = await import('node:fs/promises');
const linhas = JSON.parse(await fs.readFile(new URL('./granatum-extrato.json', import.meta.url), 'utf8'));

/* Hash curto e estável da linha — é ele que torna a reimportação inofensiva. */
/* Tem que ser IDÊNTICO ao que a importação de 05/11/2026 gravou, senão a
   deduplicação não reconhece nada e reimporta tudo. Lá foi sha1 dos SEIS
   campos (o fornecedor inclusive), 16 primeiros hex. */
function chave(x){
  const s = [x.d, x.v, x.t, x.s, x.a, x.f].join('|');
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

async function api(caminho, opts){
  const r = await fetch(URL_BASE + '/rest/v1/' + caminho, { ...opts, headers: { ...H, ...(opts?.headers||{}) } });
  /* Erro de chave é o caso mais provável e merece uma frase, não um stack
     trace de 8 linhas que esconde a única coisa que importa. */
  if(r.status === 401 || r.status === 403){
    console.error('\n  A chave não foi aceita (' + r.status + ').\n');
    console.error('  Confira se copiou a service_role inteira, de');
    console.error('  https://supabase.com/dashboard/project/xgjqnwdhqlxhkgwowwej/settings/api-keys\n');
    console.error('  Nada foi gravado.\n');
    process.exit(1);
  }
  if(!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0,200));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

console.log('\n  lendo o que já existe no servidor…');
const maxRow = await api('extrato_lancamentos?org_id=eq.' + ORG + '&select=local_id&order=local_id.desc&limit=1');
let proximoId = ((maxRow[0]?.local_id) || 0) + 1;

const jaTem = new Set();
for(let de = 0; ; de += 1000){
  /* Pede o metadata inteiro em vez de `metadata->>campo`: o PostgREST nomeia
     a coluna derivada de um jeito que varia, e adivinhar o nome deixaria o
     dedupe mudo — ele acharia que nada foi importado e duplicaria tudo. */
  const p = await api('extrato_lancamentos?org_id=eq.' + ORG
    + '&metadata->>importadoDe=eq.granatum&select=metadata'
    + '&limit=1000&offset=' + de);
  if(!p || !p.length) break;
  for(const x of p){ const h = x && x.metadata && x.metadata.granatumHash; if(h) jaTem.add(h); }
  if(p.length < 1000) break;
}
console.log(`  maior local_id: ${proximoId - 1} · já importadas do Granatum: ${jaTem.size}`);

const novas = linhas.filter(x => !jaTem.has(chave(x)));
console.log(`  no arquivo: ${linhas.length} · a inserir agora: ${novas.length}`);
if(!novas.length){ console.log('\n  nada a fazer.\n'); process.exit(0); }

const porAno = {};
for(const x of novas) porAno[x.d.slice(0,4)] = (porAno[x.d.slice(0,4)] || 0) + 1;
console.log('  por ano: ' + Object.entries(porAno).sort().map(([a,n]) => a + ':' + n).join(' · '));

if(!GRAVAR){
  console.log('\n  SIMULAÇÃO — nada foi gravado. Rode de novo com --gravar para valer.\n');
  process.exit(0);
}

const LOTE = 500;
let enviadas = 0;
for(let i = 0; i < novas.length; i += LOTE){
  const corpo = novas.slice(i, i + LOTE).map(x => ({
    org_id: ORG, local_id: proximoId++,
    data: x.d, valor: x.v, descricao: x.s, categoria: x.c,
    conta: x.a, status: 'pago', tipo: x.t,
    contraparte: x.f || null, numero_documento: x.n || null,
    data_pagamento: x.d,
    metadata: {
      sourceKind: 'import', importadoDe: 'granatum', granatumHash: chave(x),
      granatumCategoria: x.g, dataVencimento: x.d,
      baixas: [{ id: 1, data: x.d, valor: x.v, conta: x.a }]
    }
  }));
  await api('extrato_lancamentos', { method:'POST', body: JSON.stringify(corpo),
                                     headers:{ Prefer:'return=minimal' } });
  enviadas += corpo.length;
  process.stdout.write(`\r  enviadas ${enviadas}/${novas.length}`);
}
console.log(`\n\n  pronto — ${enviadas} lançamentos importados.\n`);
