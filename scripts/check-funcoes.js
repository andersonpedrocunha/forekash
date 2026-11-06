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
 *
 * 05/11/2026 — a versão antiga não entendia REGEX LITERAL. Num `/'/` ou
 * `/[^"]/` ela entrava em modo string e só saía na próxima aspas, centenas de
 * linhas depois. Dali pra frente lia código como string e string como código,
 * e acabou acusando o `/*` de dentro de `inp.accept = 'image/*,application/pdf'`
 * de engolir 14 funções que estavam vivas. Falso positivo apaga o alarme todo,
 * então agora o scanner é um tokenizador: string, template com ${}, regex,
 * comentário de linha e de bloco.
 */
const fs = require('fs');

const arquivo = process.argv[2] || 'index.html';
const html = fs.readFileSync(arquivo, 'utf8');
const blocos = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];

/* Depois destas palavras um `/` abre regex; depois de um identificador,
 * número, `)` ou `]` ele é divisão. */
const PALAVRAS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new',
  'delete', 'void', 'case', 'do', 'else', 'yield', 'await', 'throw']);

function abreRegex(tok) {
  if (tok === '') return true;              // começo do bloco
  if (/^[\w$]/.test(tok)) return PALAVRAS.has(tok);
  if (tok === ')' || tok === ']' || tok === '++' || tok === '--') return false;
  return true;                              // operador, vírgula, abre-bloco…
}

let achados = [];

for (const bloco of blocos) {
  const src = bloco[1];
  const linhaBase = html.slice(0, bloco.index).split('\n').length;
  const n = src.length;
  let i = 0;
  let tok = '';   // último token significativo

  /* Template literal: respeita ${…} aninhado, que pode conter outra string
   * ou outro template. Devolve o índice depois do backtick de fechamento. */
  function pularTemplate(p) {
    p++;                                     // o ` de abertura
    while (p < n) {
      if (src[p] === '\\') { p += 2; continue; }
      if (src[p] === '`') return p + 1;
      if (src[p] === '$' && src[p + 1] === '{') {
        let d = 1; p += 2;
        while (p < n && d > 0) {
          const ch = src[p];
          if (ch === '\\') { p += 2; continue; }
          if (ch === '`') { p = pularTemplate(p); continue; }
          if (ch === '"' || ch === "'") { p = pularString(p); continue; }
          if (ch === '{') d++;
          else if (ch === '}') d--;
          p++;
        }
        continue;
      }
      p++;
    }
    return n;
  }

  function pularString(p) {
    const q = src[p]; p++;
    while (p < n) {
      if (src[p] === '\\') { p += 2; continue; }
      if (src[p] === q) return p + 1;
      if (src[p] === '\n') return p;          // string não fecha em quebra de linha
      p++;
    }
    return n;
  }

  /* Regex literal: `/` não fecha dentro de [classe de caracteres]. */
  function pularRegex(p) {
    p++;
    let classe = false;
    while (p < n) {
      const ch = src[p];
      if (ch === '\\') { p += 2; continue; }
      if (ch === '\n') return p;              // não era regex
      if (classe) { if (ch === ']') classe = false; }
      else if (ch === '[') classe = true;
      else if (ch === '/') { p++; while (p < n && /[a-z]/.test(src[p])) p++; return p; }
      p++;
    }
    return n;
  }

  while (i < n) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

    if (c === '"' || c === "'") { i = pularString(i); tok = 'str'; continue; }
    if (c === '`') { i = pularTemplate(i); tok = 'str'; continue; }

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

    if (c === '/') {
      if (abreRegex(tok)) { i = pularRegex(i); tok = 'str'; continue; }
      tok = '/'; i++; continue;
    }

    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      tok = src.slice(i, j); i = j; continue;
    }

    if ((c === '+' || c === '-') && src[i + 1] === c) { tok = c + c; i += 2; continue; }

    tok = c; i++;
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
