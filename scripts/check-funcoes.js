#!/usr/bin/env node
/* Procura CÓDIGO ENGOLIDO POR COMENTÁRIO.
 *
 * Existe por causa de um `/*` que ficou sem fechar quando removi uma função:
 * tudo dali até o próximo `*​/` virou comentário e levou duas funções junto.
 * O arquivo seguia sintaticamente VÁLIDO — o validador do bump.sh passou — e a
 * tela quebrou em produção, com a exceção sumindo num catch mudo.
 *
 * Sintaxe válida não é o mesmo que código vivo. A checagem é direta: nenhum
 * comentário de bloco deve conter uma declaração de função em coluna zero.
 * Comentário legítimo explica o código; não contém o código.
 */
const fs = require('fs');

const arquivo = process.argv[2] || 'index.html';
const html = fs.readFileSync(arquivo, 'utf8');
const blocos = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];

let achados = [];

for (const bloco of blocos) {
  const src = bloco.group ? bloco.group(1) : bloco[1];
  const linhaBase = html.slice(0, bloco.index).split('\n').length;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    // string simples
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    // comentário de linha
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? n : nl;
      continue;
    }
    // comentário de bloco — o que interessa
    if (c === '/' && src[i + 1] === '*') {
      const fim = src.indexOf('*/', i + 2);
      const corpo = src.slice(i + 2, fim < 0 ? n : fim);
      const dentro = [...corpo.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
      if (dentro.length) {
        achados.push({
          linha: linhaBase + src.slice(0, i).split('\n').length - 1,
          funcoes: dentro,
          trecho: corpo.split('\n')[0].trim().slice(0, 70)
        });
      }
      i = fim < 0 ? n : fim + 2;
      continue;
    }
    i++;
  }
}

if (achados.length) {
  console.error('\n✗ código engolido por comentário:');
  for (const a of achados) {
    console.error('    linha ' + a.linha + ' · /* ' + a.trecho + ' …');
    console.error('      engoliu: ' + a.funcoes.join(', '));
  }
  console.error('\n  Um /* sem fechar consome tudo até o próximo */. Continua sintaxe');
  console.error('  válida, então o validador passa — e a função some em produção.\n');
  process.exit(1);
}
console.log('OK · nenhum comentário engolindo função');
