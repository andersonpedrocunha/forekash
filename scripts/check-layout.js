#!/usr/bin/env node
/* Um </div> a mais dentro de um módulo fecha o <main class="main"> antes da
   hora. O navegador não reclama: ele só joga todos os módulos seguintes pra
   fora do .main, onde viram irmãos flex da sidebar — e aí o conteúdo aparece
   espremido e cortado à direita. Aconteceu em 04/09/2026: um </div> sobrando
   no Contador quebrou 12 módulos em produção.

   Aqui a checagem é direta: dentro de cada bloco <div class="mod" id="mod-…">,
   contar abre e fecha. Saldo diferente de zero é erro. */
const fs = require('fs');
const arq = process.argv[2] || 'index.html';
const s = fs.readFileSync(arq, 'utf8');

const re = /<div class="mod" id="(mod-[\w-]+)">/g;
const marcas = [];
let m;
while ((m = re.exec(s)) !== null) marcas.push({ id: m[1], i: m.index });

if (!marcas.length) {
  console.error('check-layout: nenhum <div class="mod" id="mod-…"> encontrado — o padrão mudou?');
  process.exit(1);
}

/* O último módulo termina no </main>; sem esse limite ele engoliria o resto do
   arquivo, inclusive as strings com <div> dentro do JS. */
const fimMain = s.indexOf('</main>', marcas[marcas.length - 1].i);
if (fimMain < 0) {
  console.error('check-layout: não achei o </main> depois do último módulo');
  process.exit(1);
}

const problemas = [];
marcas.forEach((mk, k) => {
  const fim = k + 1 < marcas.length ? marcas[k + 1].i : fimMain;
  const bloco = s.slice(mk.i, fim);
  const abre = (bloco.match(/<div\b/g) || []).length;
  const fecha = (bloco.match(/<\/div>/g) || []).length;
  if (abre !== fecha) {
    const linha = s.slice(0, mk.i).split('\n').length;
    problemas.push(`  ${mk.id} (linha ${linha}): ${abre} <div> para ${fecha} </div> · saldo ${abre - fecha}`);
  }
});

if (problemas.length) {
  console.error('FALHOU · <div> desbalanceado — os módulos seguintes vão sair do .main:');
  problemas.forEach(p => console.error(p));
  process.exit(1);
}
console.log(`OK · ${marcas.length} módulos com <div> balanceado`);
