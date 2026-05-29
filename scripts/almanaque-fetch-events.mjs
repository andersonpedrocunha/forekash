#!/usr/bin/env node
// ============================================================
// scripts/almanaque-fetch-events.mjs
// ============================================================
// Roda dentro do GitHub Action `almanaque-weekly-update.yml`.
// Chama Gemini pedindo eventos financeiros importantes dos últimos
// ~30 dias e insere na tabela `kash_almanaque_eventos` via
// SUPABASE_SERVICE_KEY (bypassa RLS, marca approved=true).
//
// ENV NECESSÁRIAS:
//   GEMINI_API_KEY      · free tier basta (15 RPM)
//   SUPABASE_URL        · ex: https://xgjqnwdhqlxhkgwowwej.supabase.co
//   SUPABASE_SERVICE_KEY · service_role (NUNCA expor no frontend)
//
// PODE RODAR LOCAL pra testar:
//   GEMINI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/almanaque-fetch-events.mjs
// ============================================================

const GEMINI_API_KEY     = process.env.GEMINI_API_KEY;
const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltam env vars: GEMINI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// ─── Define janela: últimos 30 dias ───
const now = new Date();
const end = now.toISOString().slice(0, 10);   // YYYY-MM-DD
const startDate = new Date(now);
startDate.setDate(startDate.getDate() - 30);
const start = startDate.toISOString().slice(0, 10);

// ─── Prompt pro Gemini ───
const PROMPT = `Você é um historiador econômico rigoroso. Liste 0-4 eventos financeiros/econômicos REAIS que aconteceram entre ${start} e ${end} (datas verificáveis, fontes primárias).

REGRAS DE CURADORIA (estrito):
1. SÓ eventos que daqui a 20 anos ainda seriam estudados em curso de história econômica
2. Datas EXATAS (não "em julho aproximadamente", precisa dia exato)
3. Fontes PRIMÁRIAS verificáveis (Fed, BCE, BCB, BIS, IMF, OECD, comunicados oficiais, papers academicos NBER/SSRN, jornais sérios FT/WSJ/Reuters)
4. JAMAIS Wikipedia, blogs, posts de redes sociais
5. Se não tiver certeza absoluta que aconteceu, NÃO INCLUA

Considere apenas eventos de IMPACTO SISTÊMICO REAL:
- Decisões marcantes de bancos centrais (corte/alta de juros não-rotineira, QE, mudança de regime monetário)
- Falências de instituições grandes (>US$ 5bi) com risco sistêmico
- Defaults soberanos
- Choques cambiais (>10% em poucos dias)
- Mudanças regulatórias estruturais (não trivialidades regulatórias rotineiras)
- Publicação de obras econômicas de impacto (Piketty, etc · raríssimo)

NÃO INCLUA:
- Resultados trimestrais (mesmo de empresas grandes)
- Movimentos diários normais de mercado
- Discursos sem decisão concreta
- Notícias de M&A não-finalizados
- Eventos já cobertos por clássicos (Lehman 2008, Bretton Woods 1944, etc)
- Tendências macro vagas ("inflação subiu", "mercado em alta")
- Eventos que você não tem 100% certeza da data exata

Se em dúvida, **prefira retornar array vazio []**. É MELHOR retornar 0 eventos do que 1 evento errado/inventado.

Retorne APENAS um array JSON válido (sem markdown, sem comentários). Schema:
[
  {
    "d": "MM-DD",
    "y": 2025,
    "lugar": "🇺🇸",
    "evento": "Título curto, max 60 chars",
    "desc": "Sumário 1-2 frases, max 200 chars",
    "tipo": "evento",
    "severidade": 3,
    "detalhes": "Narrativa 150-250 palavras com contexto, causas e implicações",
    "economistas": ["Nome 1", "Nome 2"],
    "doutrinas": ["Conceito 1"],
    "fontes": [
      {"n": "Nome da fonte primária", "u": "https://url-real-verificavel"}
    ]
  }
]

Critérios:
- severidade 1=marginal, 2=localizado, 3=relevante, 4=grande, 5=sistêmico
- Fontes: papers acadêmicos, comunicados oficiais (Fed, IMF, BIS, BCB), arquivos de imprensa séria. NUNCA Wikipedia.
- Bandeira "lugar": emoji do país (🇺🇸 🇧🇷 🇪🇺 🇨🇳 🇯🇵 🇬🇧 etc) ou 🌍 se global.
- Se não houver evento real digno nesta janela, retorne array vazio: []`;

console.log(`\n🜐 ALMANAQUE · busca eventos · janela ${start} → ${end}`);
console.log(`Gemini model: gemini-2.5-flash`);

// ─── Chama Gemini ───
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

let proposed;
try {
  const resp = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,  // bem baixa pra reduzir alucinação
        maxOutputTokens: 4096
      }
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`❌ Gemini HTTP ${resp.status}: ${err.slice(0, 400)}`);
    process.exit(1);
  }

  const json = await resp.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error('❌ Sem texto na resposta do Gemini', JSON.stringify(json).slice(0, 400));
    process.exit(1);
  }

  proposed = JSON.parse(text);
  if (!Array.isArray(proposed)) {
    console.error('❌ Resposta não é array:', text.slice(0, 200));
    process.exit(1);
  }
} catch (e) {
  console.error(`❌ Erro chamando Gemini: ${e.message}`);
  process.exit(1);
}

console.log(`\n✓ Gemini retornou ${proposed.length} evento(s) propost(os)`);

if (proposed.length === 0) {
  console.log('Nada de novo nesta janela. Encerrando.');
  process.exit(0);
}

// ─── Valida shape ───
const valid = [];
for (const [i, ev] of proposed.entries()) {
  const errs = [];
  if (!ev.d || !/^[0-1][0-9]-[0-3][0-9]$/.test(ev.d))    errs.push(`d="${ev.d}" inválido`);
  if (!Number.isInteger(ev.y) || ev.y < 1500 || ev.y > 2100) errs.push(`y=${ev.y} inválido`);
  if (!ev.lugar || ev.lugar.length > 8)                  errs.push(`lugar vazio/grande demais`);
  if (!ev.evento || ev.evento.length > 80)               errs.push(`evento vazio/grande`);
  if (!ev.desc   || ev.desc.length > 280)                errs.push(`desc vazio/grande`);
  if (ev.tipo && !['evento','doutrina'].includes(ev.tipo)) errs.push(`tipo inválido`);
  if (ev.severidade && (ev.severidade < 1 || ev.severidade > 5)) errs.push(`severidade fora de 1-5`);
  if (errs.length) {
    console.warn(`  ✗ #${i+1} "${ev.evento}" rejeitado: ${errs.join('; ')}`);
    continue;
  }
  valid.push(ev);
}

if (valid.length === 0) {
  console.log('Nenhum evento passou na validação. Encerrando.');
  process.exit(0);
}

console.log(`✓ ${valid.length} evento(s) válido(s)`);

// ─── Insere no Supabase via REST + service_role ───
let inserted = 0, skipped = 0, failed = 0;
for (const ev of valid) {
  const payload = {
    d: ev.d,
    y: ev.y,
    lugar: ev.lugar,
    evento: ev.evento,
    desc: ev.desc,
    tipo: ev.tipo || 'evento',
    severidade: ev.severidade || 3,
    detalhes: ev.detalhes || null,
    economistas: ev.economistas || [],
    doutrinas: ev.doutrinas || [],
    fontes: ev.fontes || [],
    approved: false,  // ← entra em fila pra revisão manual (mais seguro)
    source: 'gemini-cron'
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/kash_almanaque_eventos`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (resp.status === 201) {
      console.log(`  ✓ inserido: ${ev.y} · ${ev.evento}`);
      inserted++;
    } else if (resp.status === 409) {
      console.log(`  ⏭  duplicado: ${ev.y} · ${ev.evento}`);
      skipped++;
    } else {
      const err = await resp.text();
      console.warn(`  ✗ ${resp.status}: ${ev.evento} · ${err.slice(0, 160)}`);
      failed++;
    }
  } catch (e) {
    console.warn(`  ✗ network: ${ev.evento} · ${e.message}`);
    failed++;
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✓ inseridos: ${inserted}  ⏭  pulados: ${skipped}  ✗ falhas: ${failed}`);
console.log(``);

if (failed > 0 && inserted === 0) process.exit(1);
