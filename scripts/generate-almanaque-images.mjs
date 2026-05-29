#!/usr/bin/env node
// ============================================================
// scripts/generate-almanaque-images.mjs
// ============================================================
// Gera as imagens do ALMANAQUE chamando a Gemini API.
//
// MODELOS SUPORTADOS:
//   gemini-2.5-flash-image  · Gemini nativo (padrão · "Nano Banana")
//   imagen-3.0-generate-002 · Imagen 3 standard
//   imagen-3.0-generate-001 · Imagen 3 anterior (fallback)
//
// PREREQUISITOS:
//   1. Node 18+ (precisa de fetch nativo + ES modules)
//   2. API key do Google AI Studio (NÃO funciona com Gemini Advanced
//      consumer; precisa de billing habilitado em AI Studio)
//      → https://aistudio.google.com/apikey
//   3. export GEMINI_API_KEY="sua_key_aqui"
//
// USO:
//   node scripts/generate-almanaque-images.mjs
//   node scripts/generate-almanaque-images.mjs --model=imagen-3.0-generate-002
//
// FLAGS:
//   --model=<id>     escolher modelo (default: gemini-2.5-flash-image)
//   --force          regenera imagens que já existem
//   --only=slug,...  roda só esses slugs
//   --dry-run        mostra os prompts sem chamar a API
//
// CUSTO APROXIMADO:
//   gemini-2.5-flash-image  · ~$0.039/imagem (1290 tokens × $30/M)
//   imagen-3.0-generate-002 · ~$0.04/imagem
//   → 18 imagens = ~$0.70 total em qualquer um
//
// SAÍDA: img/almanaque/{slug}.png · ~1-3 MB cada
// ============================================================

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'img', 'almanaque');
const PROMPTS_FILE = join(__dirname, 'almanaque-prompts.json');

// ─── Auto-carrega .env do root se existir (sem dep externa) ───
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  try {
    const txt = readFileSync(envFile, 'utf-8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) {
        let v = m[2];
        // strip optional quotes
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  } catch (_) {}
}

// ─── Parse args ───
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const ONLY = args.find(a => a.startsWith('--only='))?.slice(7)?.split(',') || null;
const MODEL = args.find(a => a.startsWith('--model='))?.slice(8) || 'gemini-2.5-flash-image';

// ─── API key ───
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY && !DRY_RUN) {
  console.error('\n❌ GEMINI_API_KEY não definida.');
  console.error('   Pegue em https://aistudio.google.com/apikey');
  console.error('   (precisa ter billing habilitado na conta AI Studio).');
  console.error('   Depois: export GEMINI_API_KEY="sua_key"\n');
  process.exit(1);
}

// ─── Detecta família do modelo (Gemini ou Imagen) e configura endpoint ───
const isImagen = MODEL.startsWith('imagen');
const isGeminiImg = MODEL.startsWith('gemini') && MODEL.includes('image');
if (!isImagen && !isGeminiImg) {
  console.error(`\n❌ Modelo desconhecido: ${MODEL}`);
  console.error(`   Suportados: gemini-2.5-flash-image · imagen-3.0-generate-002 · imagen-3.0-generate-001\n`);
  process.exit(1);
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const ENDPOINT = isImagen
  ? `${BASE}/${MODEL}:predict?key=${API_KEY}`
  : `${BASE}/${MODEL}:generateContent?key=${API_KEY}`;

// ─── Body builder por modelo ───
function buildBody(prompt) {
  if (isImagen) {
    return {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9',
        personGeneration: 'ALLOW_ADULT',
        safetyFilterLevel: 'BLOCK_ONLY_HIGH'
      }
    };
  }
  // Gemini 2.5 Flash Image
  return {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9' }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };
}

// ─── Extractor por modelo ───
function extractB64(json) {
  if (isImagen) {
    return json.predictions?.[0]?.bytesBase64Encoded;
  }
  // Gemini 2.5 Flash Image: candidates[0].content.parts[?].inlineData.data
  const parts = json.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.data);
  return imgPart?.inlineData?.data;
}

// ─── Carrega prompts ───
const prompts = JSON.parse(await readFile(PROMPTS_FILE, 'utf-8'));
await mkdir(OUT_DIR, { recursive: true });

const filtered = ONLY ? prompts.filter(p => ONLY.includes(p.slug)) : prompts;
if (ONLY && filtered.length === 0) {
  console.error(`Nenhum slug bateu com --only=${ONLY.join(',')}`);
  process.exit(1);
}

console.log(`\n🜐 ALMANAQUE · gerador de imagens`);
console.log(`Modelo: ${MODEL} (${isImagen ? 'Imagen via Gemini API' : 'Gemini nativo'})`);
console.log(`Saída : img/almanaque/`);
console.log(`Total : ${filtered.length} imagem${filtered.length === 1 ? '' : 's'}${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

let ok = 0, skipped = 0, failed = 0;

for (const p of filtered) {
  const outFile = join(OUT_DIR, `${p.slug}.png`);

  if (!FORCE && existsSync(outFile)) {
    const st = await stat(outFile);
    if (st.size > 1024) {
      console.log(`  ⏭  ${p.slug.padEnd(34)} já existe (${(st.size / 1024).toFixed(0)} KB) — use --force pra regerar`);
      skipped++;
      continue;
    }
  }

  if (DRY_RUN) {
    console.log(`\n  ▸ ${p.slug} (${p.year} · ${p.evento})`);
    console.log(`    ${p.prompt.slice(0, 200)}...`);
    continue;
  }

  process.stdout.write(`  → ${p.slug.padEnd(34)} `);
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody(p.prompt))
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`✗ HTTP ${resp.status}`);
      console.log(`    ${errBody.slice(0, 300)}`);
      failed++;
      continue;
    }

    const json = await resp.json();
    const b64 = extractB64(json);
    if (!b64) {
      console.log(`✗ sem bytes na resposta`);
      console.log(`    ${JSON.stringify(json).slice(0, 300)}`);
      failed++;
      continue;
    }

    await writeFile(outFile, Buffer.from(b64, 'base64'));
    const sz = (await stat(outFile)).size;
    console.log(`✓ ${(sz / 1024).toFixed(0)} KB`);
    ok++;

    // Rate limit polite (Gemini Flash Image: 10 RPM free tier; pago = 1000 RPM)
    await new Promise(r => setTimeout(r, 1200));
  } catch (e) {
    console.log(`✗ ${e.message}`);
    failed++;
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✓ gerados: ${ok}    ⏭  pulados: ${skipped}    ✗ falhas: ${failed}`);
console.log(`Imagens em: img/almanaque/`);
if (ok > 0) {
  console.log(`\nPróximos passos:`);
  console.log(`  1. Inspecionar as imagens visualmente`);
  console.log(`  2. (opcional) Converter pra WebP: sips -s format webp img/almanaque/*.png --out img/almanaque/`);
  console.log(`  3. git add img/almanaque/ && git commit && git push`);
}
console.log(``);
