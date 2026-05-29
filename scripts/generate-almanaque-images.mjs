#!/usr/bin/env node
// ============================================================
// scripts/generate-almanaque-images.mjs
// ============================================================
// Gera as imagens do ALMANAQUE chamando o Imagen 3 da Gemini API.
//
// PREREQUISITOS:
//   1. Node 18+ (precisa de fetch nativo + ES modules)
//   2. Pegar API key em https://aistudio.google.com/apikey
//   3. export GEMINI_API_KEY="sua_key_aqui"
//
// USO:
//   node scripts/generate-almanaque-images.mjs
//
// FLAGS:
//   --force          regenera imagens que já existem
//   --only=slug,slug roda só esses slugs
//   --dry-run        mostra os prompts sem chamar a API
//
// CUSTO: ~$0.04 por imagem · 18 imagens = ~$0.72 total (Imagen 3 standard)
//
// SAÍDA: img/almanaque/{slug}.png · ~16:9 · ~1-3MB cada
// ============================================================

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'img', 'almanaque');
const PROMPTS_FILE = join(__dirname, 'almanaque-prompts.json');

// ─── Parse args ───
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const ONLY = args.find(a => a.startsWith('--only='))?.slice(7)?.split(',') || null;

// ─── API key ───
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY && !DRY_RUN) {
  console.error('\n❌ GEMINI_API_KEY não definida.');
  console.error('   Pegue em https://aistudio.google.com/apikey');
  console.error('   Depois: export GEMINI_API_KEY="sua_key"\n');
  process.exit(1);
}

// ─── Endpoint Imagen 3 ───
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`;

// ─── Carrega prompts ───
const prompts = JSON.parse(await readFile(PROMPTS_FILE, 'utf-8'));
await mkdir(OUT_DIR, { recursive: true });

const filtered = ONLY ? prompts.filter(p => ONLY.includes(p.slug)) : prompts;
if (ONLY && filtered.length === 0) {
  console.error(`Nenhum slug bateu com --only=${ONLY.join(',')}`);
  process.exit(1);
}

console.log(`\n🜐 ALMANAQUE · gerador de imagens`);
console.log(`Modelo: imagen-3.0-generate-002`);
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
      body: JSON.stringify({
        instances: [{ prompt: p.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9',
          personGeneration: 'ALLOW_ADULT',
          safetyFilterLevel: 'BLOCK_ONLY_HIGH'
        }
      })
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`✗ HTTP ${resp.status}`);
      console.log(`    ${errBody.slice(0, 200)}`);
      failed++;
      continue;
    }

    const json = await resp.json();
    const b64 = json.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) {
      console.log(`✗ sem bytes na resposta`);
      console.log(`    ${JSON.stringify(json).slice(0, 200)}`);
      failed++;
      continue;
    }

    await writeFile(outFile, Buffer.from(b64, 'base64'));
    const sz = (await stat(outFile)).size;
    console.log(`✓ ${(sz / 1024).toFixed(0)} KB`);
    ok++;

    // Rate limit polite delay (Imagen tem cota de QPM)
    await new Promise(r => setTimeout(r, 1500));
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
  console.log(`  2. (opcional) Converter pra WebP: 'sips -s format webp img/almanaque/*.png'`);
  console.log(`  3. git add img/almanaque/ && git commit && git push`);
}
console.log(``);
